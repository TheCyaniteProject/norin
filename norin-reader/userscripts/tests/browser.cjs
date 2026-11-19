/* Local Chrome regression suite. No network packages or real account required.
   Run: node userscripts/tests/browser.cjs (CHROME may override the executable). */
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'norin-browser-'));
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
class CDP {
  constructor(url){
    this.socket=new WebSocket(url);this.id=0;this.pending=new Map();
    this.open=new Promise((resolve,reject)=>{this.socket.addEventListener('open',resolve,{once:true});this.socket.addEventListener('error',reject,{once:true});});
    this.socket.addEventListener('message',event=>{
      const message=JSON.parse(String(event.data));
      if(message.id){const promise=this.pending.get(message.id);if(!promise)return;this.pending.delete(message.id);message.error?promise.reject(new Error(JSON.stringify(message.error))):promise.resolve(message.result);}
    });
  }
  async call(method,params={},sessionId){
    await this.open;const id=++this.id;
    return new Promise((resolve,reject)=>{this.pending.set(id,{resolve,reject});this.socket.send(JSON.stringify({id,method,params,sessionId}));});
  }
  async evaluate(expression,sessionId){
    const result=await this.call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},sessionId);
    if(result.exceptionDetails)throw new Error(result.exceptionDetails.exception?.description||JSON.stringify(result.exceptionDetails));
    return result.result.value;
  }
}
function fixture(){
  let script=fs.readFileSync(path.resolve(__dirname,'../norin-everywhere.user.js'),'utf8');
  script=script.replace("GM_registerMenuCommand('Toggle Norin / English',toggle);",'window.norinTest={renderInto,fontCodes,normalizeText,wordPlan,templates,textNodes,controls,toggle,renderCSS};');
  const font=fs.readFileSync(path.join(__dirname,'fixtures/Norin.ttf')).toString('base64');
  return `<!doctype html><meta charset="utf-8"><style>body{font:20px Arial}p{line-height:40px}</style>
  <p id="text">Hello world! 123 — &lt; &gt; 😀</p><p><a id="url">https://example.com</a></p><code id="code">hello world</code>
  <p id="small" style="font-size:12px">small words</p><p id="large" style="font-size:24px">large words</p><div id="smallEditor" contenteditable="true" style="font-size:10px">small editor</div>
  <textarea id="input" style="font-size:12px">hello world</textarea><div id="editor" contenteditable="true">hello world</div>
  <script>window.errors=[];addEventListener('error',e=>errors.push(e.message));addEventListener('unhandledrejection',e=>errors.push(String(e.reason)));
  GM_xmlhttpRequest=o=>{window.request={url:o.url,type:o.responseType};const bytes=Uint8Array.from(atob('${font}'),c=>c.charCodeAt(0));setTimeout(()=>o.onload({status:200,response:bytes.buffer}),0)};</script><script>${script}</script>`;
}
async function main(){
  const html=path.join(temporary,'fixture.html');fs.writeFileSync(html,fixture());
  const chrome=spawn(process.env.CHROME||'google-chrome',['--headless','--no-sandbox','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=0',`--user-data-dir=${path.join(temporary,'profile')}`,'about:blank'],{stdio:['ignore','ignore','pipe']});
  let diagnostics='';chrome.stderr.on('data',chunk=>{diagnostics+=chunk;});
  const deadline=Date.now()+10000;
  while(!/DevTools listening on (ws:\/\/[^\s]+)/.test(diagnostics)){if(Date.now()>deadline||chrome.exitCode!==null)throw new Error(diagnostics);await delay(20);}
  const client=new CDP(diagnostics.match(/DevTools listening on (ws:\/\/[^\s]+)/)[1]);
  try{
    const target=await client.call('Target.createTarget',{url:'about:blank'});
    const {sessionId}=await client.call('Target.attachToTarget',{targetId:target.targetId,flatten:true});
    await client.call('Emulation.setDeviceMetricsOverride',{width:1400,height:900,deviceScaleFactor:1,mobile:false},sessionId);
    await client.call('Page.enable',{},sessionId);

    await client.call('Page.navigate',{url:'file://'+html},sessionId);
    for(let i=0;i<100;i++){if(await client.evaluate('!!window.norinTest',sessionId))break;await delay(30);}
    assert.equal(await client.evaluate('!!window.norinTest',sessionId),true,'font loads and startup completes');
    const result=await client.evaluate(`(()=>{
      const t=norinTest,render=(text,opts={})=>{const node=document.createElement('div');t.renderInto(node,text,{alreadyNormalized:true,readerMode:true,...opts});return node};
      const codes=node=>Array.from(node.textContent,c=>c.codePointAt(0));
      const all=Object.entries(t.fontCodes).every(([key,entry])=>codes(render(key))[0]===entry.code);
      const block=codes(render('bdf'));const accented=codes(render('ba'));
      const literal='123 — “ ” … < > / : ; | 😀 é 漢字';
      const untouched=render(literal).textContent===literal;
      const style=t.renderCSS;
      const measured=document.createElement('div');measured.style.cssText='font:20px Arial';const sample=render('bdf');measured.append(sample);document.querySelector('#norin-userscript-layer').shadowRoot.append(measured);
      const glyph=sample.querySelector('.norin-character');const font=getComputedStyle(glyph).fontFamily;measured.remove();
      return {all,block,accented,untouched,font,normalization:t.normalizeText('“hello”—world… 123'),yTranslations:['boy','boys','toys','days','keys','happy','yes','yard','beyond'].map(word=>t.normalizeText(word)),mouthTranslations:['write','writing','have','said','says','does','was','were','giant','gym','gentle','magic','engine','danger','orange','large','change','get','give','girl','gear','hope','boat','comb'].map(word=>t.normalizeText(word)),original:document.querySelector('#text').textContent,
        request,errors,noSVG:[...t.templates.values()].filter(t=>t.ready).every(t=>!t.node.querySelector('svg,img')),fontRange:[...document.fonts].find(f=>f.family==='NorinEverywhere')?.unicodeRange,
        noPlacement:!style.includes('punct-')&&!style.includes('sinogram'),urlTracked:!!t.textNodes.get(document.querySelector('#url').firstChild)?.words.length,codeTracked:t.textNodes.has(document.querySelector('#code').firstChild)};
    })()`,sessionId);
    assert.equal(result.all,true);assert.deepEqual(result.block,[0xe02c,0xe030,0xe034]);assert.deepEqual(result.accented,[0xe02c,0xe003]);
    assert.deepEqual(result.yTranslations,['boi','bois','tois','dais','keis','hapi','yes','yard','beyond']);
    assert.deepEqual(result.mouthTranslations,['rit','riting','hav','sed','sez','duz','wuz','wur','jiant','jym','jentle','majik','enjine','danjer','oranje','larje','chanje','get','give','girl','gear','hope','boat','komb']);
    assert.equal(result.untouched,true);assert.equal(result.font,'NorinEverywhere');assert.equal(result.normalization,'“helo”—world… 123');
    assert.equal(result.original,'Hello world! 123 — < > 😀');assert.equal(result.request.type,'arraybuffer');assert.match(result.fontRange,/E000-E061/i);
    assert.deepEqual(result.errors,[]);assert.equal(result.noSVG,true);assert.equal(result.noPlacement,true);assert.equal(result.urlTracked,false);assert.equal(result.codeTracked,false);
    await delay(300);
    assert.ok(await client.evaluate("CSS.highlights.get('norin-original')?.size>0",sessionId),'overlays hide original text');
    const sizes=await client.evaluate(`(()=>{
      const size=id=>{const record=norinTest.textNodes.get(document.getElementById(id).firstChild);return parseFloat(getComputedStyle(record.words[0].glyph).fontSize)};
      return {small:size('small'),large:size('large'),editor:size('smallEditor'),input:parseFloat(getComputedStyle(norinTest.controls.get(document.querySelector('#input')).view.mirror).fontSize),original:getComputedStyle(document.querySelector('#small')).fontSize};
    })()`,sessionId);
    assert.deepEqual(sizes,{small:18,large:24,editor:18,input:18,original:'12px'});
    await client.evaluate("const input=document.querySelector('#input');input.value='new words!';input.dispatchEvent(new Event('input',{bubbles:true}));",sessionId);await delay(200);
    assert.equal(await client.evaluate("norinTest.controls.get(document.querySelector('#input')).value",sessionId),'new words!');
    await client.evaluate('norinTest.toggle()',sessionId);assert.equal(await client.evaluate("CSS.highlights.has('norin-original')",sessionId),false);
    await client.evaluate('norinTest.toggle()',sessionId);await delay(200);
    const screenshot=await client.call('Page.captureScreenshot',{format:'png'},sessionId);fs.writeFileSync(path.join(temporary,'preview.png'),Buffer.from(screenshot.data,'base64'));
    console.log('Font mappings, variants, accents, symbols, font isolation, overlays, controls, exclusions and toggle: passed');
    console.log('Preview: '+path.join(temporary,'preview.png'));
  }finally{client.socket.close();chrome.kill();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
