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
  script=script.replace("GM_registerMenuCommand('Toggle Norin / English',toggle);",'window.norinTest={renderInto,fontCodes,normalizeText,wordPlan,templates,textNodes,controls,toggle,renderCSS,recoverViewport,controlParts,CLASS_EXCLUSIONS,excludedClass};');
  const font=fs.readFileSync(path.join(__dirname,'fixtures/Norin.ttf')).toString('base64');
  return `<!doctype html><meta charset="utf-8"><style>body{font:20px Arial}p{line-height:40px}</style>
  <p id="text" style="margin-left:240px;margin-top:70px">Hello world! 123 — &lt; &gt; 😀</p><p><a id="url">https://example.com</a></p><code id="code">hello world</code>
  <p id="mentions">hello @someone @User.Name username@mail.com world</p><a id="mentionLink" href="https://example.com"><span>@</span><span>Someone</span></a>
  <div><span id="discordDisplay">Shy</span><span id="discordUsername" class="userTagUsername_C2XpHA body-sm/normal_RAOoio">shyguy1412</span></div>
  <span id="genericUsername" class="Username_random">someone</span><span id="userTagOnly" class="UserTag_random">Shy</span>
  <input id="accountField" name="userNAME" value="someone"><input id="loginField" autocomplete="section-login username" value="someone"><input id="secretField" type="password" value="secret"><input id="newSecretField" autocomplete="new-password" value="secret"><input id="dynamicAccount" value="someone">
  <div class="usernameAndPronounsRow_C2XpHA"><span id="nestedUsername" class="userTagUsername_random">accountname</span><span class="pronounsTooltip_C2XpHA"><span id="pronouns" class="pronouns_C2XpHA userTag_C2XpHA">Follower of Perfect-Cell</span></span></div>
  <span class="applicationSublabel_nByiE3"><span id="applicationSublabel">application details</span></span>
  <input id="compactSearch" type="search" placeholder="Search" style="position:fixed;top:10px;left:1000px;width:220px;height:40px;box-sizing:border-box;border:1px solid #777;padding:0 12px 0 36px;font:14px Arial">
  <input id="tallSearch" placeholder="Search" style="position:fixed;top:60px;left:1000px;width:220px;height:44px;box-sizing:border-box;border:1px solid #777;padding:0 12px 0 36px;font:14px/40px Arial">
  <div id="stackScene" style="position:fixed;left:900px;top:150px;width:400px;height:80px"><p id="stackBackground" style="margin:0">background text</p><div id="stackPopup" role="dialog" style="display:none;position:absolute;inset:0;z-index:5;background:#333"><p id="stackPopupText">popup text</p></div></div>
  <div class="react-code-file-contents"><div class="react-code-line-contents"><span id="excludedCodePreview">file content</span></div></div>
  <div style="position:fixed;left:1000px;top:270px;font:12px Arial"><a id="commitHash" href="/commit/ece01e9" style="display:inline-block;width:25px">ece01e9</a> - <native-label id="commitTime"></native-label></div><p id="hexWords">hello ece01e9 abc1234 world</p>
  <h2 id="prefixHeading" style="font:40px Arial;margin-left:120px">1 - A bad title</h2>
  <p id="small" style="font-size:12px">small words</p><p id="large" style="font-size:24px">large words</p><div id="smallEditor" contenteditable="true" style="font-size:10px">small editor</div>
  <textarea id="input" style="font-size:12px">hello world</textarea><div id="editor" contenteditable="true">hello world</div>
  <div id="scrollPanel" style="position:fixed;left:800px;top:400px;width:400px;height:180px;overflow:auto">${Array.from({length:200},(_,i)=>`<p id="scrollRow${i}" style="height:60px;margin:0">scroll message ${i}</p>`).join('')}</div>
  <script>document.querySelector('#commitTime').attachShadow({mode:'open'}).textContent='2 minutes ago';window.errors=[];addEventListener('error',e=>errors.push(e.message));addEventListener('unhandledrejection',e=>errors.push(String(e.reason)));
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
    const selectionPositions=await client.evaluate(`(async()=>{
      const pause=()=>new Promise(r=>setTimeout(r,100));
      const source=document.querySelector('#text').firstChild,selection=getSelection();
      const word=()=>norinTest.textNodes.get(source).words[0];
      const position=()=>{const r=word().glyph.getBoundingClientRect();return {x:r.x,y:r.y}};
      const before=position();let hidden=true,revealed=true,stable=true;
      for(let i=0;i<3;i++){
        const range=document.createRange();range.setStart(source,0);range.setEnd(source,5);selection.removeAllRanges();selection.addRange(range);await pause();
        hidden&&=getComputedStyle(word().glyph).visibility==='hidden'||getComputedStyle(word().glyph.getRootNode().host).display==='none';
        revealed&&=![...(CSS.highlights.get('norin-original')||[])].some(r=>r.startContainer===source);
        // A resize/scroll reconciliation while selected must still measure the real anchor.
        window.dispatchEvent(new Event('resize'));norinTest.recoverViewport();await pause();
        selection.removeAllRanges();await pause();
        const after=position();stable&&=Math.abs(after.x-before.x)<.5&&Math.abs(after.y-before.y)<.5;
      }
      return {hidden,revealed,stable};
    })()`,sessionId);
    assert.deepEqual(selectionPositions,{hidden:true,revealed:true,stable:true},'selection must not move overlays after a hidden relayout');
    const prefixPosition=await client.evaluate(`(async()=>{
      const heading=document.querySelector('#prefixHeading'),source=heading.firstChild;
      const record=norinTest.textNodes.get(source),selection=getSelection();
      const range=document.createRange();range.setStart(source,4);range.setEnd(source,5);
      const nativeX=range.getBoundingClientRect().left;
      const first=()=>record.words.find(w=>w.text==='A');
      const initialX=first().box.getBoundingClientRect().left;
      const prefixNative=record.words.filter(w=>w.text==='1'||w.text==='-').every(w=>!w.box?.isConnected);
      selection.removeAllRanges();selection.addRange(range);await new Promise(r=>setTimeout(r,100));
      window.dispatchEvent(new Event('resize'));await new Promise(r=>setTimeout(r,100));
      selection.removeAllRanges();await new Promise(r=>setTimeout(r,100));
      return {prefixNative,aligned:Math.abs(initialX-nativeX)<.5,stable:Math.abs(first().box.getBoundingClientRect().left-nativeX)<.5};
    })()`,sessionId);
    assert.deepEqual(prefixPosition,{prefixNative:true,aligned:true,stable:true});
    const editing=await client.evaluate(`(async()=>{
      const pause=()=>new Promise(r=>setTimeout(r,150));
      const input=document.querySelector('#input');input.focus();input.setSelectionRange(2,2);input.dispatchEvent(new Event('select',{bubbles:true}));await pause();
      const view=norinTest.controls.get(input).view;
      const control=!!view.customCaret&&view.items.some(item=>item.t?.editing&&item.t.ready)&&view.caretElement?.isConnected;
      const editor=document.querySelector('#editor');editor.focus();getSelection().setPosition(editor.firstChild,2);await pause();
      const group=norinTest.textNodes.get(editor.firstChild).group;
      const contenteditable=!!group.caretState?.bar.isConnected&&group.caretState.offset===2;
      getSelection().removeAllRanges();editor.blur();await pause();
      return {control:!!control,contenteditable};
    })()`,sessionId);
    assert.deepEqual(editing,{control:true,contenteditable:true},'text templates support both input and contenteditable caret segments');
    const caretStyles=await client.evaluate(`(async()=>{
      const pause=()=>new Promise(r=>setTimeout(r,150));
      const input=document.querySelector('#input'),editor=document.querySelector('#editor');
      input.style.caretColor='rgb(160, 40, 220)';input.style.setProperty('caret-animation','manual');input.style.setProperty('caret-shape','underscore');
      const originalInputStyle=input.getAttribute('style');
      input.focus();input.setSelectionRange(2,2);input.dispatchEvent(new Event('select',{bubbles:true}));await pause();
      const bar=()=>norinTest.controls.get(input).view.caretElement;
      const initial=getComputedStyle(bar()).backgroundColor;
      const manual=!CSS.supports('caret-animation','manual')||getComputedStyle(bar()).animationName==='none';
      const shape=!CSS.supports('caret-shape','underscore')||getComputedStyle(bar()).height==='1px';
      const untouched=input.getAttribute('style')===originalInputStyle;
      input.style.caretColor='rgb(220, 90, 30)';await pause();
      const updated=getComputedStyle(bar()).backgroundColor;
      norinTest.toggle();await pause();
      const restored=getComputedStyle(input).caretColor; norinTest.toggle();await pause();
      editor.style.caretColor='rgb(10, 180, 100)';editor.focus();getSelection().setPosition(editor.firstChild,2);await pause();
      const group=norinTest.textNodes.get(editor.firstChild).group;
      const inherited=getComputedStyle(group.caretElement).backgroundColor;
      window.dispatchEvent(new Event('resize'));await pause();
      const afterRedraw=getComputedStyle(group.caretElement).backgroundColor;
      getSelection().removeAllRanges();editor.blur();await pause();
      return {initial,updated,restored,inherited,afterRedraw,manual,shape,untouched};
    })()`,sessionId);
    assert.deepEqual(caretStyles,{initial:'rgb(160, 40, 220)',updated:'rgb(220, 90, 30)',restored:'rgb(220, 90, 30)',inherited:'rgb(10, 180, 100)',afterRedraw:'rgb(10, 180, 100)',manual:true,shape:true,untouched:true});
    const mentions=await client.evaluate(`(async()=>{
      const source=document.querySelector('#mentions').firstChild;
      const words=norinTest.textNodes.get(source).words;
      const page=words.every(w=>!w.text.includes('@'))&&words.some(w=>w.text==='hello')&&words.some(w=>w.text==='world');
      const link=[...document.querySelector('#mentionLink').childNodes].every(span=>!norinTest.textNodes.get(span.firstChild)?.words.length);
      const parts=norinTest.controlParts('hello @someone @User.Name username@mail.com world');
      const input=document.querySelector('#input');input.value='hello username@mail.com world';input.dispatchEvent(new Event('input',{bubbles:true}));await new Promise(r=>setTimeout(r,150));
      const item=norinTest.controls.get(input).view.items.find(item=>item.text==='username@mail.com');
      return {page,link,parts:parts.filter(p=>p.text.includes('@')).every(p=>p.plain),control:!!item?.plain&&item.node.textContent==='username@mail.com',source:source.data};
    })()`,sessionId);
    assert.deepEqual(mentions,{page:true,link:true,parts:true,control:true,source:'hello @someone @User.Name username@mail.com world'});
    const discordNames=await client.evaluate(`(()=>{
      const username=document.querySelector('#discordUsername'),display=document.querySelector('#discordDisplay');
      return {username:!norinTest.textNodes.get(username.firstChild)?.words.length,display:!!norinTest.textNodes.get(display.firstChild)?.words[0]?.box?.isConnected,
        generic:!norinTest.textNodes.get(document.querySelector('#genericUsername').firstChild)?.words.length,tag:!!norinTest.textNodes.get(document.querySelector('#userTagOnly').firstChild)?.words[0]?.box?.isConnected};
    })()`,sessionId);
    assert.deepEqual(discordNames,{username:true,display:true,generic:true,tag:true});
    const nestedNames=await client.evaluate(`(async()=>{
      const pronouns=document.querySelector('#pronouns'),account=document.querySelector('#nestedUsername');
      const translated=()=>!!norinTest.textNodes.get(pronouns.firstChild)?.words.some(w=>w.box?.isConnected);
      const initially=translated(),accountExcluded=!norinTest.textNodes.get(account.firstChild)?.words.length;
      pronouns.classList.add('Username_direct');await new Promise(r=>setTimeout(r,150));
      const directExcluded=!translated();
      pronouns.classList.remove('Username_direct');await new Promise(r=>setTimeout(r,150));
      return {initially,accountExcluded,directExcluded,restored:translated()};
    })()`,sessionId);
    assert.deepEqual(nestedNames,{initially:true,accountExcluded:true,directExcluded:true,restored:true});
    assert.equal(await client.evaluate("norinTest.textNodes.has(document.querySelector('#applicationSublabel').firstChild)",sessionId),false);
    const configurableClasses=await client.evaluate(`(()=>{
      const node=document.createElement('span');node.className='ExactClass';
      const rules=norinTest.CLASS_EXCLUSIONS;
      rules.push('ExactClass',/^regexClass_[a-z]+$/i,/globalClass/g);
      try{
        const exact=norinTest.excludedClass(node);node.className='exactclass';const sensitive=!norinTest.excludedClass(node);
        node.className='REGEXCLASS_abc';const regex=norinTest.excludedClass(node);
        node.className='globalClass';const repeat=norinTest.excludedClass(node)&&norinTest.excludedClass(node);
        return {exact,sensitive,regex,repeat};
      }finally{rules.splice(-3);}
    })()`,sessionId);
    assert.deepEqual(configurableClasses,{exact:true,sensitive:true,regex:true,repeat:true});
    assert.equal(await client.evaluate("norinTest.textNodes.has(document.querySelector('#excludedCodePreview').firstChild)",sessionId),false);
    const fields=await client.evaluate(`(async()=>{
      const excluded=['accountField','loginField','secretField','newSecretField'].every(id=>!norinTest.controls.has(document.getElementById(id)));
      const input=document.querySelector('#dynamicAccount'),initial=norinTest.controls.has(input);
      input.autocomplete='username';await new Promise(r=>setTimeout(r,150));
      const removed=!norinTest.controls.has(input)&&!input.hasAttribute('data-norin-input');
      input.autocomplete='off';await new Promise(r=>setTimeout(r,150));
      return {excluded,initial,removed,restored:norinTest.controls.has(input)};
    })()`,sessionId);
    assert.deepEqual(fields,{excluded:true,initial:true,removed:true,restored:true});
    const searchAlignment=await client.evaluate(`(()=>{
      return ['compactSearch','tallSearch'].map(id=>{
        const input=document.getElementById(id),view=norinTest.controls.get(input).view,item=view.items.find(item=>item.t);
        const inputRect=input.getBoundingClientRect(),glyphRect=item.glyph.getBoundingClientRect(),cs=getComputedStyle(input),size=parseFloat(getComputedStyle(item.glyph).fontSize);
        const actualCenter=glyphRect.top+(item.t.inkTop+item.t.inkBottom)*size/2;
        const expectedCenter=inputRect.top+input.clientTop+input.clientHeight/2+(parseFloat(cs.paddingTop)-parseFloat(cs.paddingBottom))/2;
        return {id,centered:Math.abs(actualCenter-expectedCenter)<1,left:Math.abs(glyphRect.left-inputRect.left-input.clientLeft-parseFloat(cs.paddingLeft))<1};
      });
    })()`,sessionId);
    assert.deepEqual(searchAlignment,[{id:'compactSearch',centered:true,left:true},{id:'tallSearch',centered:true,left:true}]);
    const popupStacking=await client.evaluate(`(async()=>{
      const background=document.querySelector('#stackBackground').firstChild;
      const word=norinTest.textNodes.get(background).words[0],before=word.box.getBoundingClientRect();
      const popup=document.querySelector('#stackPopup');popup.style.display='block';await new Promise(r=>setTimeout(r,200));
      // Temporarily allow hit testing to inspect browser paint order of the overlay.
      const old=word.box.style.pointerEvents;word.box.style.pointerEvents='auto';
      const hit=document.elementFromPoint(before.left+2,before.top+before.height/2);
      const covered=hit===popup||popup.contains(hit);word.box.style.pointerEvents=old;
      const popupTranslated=!!norinTest.textNodes.get(document.querySelector('#stackPopupText').firstChild)?.words[0]?.box?.isConnected;
      popup.style.display='none';await new Promise(r=>setTimeout(r,150));
      const after=word.box.getBoundingClientRect();
      return {covered,popupTranslated,stable:Math.abs(before.left-after.left)<.5&&Math.abs(before.top-after.top)<.5};
    })()`,sessionId);
    assert.deepEqual(popupStacking,{covered:true,popupTranslated:true,stable:true});
    const nativeNeighbor=await client.evaluate(`(()=>{
      const hash=document.querySelector('#commitHash'),word=norinTest.textNodes.get(hash.firstChild).words[0];
      const glyph=word.box.getBoundingClientRect(),native=document.querySelector('#commitTime').getBoundingClientRect();
      return {translated:word.box.isConnected,noOverlap:glyph.right<=native.left,timestamp:document.querySelector('#commitTime').shadowRoot.textContent};
    })()`,sessionId);
    assert.deepEqual(nativeNeighbor,{translated:true,noOverlap:true,timestamp:'2 minutes ago'});
    const scrolling=await client.evaluate(`(async()=>{
      const waitFor=async fn=>{for(let i=0;i<150;i++){if(fn())return;await new Promise(r=>setTimeout(r,20));}throw Error('scroll rendering timed out')};
      const word=i=>norinTest.textNodes.get(document.querySelector('#scrollRow'+i).firstChild)?.words[0];
      await waitFor(()=>word(15)?.box?.isConnected);
      const ahead=word(15).box,first=word(0).box;
      const panel=document.querySelector('#scrollPanel');panel.scrollTop=900;
      await new Promise(r=>setTimeout(r,200));
      // Settled-scroll recovery must preserve the same buffer as the observer.
      norinTest.recoverViewport();await new Promise(r=>setTimeout(r,100));
      const retained=first.isConnected&&word(15).box===ahead&&ahead.isConnected;
      panel.scrollTop=0;await new Promise(r=>setTimeout(r,200));
      const reused=word(0).box===first&&first.isConnected;
      panel.scrollTop=9000;
      await waitFor(()=>word(150)?.box?.isConnected);
      await new Promise(r=>setTimeout(r,200));
      return {retained,reused,distantCulled:!first.isConnected,visibleReady:word(150).box.isConnected,source:document.querySelector('#scrollRow150').firstChild.data};
    })()`,sessionId);
    assert.deepEqual(scrolling,{retained:true,reused:true,distantCulled:true,visibleReady:true,source:'scroll message 150'});
    await client.evaluate('norinTest.toggle()',sessionId);assert.equal(await client.evaluate("CSS.highlights.has('norin-original')",sessionId),false);
    await client.evaluate('norinTest.toggle()',sessionId);await delay(200);
    const screenshot=await client.call('Page.captureScreenshot',{format:'png'},sessionId);fs.writeFileSync(path.join(temporary,'preview.png'),Buffer.from(screenshot.data,'base64'));
    console.log('Font mappings, variants, accents, symbols, font isolation, overlays, controls, exclusions, toggle and buffered scrolling: passed');
    console.log('Preview: '+path.join(temporary,'preview.png'));
  }finally{client.socket.close();chrome.kill();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
