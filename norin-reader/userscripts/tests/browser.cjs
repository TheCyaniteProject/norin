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
  const mappings=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../public/mappings.json'),'utf8'));
  assert.deepEqual(JSON.parse(script.match(/const bundledMappings = ([\s\S]*?);\nconst defaultReplacements/)[1]).replacements,mappings.replacements);
  script=script.replace('function processText(group){','function processText(group){window.stats.text++;window.stats.scopes.push(group.element.id);');
  script=script.replace('function processControl(group){','function processControl(group){window.stats.controls++;');
  script=script.replace('function normalizeText(text) {','function normalizeText(text) {window.stats.normalizations++;');
  script=script.replace('function renderInto(target, rawText, opts = {}) {','function renderInto(target, rawText, opts = {}) {window.stats.conversions++;');
  script=script.replace('el.style[key]=value;changed=true;', 'el.style[key]=value;changed=true;window.stats.writes++;');
  script=script.replace('if(dirtyRecords.size)schedule();', 'window.stats.flushMs.push(performance.now()-started);if(dirtyRecords.size)schedule();');
  script=script.replace("GM_registerMenuCommand('Toggle Norin / English',toggle);",`window.norinTest={textNodes,scopes,controls,activeRecords,dirtyRecords,templates,shapes,detachedViews,LIMITS,mounts,dirty,flush,updateSelection,toggle,trimViews,shapeFor,wordPlan,spellings,cellInk,GLYPH_SCALE,emojiRecords,activeRecords,recoverViewport,sourceAlignment,normalizedCaret,readCaret,queueCaretUpdate,renderCSS,get pending(){return pending}};`);
  const glyphDir=process.env.NORIN_TEST_GLYPHS;
  const glyphs=glyphDir?Object.fromEntries(fs.readdirSync(glyphDir).filter(f=>f.endsWith('.svg')).map(f=>[f,fs.readFileSync(path.join(glyphDir,f),'utf8')])):{};
  const glyphJSON=JSON.stringify(glyphs).replace(/</g,'\\u003c');
  const text='Boom. Full Norin support for Chrome in about 20 minutes';
  const rows=Array.from({length:1000},(_,i)=>`<p id="m${i}">${text}</p>`).join('');
  return `<!doctype html><meta charset="utf-8"><style>
  body{margin:0;background:#313338;color:#eee;font:18px Arial}#messages{position:relative;width:1000px;height:420px;overflow:auto}#messages p{margin:0;line-height:36px;white-space:nowrap}
  #composer{position:fixed;left:0;bottom:0;width:600px;height:60px}#input{position:fixed;left:620px;bottom:0;width:250px;height:60px}
  #labels{font:18px Arial}#labels>span,#labels>a{margin-right:20px}#control{position:fixed;left:1000px;top:0}#editor{position:fixed;left:0;bottom:90px;min-height:24px;width:800px}
  </style><div id="messages">${rows}</div><div id="labels"><a id="label" href="https://example.com">Rocket bunny</a><a id="url" href="https://example.com"><span>https://</span><span>example.com</span></a><span id="plainURL">https://example.com</span><span id="hidden" style="visibility:hidden">AM</span><span id="opacity" style="opacity:0">hidden time</span></div><div id="editor" contenteditable="true" role="textbox" data-slate-editor="true">hello English composer</div><textarea id="composer">hello world</textarea><input id="input" value="English typing"><p id="control">fixed words</p><div id="codeTests"><p id="inlineTicks">hello &#96;const value = true&#96; world</p><p id="splitTicks"><span>hello &#96;</span><em id="splitCode">split value</em><span>&#96; world</span></p><pre id="preCode">const hello = true;</pre><p><code id="inlineCode">hello code</code></p><div contenteditable="true" id="fenceRoot"><div>&#96;&#96;&#96;js</div><div id="fenceCode">hello code</div><div>&#96;&#96;&#96;</div><div id="afterFence">hello</div></div><div id="tightName" style="height:18px;line-height:18px;overflow:hidden;font-size:14px;width:200px">rocket bunny</div><p id="shortLine">hello</p></div><p id="spacingMessage" style="position:fixed;left:0;top:730px;font:18px Arial;line-height:28px;white-space:nowrap">Let's see if I can one-shot a Tampermonkey script to do this for chrome instead of needing to actually vibecode</p><div id="dynamicPanel" style="position:fixed;left:1050px;top:330px;width:320px;height:350px;overflow:auto;font:18px Arial"><article id="tailEmoji" style="height:45px;line-height:32px">hello world <img id="tailFace" class="emoji" alt="😀" width="24" height="24" style="vertical-align:middle" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24'%3E%3Ccircle cx='12' cy='12' r='11' fill='gold'/%3E%3C/svg%3E"></article><article id="middleEmoji" style="height:45px;line-height:32px">hello <span id="emojiWrap" style="display:inline-block;overflow:hidden;width:24px;height:24px;vertical-align:middle"><img id="middleFace" class="emoji" alt="😀" width="24" height="24" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24'%3E%3Ccircle cx='12' cy='12' r='11' fill='gold'/%3E%3C/svg%3E"></span> world</article><article id="inlineClipCase"><span id="inlineClip" style="display:inline;overflow:hidden">inline clipping text</span></article><img id="avatarCase" class="avatar" alt="emoji user" width="24" height="24"><img id="attachmentCase" class="attachment" alt="😀" width="24" height="24"></div><div id="reuseCases" style="position:fixed;left:1050px;top:100px;width:300px"><p id="couldPair">Could could</p><p id="otherCould">could</p><p id="redCould" style="color:red">could</p><p id="capitalCases">bA ba COULD could</p></div><script>
  window.glyphFixtures=${glyphJSON};
  window.stats={text:0,controls:0,conversions:0,normalizations:0,writes:0,scopes:[],flushMs:[]};window.errors=[];window.addEventListener('error',e=>errors.push(e.message));window.addEventListener('unhandledrejection',e=>errors.push(String(e.reason)));
  GM_xmlhttpRequest=o=>setTimeout(()=>o.onload({status:200,responseText:window.glyphFixtures[o.url.split('/').pop()]||'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 210 297"><path d="'+(o.url.includes('_l.svg')?'M90 130L120 130':'M40 40L170 250M170 40L40 250')+'"/></svg>'}),0);
  </script><script>${script}</script>`;
}
async function benchmark(client,sessionId){
  const sources=[];
  if(process.env.NORIN_BASELINE)sources.push(['baseline',process.env.NORIN_BASELINE]);
  sources.push(['current',path.resolve(__dirname,'../norin-everywhere.user.js')]);
  const results={};
  for(const [name,sourcePath]of sources){
    const source=fs.readFileSync(sourcePath,'utf8');
    const rows=Array.from({length:1000},(_,i)=>`<p>${i+1} Boom. Full Norin support for Chrome in about 20 minutes</p>`).join('');
    const html=`<!doctype html><style>body{margin:0;background:#313338;color:#eee;font:18px Arial}#scroll{height:480px;width:1000px;overflow:auto;position:relative}p{margin:0;line-height:36px;white-space:nowrap}</style><div id="scroll">${rows}</div><script>
      window.failures=[];window.addEventListener('error',e=>failures.push(e.message));window.ready=false;window.longTasks=[];
      new PerformanceObserver(list=>longTasks.push(...list.getEntries().map(e=>e.duration))).observe({type:'longtask',buffered:true});
      window.GM_registerMenuCommand=()=>{window.ready=true};window.GM_xmlhttpRequest=o=>setTimeout(()=>o.onload({status:200,responseText:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M10 10L90 90M90 10L10 90"/></svg>'}),0);
      </script><script>${source}</script>`;
    const file=path.join(temporary,`benchmark-${name}.html`);fs.writeFileSync(file,html);
    await client.call('Page.navigate',{url:'file://'+file},sessionId);
    for(let i=0;i<100;i++){if(await client.evaluate('!!window.ready',sessionId))break;await delay(30);}
    await delay(700);
    results[name]=await client.evaluate(`(async()=>{
      const scroller=document.querySelector('#scroll');const frames=[];
      for(let i=0;i<120;i++)await new Promise(resolve=>requestAnimationFrame(time=>{
        if(i)frames.push(time-window.lastFrame);window.lastFrame=time;scroller.scrollTop=i<60?i*36:(120-i)*36;resolve();
      }));
      await new Promise(r=>setTimeout(r,300));
      const roots=[...document.querySelectorAll('[data-norin-mount]')].map(h=>h.shadowRoot);
      const sorted=frames.slice().sort((a,b)=>a-b),q=p=>Number(sorted[Math.floor((sorted.length-1)*p)].toFixed(2));
      return {medianFrameMs:q(.5),p95FrameMs:q(.95),maxFrameMs:q(1),framesOver25Ms:frames.filter(n=>n>25).length,
        liveOverlayNodes:roots.reduce((n,r)=>n+r.querySelectorAll('*').length,0),images:roots.reduce((n,r)=>n+r.querySelectorAll('img').length,0),
        longTasks:longTasks.length,maxLongTaskMs:longTasks.length?Math.max(...longTasks):0,errors:failures};
    })()`,sessionId);
    assert.equal(results[name].errors.length,0);
  }
  console.log('Scroll benchmark (local synthetic page, not live Discord):');
  console.log(JSON.stringify(results,null,2));
  fs.writeFileSync(path.join(temporary,'benchmark.json'),JSON.stringify(results,null,2));
}
async function symbolComparison(client,sessionId){
  assert.ok(process.env.NORIN_TEST_GLYPHS,'Use NORIN_TEST_GLYPHS for a comparison with the real artwork');
  const symbols=[',','.',':',';','!','?',"'",'"','-','–','—','/','\\','|','<','>','(',')','[',']','{','}','+','=','*','&','@','#','$','%','^','~','_','’','…'];
  const escape=text=>text.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
  const cards=symbols.map((symbol,index)=>`<article><label data-norin-ignore>${escape('this'+symbol+'test')}</label><div class="sample small" id="s${index}">${escape('this'+symbol+'test')}</div><div class="sample large" id="l${index}" contenteditable="true">${escape('this'+symbol+'test')}</div></article>`).join('');
  const base=fixture(),scripts=base.slice(base.indexOf('<script>'));
  const content=`<!doctype html><meta charset="utf-8"><style>
    body{margin:0;padding:24px;background:#313338;color:#eee;font:18px Arial}
    h1{font:22px Arial;margin:0 0 8px}p{font:13px Arial;margin:0 0 20px;color:#bbb}
    main{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
    article{background:#25272d;border:1px solid #555;border-radius:6px;padding:10px 16px;height:106px;box-sizing:border-box;overflow:visible}
    label{display:block;font:13px monospace;color:#aaa;margin-bottom:6px}
    .sample{line-height:32px;white-space:nowrap}.small{font-size:18px}.large{font-size:26px;line-height:40px}
  </style><h1 data-norin-ignore>Norin common symbol comparison</h1><p data-norin-ignore>English label, 18px page text, 26px editable text. Real glyph artwork. Click a larger sample to check its editing caret.</p><main>${cards}</main>${scripts}`;
  const file=path.join(temporary,'symbols.html');fs.writeFileSync(file,content);
  await client.call('Emulation.setDeviceMetricsOverride',{width:1400,height:1160,deviceScaleFactor:1,mobile:false},sessionId);
  await client.call('Page.navigate',{url:'file://'+file},sessionId);
  let ready=false;
  for(let i=0;i<250;i++){
    ready=await client.evaluate(`!!window.norinTest&&[...document.querySelectorAll('.sample')].every(el=>{const r=norinTest.textNodes.get(el.firstChild);return r?.words.length&&r.words.every(w=>w.box?.isConnected&&w.template.ready);})&&!norinTest.pending&&!norinTest.dirtyRecords.size`,sessionId);
    if(ready)break;await delay(30);
  }
  assert.ok(ready,'all symbol samples rendered');
  const results=await client.evaluate(`(()=>{
    const api=norinTest,results=[];
    for(const el of document.querySelectorAll('.small')){
      const word=api.textNodes.get(el.firstChild).words[0],t=word.template;
      const xml=new DOMParser().parseFromString(decodeURIComponent(t.node.firstElementChild.src.split(',').slice(1).join(',')),'image/svg+xml');
      const svg=document.importNode(xml.documentElement,true),view=svg.viewBox.baseVal;
      svg.setAttribute('width',view.width);svg.setAttribute('height',view.height);
      const host=document.createElement('div');host.setAttribute('data-norin-ignore','');host.style.cssText='position:fixed;left:0;top:0;visibility:hidden';document.body.append(host);host.attachShadow({mode:'open'}).append(svg);
      const cells=[...svg.querySelector('.norin-word').children],bounds=cells.map(cell=>api.cellInk(cell));
      const punctuation=cells.findIndex(cell=>cell.classList.contains('literal-token'));
      const round=value=>Math.round(value*1000)/1000;
      results.push({source:word.text,normalized:api.wordPlan(word.text).text,widthEm:round(t.width),punctuation:punctuation<0?null:cells[punctuation].textContent,leftGapEm:punctuation>0?round((bounds[punctuation].left-bounds[punctuation-1].right)/100):null,rightGapEm:punctuation>=0&&punctuation<bounds.length-1?round((bounds[punctuation+1].left-bounds[punctuation].right)/100):null,failed:t.failed});host.remove();
    }
    return {samples:results,errors};
  })()`,sessionId);
  assert.deepEqual(results.errors,[]);
  assert.ok(results.samples.every(row=>!row.failed&&Number.isFinite(row.leftGapEm)&&Number.isFinite(row.rightGapEm)&&row.leftGapEm>=0&&row.rightGapEm>=0),'symbol images loaded without overlapping neighbors');
  fs.writeFileSync(path.join(temporary,'symbols.json'),JSON.stringify(results,null,2));
  const screenshot=await client.call('Page.captureScreenshot',{format:'png'},sessionId);
  fs.writeFileSync(path.join(temporary,'symbols.png'),Buffer.from(screenshot.data,'base64'));
  console.log(JSON.stringify(results,null,2));
  console.log(`Symbol comparison: ${file}\nScreenshot: ${path.join(temporary,'symbols.png')}`);
}
async function punctuationRegression(client,sessionId){
  const content=fixture().replace('<div id="messages">', `<section style="position:fixed;left:700px;top:80px;font:18px/32px Arial;width:650px"><div id="punctPage">hello world : hello &gt; world</div><div id="punctEditor" contenteditable="true">hello world : hello &gt; world</div><div id="punctInline"><span>hello world </span><span>:</span><em> hello </em><span>&gt;</span><span> world</span></div><div id="punctAttached">hello:world hello&gt;world</div></section><div id="messages">`);
  const file=path.join(temporary,'punctuation.html');fs.writeFileSync(file,content);
  await client.call('Page.navigate',{url:'file://'+file},sessionId);
  const checks=await client.evaluate(`(async()=>{
    const wait=ms=>new Promise(r=>setTimeout(r,ms));
    for(let i=0;i<150&&!window.norinTest;i++)await wait(30);
    const api=norinTest,words=id=>[...api.textNodes.values()].filter(r=>document.getElementById(id).contains(r.node)).flatMap(r=>r.words);
    for(let i=0;i<150;i++){if(['punctPage','punctEditor','punctInline','punctAttached'].every(id=>words(id).length&&words(id).every(w=>w.box?.isConnected)))break;await wait(30);}
    const checks={};
    for(const id of ['punctPage','punctEditor','punctInline']){
      const list=words(id);
      checks[id+'IncludesPunctuation']=list.length===6&&list.some(w=>w.text===':')&&list.some(w=>w.text==='>');
      checks[id+'CompactGaps']=list.every((w,i)=>{if(!i)return true;const a=list[i-1].box.getBoundingClientRect(),b=w.box.getBoundingClientRect();return Math.abs(b.left-a.right-18*.6)<1;});
    }
    checks.attachedPunctuation=words('punctAttached').every(w=>w.box?.isConnected&&w.template.hits.some(h=>h.end===h.start+1));
    const editor=document.getElementById('punctEditor');editor.focus();
    const range=document.createRange();range.setStart(editor.firstChild,14);range.collapse(true);getSelection().removeAllRanges();getSelection().addRange(range);document.dispatchEvent(new Event('selectionchange'));
    await wait(200);
    checks.editorCaret=!!api.textNodes.get(editor.firstChild).group.caretState;
    checks.originalPreserved=editor.firstChild.data==='hello world : hello > world';
    checks.noErrors=errors.length===0;return checks;
  })()`,sessionId);
  for(const [name,passed]of Object.entries(checks))assert.ok(passed,'punctuation: '+name+' '+JSON.stringify(checks));
  console.log('Punctuation spacing in page text, editors and inline elements: passed');
}
async function wrappedRegression(client,sessionId){
  const content=fixture().replace('<div id="messages">', `<section id="wrapCases" style="position:fixed;left:700px;top:50px;z-index:3;font:18px/28px monospace"><div id="compactWrap" style="width:180px;overflow-wrap:anywhere">aaaaaaaaaaaaaaaaaaaaaaaa</div><div id="forcedWrap" style="width:32px;overflow-wrap:anywhere">unauthorized</div><div id="hyphenWrap" style="width:55px">word-wrap</div><div id="softWrap" style="width:55px;overflow-wrap:anywhere">unau&#173;thorized</div></section><div id="messages">`);
  const file=path.join(temporary,'wrapped.html');fs.writeFileSync(file,content);
  await client.call('Page.navigate',{url:'file://'+file},sessionId);
  const result=await client.evaluate(`(async()=>{
    const wait=ms=>new Promise(r=>setTimeout(r,ms));
    for(let i=0;i<150&&!window.norinTest;i++)await wait(30);
    const api=norinTest,get=id=>api.textNodes.get(document.getElementById(id).firstChild)?.words[0];
    const covered=word=>[...CSS.highlights.get('norin-original')||[]].some(r=>r.startContainer===word.range.startContainer&&r.startOffset<=word.range.startOffset&&r.endOffset>=word.range.endOffset);
    for(let i=0;i<150;i++){if(['compactWrap','forcedWrap','hyphenWrap','softWrap'].every(id=>get(id)&&covered(get(id))))break;await wait(30);}
    const compact=get('compactWrap'),forced=get('forcedWrap'),hyphen=get('hyphenWrap'),soft=get('softWrap');
    const checks={
      compactSourceWraps:[...compact.range.getClientRects()].filter(r=>r.width).length>1,
      compactNorinStaysWhole:!!compact.box?.isConnected&&![...compact.fragments.values()].some(f=>f.box?.isConnected),
      forcedWrapTranslated:covered(forced)&&[...forced.fragments.values()].filter(f=>f.box?.isConnected).length>1,
      hyphenWrapTranslated:covered(hyphen),softHyphenTranslated:covered(soft),
      fullWordNormalization:[...forced.fragments.values()].map(f=>f.template?.text||'').join('')===api.wordPlan(forced.text).text,
      originalTextPreserved:document.getElementById('softWrap').firstChild.data==='unau\u00adthorized'
    };
    document.getElementById('forcedWrap').style.width='500px';
    for(let i=0;i<150&&!forced.box?.isConnected;i++)await wait(30);
    checks.resizeUnwraps=!!forced.box?.isConnected&&![...forced.fragments.values()].some(f=>f.box?.isConnected);
    document.getElementById('forcedWrap').style.width='32px';
    for(let i=0;i<150;i++){if(!forced.box?.isConnected&&[...forced.fragments.values()].filter(f=>f.box?.isConnected).length>1)break;await wait(30);}
    checks.resizeRewraps=!forced.box?.isConnected&&[...forced.fragments.values()].filter(f=>f.box?.isConnected).length>1;
    checks.noErrors=errors.length===0;
    return checks;
  })()`,sessionId);
  for(const [name,passed]of Object.entries(result))assert.ok(passed,'wrapped word: '+name+' '+JSON.stringify(result));
  console.log('Wrapped words, compact whole words, soft hyphens and resizing: passed');
}
async function strictRegression(client,sessionId){
    // YouTube-like strict Trusted Types, plus ordinary document scrolling.
    const strictHTML=fixture().replace('<style>', '<style>html{height:100%;overflow-x:hidden}body{min-height:100%}')
      .replace('<meta charset="utf-8">',
      `<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="require-trusted-types-for 'script'; trusted-types 'none'">`)
      .replace('window.glyphFixtures=', 'console.error=(...args)=>window.errors.push(args.map(String).join(" "));window.glyphFixtures=')
      .replace('<div id="messages">', `<div style="height:2200px"><span id="narrowFooter" style="position:absolute;left:2px;top:2100px;font-size:12px">I</span></div><footer id="pageFooter">footer translation</footer><div id="messages">`);
    const strictFile=path.join(temporary,'strict-scroll.html');fs.writeFileSync(strictFile,strictHTML);
    await client.call('Page.navigate',{url:'file://'+strictFile},sessionId);
    let strictReady=false;
    for(let i=0;i<150;i++){
      strictReady=await client.evaluate(`!!window.norinTest&&!!CSS.highlights.get('norin-original')?.size`,sessionId);
      if(strictReady)break;await delay(30);
    }
    assert.ok(strictReady,'renders with Trusted Types enforced and all policy creation disabled: '+JSON.stringify(await client.evaluate('window.errors',sessionId)));
    await client.evaluate(`scrollTo(0,1900)`,sessionId);
    let footerReady=false;
    for(let i=0;i<150;i++){
      footerReady=await client.evaluate(`['narrowFooter','pageFooter'].every(id=>{const r=norinTest.textNodes.get(document.getElementById(id).firstChild);return r?.words.length&&r.words.every(w=>w.box?.isConnected);})`,sessionId);
      if(footerReady)break;await delay(30);
    }
    assert.ok(footerReady,'document scrolling renders narrow unsampled text and initially offscreen footer');
    // Simulate a missed observer notification for text outside the sample grid.
    await client.evaluate(`(()=>{const api=norinTest,g=api.textNodes.get(document.getElementById('narrowFooter').firstChild).group;g.near=false;api.activeRecords.delete(g);api.dirty(g);})()`,sessionId);
    await delay(100);
    await client.evaluate(`scrollBy(0,1)`,sessionId);
    let recovered=false;
    for(let i=0;i<150;i++){
      recovered=await client.evaluate(`norinTest.textNodes.get(document.getElementById('narrowFooter').firstChild).words.every(w=>w.box?.isConnected)`,sessionId);
      if(recovered)break;await delay(30);
    }
    assert.ok(recovered,'indexed recovery restores narrow text outside the sample grid');
    // Refresh with browser scroll restoration: rendering must use viewport
    // coordinates even when startup occurs below the original window boundary.
    const epoch=await client.evaluate('performance.timeOrigin',sessionId);
    await client.call('Page.reload',{},sessionId);
    let restored=false;
    for(let i=0;i<150;i++){
      restored=await client.evaluate(`performance.timeOrigin>${epoch}&&scrollY>1800&&!!window.norinTest&&['narrowFooter','pageFooter'].every(id=>{const r=norinTest.textNodes.get(document.getElementById(id).firstChild);return r?.words.length&&r.words.every(w=>w.box?.isConnected);})`,sessionId);
      if(restored)break;await delay(30);
    }
    assert.ok(restored,'root overflow renders after reload at a restored scroll position');
    // The body's overflow can also be propagated to the viewport by the browser.
    await client.evaluate(`document.documentElement.style.overflow='visible';document.body.style.height='100%';document.body.style.overflowX='hidden';document.dispatchEvent(new Event('scroll'));`,sessionId);
    await delay(250);
    assert.ok(await client.evaluate(`['narrowFooter','pageFooter'].every(id=>{const r=norinTest.textNodes.get(document.getElementById(id).firstChild);return r?.words.length&&r.words.every(w=>w.box?.isConnected);})`,sessionId),'propagated body overflow uses viewport bounds');
    assert.deepEqual(await client.evaluate('errors',sessionId),[]);
    console.log('Strict Trusted Types, root/body overflow, restored scroll and offscreen footer: passed');
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
    if(process.argv.includes('--symbols')){await symbolComparison(client,sessionId);return;}
    if(process.argv.includes('--punct-only')){await punctuationRegression(client,sessionId);return;}
    if(process.argv.includes('--wrap-only')){await wrappedRegression(client,sessionId);return;}
    if(process.argv.includes('--strict-only')){await strictRegression(client,sessionId);return;}
    await client.call('Page.navigate',{url:'file://'+html},sessionId);
    let ready=false;
    for(let i=0;i<100;i++){
      ready=await client.evaluate('!!window.norinTest && [...norinTest.templates.values()].some(t=>t.ready) && !norinTest.dirtyRecords.size && !norinTest.pending',sessionId);
      if(ready)break;await delay(50);
    }
    assert.ok(ready,'script reached a rendered idle state');
    const result=await client.evaluate(`(async()=>{
      const api=window.norinTest,wait=ms=>new Promise(r=>setTimeout(r,ms));
      async function settle(){for(let i=0;i<100;i++){await wait(30);if(!api.dirtyRecords.size&&!api.pending&&[...api.templates.values()].every(t=>t.ready)){await wait(50);if(!api.dirtyRecords.size&&!api.pending)return;}}throw Error('did not settle: '+JSON.stringify({dirty:[...api.dirtyRecords].map(g=>g.element.id),pending:api.pending,cold:[...api.templates.values()].filter(t=>!t.ready).map(t=>({text:t.text,width:t.width})),errors}));}
      async function until(check){for(let i=0;i<150;i++){if(check())return;await wait(20);}throw Error('condition timed out');}
      const results={};const check=(name,value)=>{results[name]=!!value;if(!value)throw Error('FAIL '+name);};
      await settle();
      const message=document.querySelector('#m0'),source=message.firstChild,rec=api.textNodes.get(source);
      check('viewportOnly',api.activeRecords.size<50&&[...api.textNodes.values()].filter(r=>r.words.length).length<50);
      const roots=()=>[...document.querySelectorAll('[data-norin-mount]')].map(h=>h.shadowRoot);
      const all=selector=>roots().flatMap(r=>[...r.querySelectorAll(selector)]);
      check('singleImageWords',all('.word').every(w=>w.childElementCount===1&&w.firstElementChild.tagName==='IMG'));
      check('noLiveGlyphSVGs',all('svg').length===0);
      check('imagesDecoded',[...api.templates.values()].every(t=>t.ready&&!t.failed));
      const cacheWords=id=>api.textNodes.get(document.querySelector('#'+id).firstChild).words;
      const pair=cacheWords('couldPair'),other=cacheWords('otherCould')[0],red=cacheWords('redCould')[0],caps=cacheWords('capitalCases');
      check('equivalentSpellingSharesImage',pair[0].template===pair[1].template&&pair[0].glyph.firstElementChild.src===pair[1].glyph.firstElementChild.src);
      check('sharedAcrossLocations',other.template===pair[0].template&&other.template.width===pair[0].template.width);
      check('differentStylingSeparated',red.template!==other.template&&red.template.color!==other.template.color);
      const priorConversions=stats.conversions;check('equivalentSpellingSharesShape',api.shapeFor('Could')===api.shapeFor('could')&&stats.conversions===priorConversions);
      const priorNormalizations=stats.normalizations;for(let i=0;i<10;i++){api.wordPlan('Could');api.wordPlan('could');}check('cachedSpellingSkipsRegex',stats.normalizations===priorNormalizations);
      check('uppercaseVowelPreserved',caps[0].template!==caps[1].template&&api.shapeFor('bA').querySelectorAll('.accent').length===0&&api.shapeFor('ba').querySelectorAll('.accent').length===1);
      check('allCapsPreserved',caps[2].template!==caps[3].template&&api.wordPlan('COULD').key!==api.wordPlan('could').key);
      check('compoundEmDash',[...api.shapeFor('full-stop').querySelectorAll('.punct-hyphen')].map(e=>e.textContent).join('')==='—');
      check('multipleCompoundEmDashes',[...api.shapeFor('non-three-letter').querySelectorAll('.punct-hyphen')].map(e=>e.textContent).join('')==='——');
      check('numericRangeUnchanged',api.shapeFor('10-20').querySelector('.punct-hyphen').textContent==='-');
      for(const [source,expected]of [['oo-','—'],['-oo','—'],['o-o','—'],['o - o','-'],['--','—'],['----','——'],['---','—-'],[' -- ','—'],['10-20','-']]){
        const actual=api.wordPlan(source).text.replace(/[^—-]/gu,'');
        check('dashRule '+JSON.stringify(source),actual===expected);
        check('dashRendering '+JSON.stringify(source),[...api.shapeFor(source).querySelectorAll('.punct-hyphen')].map(e=>e.textContent).join('')===expected);
      }


      const spacing=cacheWords('spacingMessage');let maxInternalGap=0,hasBlock=false;
      for(const word of spacing){
        const image=word.glyph.firstElementChild;
        const xml=new DOMParser().parseFromString(decodeURIComponent(image.src.slice(image.src.indexOf(',')+1)),'image/svg+xml');
        const svg=document.importNode(xml.documentElement,true),view=svg.viewBox.baseVal;
        svg.setAttribute('width',view.width);svg.setAttribute('height',view.height);
        const host=document.createElement('div');host.style.cssText='position:fixed;left:0;top:0;visibility:hidden';document.body.append(host);const root=host.attachShadow({mode:'open'});root.append(svg);
        for(const wrapper of svg.querySelectorAll('.norin-word')){
          const cells=[...wrapper.children],bounds=cells.map(cell=>api.cellInk(cell));
          for(let i=1;i<bounds.length;i++){const gap=bounds[i].left-bounds[i-1].right;check('internalGapNonnegative',gap>=-.05);const previous=cells[i-1];const padding=(previous.classList.contains('punct-spaced')?(previous.textContent==='—'||previous.textContent==='|'?30:10):0)+(cells[i].classList.contains('punct-spaced')?10:0);maxInternalGap=Math.max(maxInternalGap,gap-padding);}
          for(const cell of cells)if(cell.classList.contains('sinogram')){hasBlock=true;check('blockProportionsUnchanged',Math.abs(parseFloat(getComputedStyle(cell).width)/parseFloat(getComputedStyle(cell).fontSize)-5/3)<.001);}
          for(const cell of cells)for(const wrapper of [cell,...cell.querySelectorAll('.glyph-wrapper')]){
            const base=wrapper.querySelector(':scope > svg.glyph'),accent=wrapper.querySelector(':scope > svg.accent');
            if(base&&accent){const gap=api.cellInk(base).top-api.cellInk(accent).bottom;if(gap<8)throw Error('accent collision '+JSON.stringify({word:word.text,token:wrapper.dataset.token,slot:wrapper.className,gap,base:api.cellInk(base),accent:api.cellInk(accent)}));check('accentAboveLetter',gap>=8);}
          }
          for(const block of wrapper.querySelectorAll('.sinogram')){
            const upper=block.querySelector('.sin-right > svg.glyph'),lower=block.querySelector('.sin-below > svg.glyph');
            check('stackedLettersSeparated',api.cellInk(lower).top-api.cellInk(upper).bottom>=12);
          }

        }
        host.remove();
      }
      check('tightInternalSpacing',maxInternalGap<=14.1&&maxInternalGap>0);
      check('threeGlyphBlocksPreserved',hasBlock);
      check('visibleWordBoundaries',spacing.slice(1).every((w,i)=>w.box.getBoundingClientRect().left-spacing[i].box.getBoundingClientRect().right>=18*.6-.1));


      const about=rec.words.find(w=>w.text==='about'),number=rec.words.find(w=>w.text==='20'),minutes=rec.words.find(w=>w.text==='minutes');
      check('constantScaleAcrossMessages',rec.words.every(w=>!w.box||w.glyph.style.transform==='scale('+api.GLYPH_SCALE+')')&&api.textNodes.get(document.querySelector('#shortLine').firstChild).words.every(w=>!w.box||w.glyph.style.transform==='scale('+api.GLYPH_SCALE+')'));
      check('numberOrder',about.box.getBoundingClientRect().right<=number.box.getBoundingClientRect().left+.1&&number.box.getBoundingClientRect().right<=minutes.box.getBoundingClientRect().left+.1);
      const covered=el=>[...CSS.highlights.get('norin-original')].some(r=>el.contains(r.startContainer));
      check('normalLinkConverted',covered(document.querySelector('#label')));
      check('literalLinkExcluded',!covered(document.querySelector('#url'))&&!covered(document.querySelector('#plainURL')));
      check('semanticCodeExcluded',!covered(document.querySelector('#preCode'))&&!covered(document.querySelector('#inlineCode')));
      check('backtickCodeExcluded',![...CSS.highlights.get('norin-original')].some(r=>document.querySelector('#inlineTicks').contains(r.startContainer)&&r.toString().includes('const')));
      check('splitNodeCodeExcluded',!covered(document.querySelector('#splitCode')));
      check('fencedEditorCodeExcluded',!covered(document.querySelector('#fenceCode'))&&covered(document.querySelector('#afterFence')));
      const tight=document.querySelector('#tightName'),tightWords=api.textNodes.get(tight.firstChild).words;
      check('rocketBunnyAccentsPresent',api.shapeFor('rocket').querySelectorAll('.accent').length===2&&api.shapeFor('bunny').querySelectorAll('.accent').length===2);
      const ink=[];
      for(const word of tightWords){
        const host=document.createElement('div');host.style.cssText='position:fixed;left:1100px;top:500px;width:200px;height:18px;visibility:hidden';document.body.append(host);
        const root=host.attachShadow({mode:'open'});
        const img=word.glyph.firstElementChild,xml=new DOMParser().parseFromString(decodeURIComponent(img.src.slice(img.src.indexOf(',')+1)),'image/svg+xml');
        const svg=document.importNode(xml.documentElement,true),box=svg.viewBox.baseVal,scale=14*api.GLYPH_SCALE/100;
        svg.setAttribute('width',box.width*scale);svg.setAttribute('height',box.height*scale);
        svg.style.position='absolute';svg.style.top=(word.glyph.getBoundingClientRect().top-tight.getBoundingClientRect().top-1.5*14*api.GLYPH_SCALE)+'px';root.append(svg);
        const origin=host.getBoundingClientRect();
        for(const accent of svg.querySelectorAll('.accent')){const bounds=api.cellInk(accent);ink.push({top:bounds.top-origin.top,bottom:bounds.bottom-origin.top});}
        host.remove();
      }
      if(!ink.every(b=>b.top>=-.15&&b.bottom<=18.15))throw Error('row clipping '+JSON.stringify({ink,words:tightWords.map(w=>({text:w.text,top:w.template.inkTop,bottom:w.template.inkBottom,drawTop:w.glyph.getBoundingClientRect().top,source:w.range.getBoundingClientRect().toJSON()}))}));
      check('accentInkInsideTightRow',ink.length>=4&&ink.every(b=>b.top>=-.15&&b.bottom<=18.15));

      check('inlineOverflowNotClipped',covered(document.querySelector('#inlineClip')));
      const tail=document.querySelector('#tailFace'),tailGroup=api.emojiRecords.get(tail).group;
      const tailWords=[...tailGroup.nodes].flatMap(r=>r.words).filter(w=>w.box?.isConnected),lastWord=tailWords.at(-1);
      const gap=tail.getBoundingClientRect().left-lastWord.box.getBoundingClientRect().right;
      if(!(Math.abs(gap-18*.6)<.5&&api.emojiRecords.get(tail).dx<0))throw Error('emoji gap '+JSON.stringify({gap,dx:api.emojiRecords.get(tail).dx,desired:api.emojiRecords.get(tail).desired,emoji:tail.getBoundingClientRect().toJSON(),words:tailWords.map(w=>({text:w.text,rect:w.box.getBoundingClientRect().toJSON()}))}));
      check('trailingEmojiFollowsNorin',Math.abs(gap-18*.6)<.5&&api.emojiRecords.get(tail).dx<0);
      const middle=document.querySelector('#emojiWrap'),middleGroup=api.emojiRecords.get(middle).group;
      const middleWords=[...middleGroup.nodes].flatMap(r=>r.words).filter(w=>w.box?.isConnected);
      check('emojiWrapperMovesIntact',middle.getBoundingClientRect().left>=middleWords[0].box.getBoundingClientRect().right&&middleWords[1].box.getBoundingClientRect().left>=middle.getBoundingClientRect().right);
      check('avatarsAndAttachmentsUntouched',!api.emojiRecords.has(document.querySelector('#avatarCase'))&&!api.emojiRecords.has(document.querySelector('#attachmentCase')));
      const emojiPosition=tail.getBoundingClientRect().left;api.dirty(tailGroup);await settle();check('emojiDoesNotDrift',Math.abs(tail.getBoundingClientRect().left-emojiPosition)<.1);
      let selectionRange=document.createRange();selectionRange.selectNodeContents(document.querySelector('#tailEmoji'));getSelection().removeAllRanges();getSelection().addRange(selectionRange);api.updateSelection();
      check('selectionRestoresEmoji',!api.emojiRecords.get(tail).applied);getSelection().removeAllRanges();api.updateSelection();check('selectionRepositionsEmoji',api.emojiRecords.get(tail).applied);
      const lostHost=[...tailGroup.mounts][0].host;lostHost.remove();await until(()=>lostHost.isConnected);check('removedOverlayRepaired',covered(document.querySelector('#tailEmoji')));
      document.querySelector('#tailEmoji').style.position='';await settle();check('overwrittenAnchorRepaired',getComputedStyle(document.querySelector('#tailEmoji')).position==='relative');
      api.toggle();check('englishRestoresEmoji',!api.emojiRecords.get(tail).applied);api.toggle();await settle();
      tailGroup.near=false;api.activeRecords.delete(tailGroup);api.dirty(tailGroup);await settle();check('simulatedLostViewportState',!lastWord.box.isConnected);
      document.dispatchEvent(new Event('scroll'));await until(()=>lastWord.box?.isConnected);await settle();check('scrollRecovery',covered(document.querySelector('#tailEmoji')));
      const late=document.createElement('article');late.id='lateFeedCard';late.textContent='new dynamic message';document.querySelector('#dynamicPanel').append(late);await until(()=>covered(late));await settle();check('newFeedCardConverted',covered(late));
      const hidden=document.querySelector('#hidden [data-norin-mount]');check('nativeVisibility',getComputedStyle(hidden).visibility==='hidden');
      document.querySelector('#hidden').style.visibility='visible';check('instantReveal',getComputedStyle(hidden).visibility==='visible');await settle();
      let range=document.createRange();range.setStart(source,1);range.setEnd(source,5);getSelection().removeAllRanges();getSelection().addRange(range);api.updateSelection();
      check('selectionRevealsEnglish',!covered(message)&&[...rec.group.mounts].every(m=>m.host.style.display==='none'));
      getSelection().removeAllRanges();api.updateSelection();check('selectionRestores',covered(message));
      const input=document.querySelector('#input');input.focus();input.setSelectionRange(1,4);api.updateSelection();check('inputSelection',!input.hasAttribute('data-norin-input'));
      input.setSelectionRange(4,4);api.updateSelection();check('inputSelectionRestores',input.hasAttribute('data-norin-input'));input.blur();await settle();
      const fixed=document.querySelector('#control [data-norin-mount]').getBoundingClientRect().top;
      const original=rec.words[0].box,top=original.getBoundingClientRect().top,scroller=document.querySelector('#messages');
      scroller.scrollTop=60;check('nativeScroll',Math.abs(top-original.getBoundingClientRect().top-60)<.1);
      check('fixedStaysFixed',document.querySelector('#control [data-norin-mount]').getBoundingClientRect().top===fixed);
      scroller.scrollTop=1400;await until(()=>!original.isConnected);await settle();
      check('detachedCached',rec.words[0].box===original&&api.detachedViews.has(original));
      scroller.scrollTop=0;await until(()=>original.isConnected);await settle();check('reusedOnReturn',rec.words[0].box===original);
      const conversions=stats.conversions;api.dirty(rec.group);await settle();check('noRegeneration',stats.conversions===conversions);check('conversionCounterNonzero',conversions>0);
      stats.scopes=[];stats.controls=0;const composer=document.querySelector('#composer');composer.value='hello changed 20';composer.dispatchEvent(new Event('input',{bubbles:true}));await settle();
      check('targetedControl',stats.controls>0&&stats.scopes.length===0&&composer.value==='hello changed 20');check('textareaRendered',composer.hasAttribute('data-norin-input')&&api.controls.get(composer).view.box.isConnected);
      stats.scopes=[];document.querySelector('#editor').firstChild.data='a changed English message';await settle();check('targetedEditor',stats.scopes.length>0&&stats.scopes.every(id=>id==='editor'));
      await settle();stats.writes=0;api.dirty(rec.group);await settle();check('unchangedStylesSkipped',stats.writes===0);
      const oldBox=rec.words[0].box,replacement=document.createElement('p');replacement.id='replacement';replacement.textContent=source.data;message.replaceWith(replacement);
      await until(()=>api.textNodes.has(replacement.firstChild)&&api.textNodes.get(replacement.firstChild).words.some(w=>w.box?.isConnected));await settle();
      check('virtualizedRemountReuses',api.textNodes.get(replacement.firstChild).words[0].box===oldBox);
      const dynamic=document.querySelector('#label');dynamic.firstChild.data='https://example.com';await settle();check('dynamicURLExcluded',!covered(dynamic));dynamic.firstChild.data='Rocket bunny';await settle();check('dynamicLabelRestored',covered(dynamic));
      const record=api.textNodes.get(replacement.firstChild);let mutationCount=0;const mo=new MutationObserver(r=>mutationCount+=r.length);
      for(const m of record.group.mounts)mo.observe(m.host,{attributes:true});
      api.dirty(record.group);await settle();mo.disconnect();check('noRepeatedHostStyles',mutationCount===0);
      input.type='password';await settle();check('passwordExcluded',!api.controls.has(input)&&!input.hasAttribute('data-norin-input'));
      input.type='text';await until(()=>api.controls.get(input)?.view?.box.isConnected);await settle();check('textTypeRestored',input.hasAttribute('data-norin-input'));
      input.style.color='rgb(200, 0, 0)';await settle();check('controlThemeChanged',api.controls.get(input).color==='rgb(200, 0, 0)');
      composer.value='https://example.com';composer.dispatchEvent(new Event('input',{bubbles:true}));await settle();check('literalURLInControl',api.controls.get(composer).view.mirror.textContent==='https://example.com');
      composer.value='hello '+String.fromCharCode(96)+'const value'+String.fromCharCode(96)+' world';composer.dispatchEvent(new Event('input',{bubbles:true}));await settle();check('codeInControl',api.controls.get(composer).view.mirror.textContent.includes(String.fromCharCode(96)+'const value'+String.fromCharCode(96)));
      composer.value='hello changed 20';composer.dispatchEvent(new Event('input',{bubbles:true}));await settle();
      const paragraph=document.querySelector('#replacement');const prior=paragraph.firstChild.data;paragraph.firstChild.data=prior;await settle();check('sameValueWriteRestoresRanges',covered(paragraph));
      paragraph.style.fontSize='22px';await settle();check('fontChange',api.textNodes.get(paragraph.firstChild).words.every(w=>!w.box||w.glyph.style.fontSize==='22px'));
      paragraph.style.fontSize='';await settle();

      api.toggle();check('toggleOff',!CSS.highlights.has('norin-original')&&[...api.mounts.values()].every(m=>m.host.style.display==='none'));api.toggle();await settle();check('toggleOn',covered(replacement));
      const cacheLimit=api.LIMITS.views;scroller.scrollTop=1400;await settle();api.LIMITS.views=2;api.trimViews();check('boundedCache',api.detachedViews.size<=2);api.LIMITS.views=cacheLimit;scroller.scrollTop=0;await settle();

      // Caret coordinates are English offsets; only the active word unpacks.
      const caretInput=document.querySelector('#input'),caretEditor=document.querySelector('#editor');
      caretInput.value='draw tampermonkey';caretInput.focus();caretInput.setSelectionRange(3,3);caretInput.dispatchEvent(new Event('input',{bubbles:true}));
      await until(()=>api.controls.get(caretInput).view.items?.[0]?.t?.editing);await settle();
      let cv=api.controls.get(caretInput).view;
      const tokens=element=>{const img=element.querySelector('img'),doc=new DOMParser().parseFromString(decodeURIComponent(img.src.slice(img.src.indexOf(',')+1)),'image/svg+xml');return [...doc.querySelectorAll('.glyph-wrapper')].map(e=>({token:e.dataset.token,accent:e.dataset.hasAccent==='true',stacked:!!e.closest('.sinogram')}));};
      const firstParts=[...cv.items[0].glyph.children].map(tokens);
      check('caretAfterVowelKeepsAccent',firstParts[0].map(t=>t.token).join('')==='dr'&&firstParts[0][1].accent&&firstParts[1].map(t=>t.token).join('')==='w');
      check('onlyActiveWordUnpacks',!cv.items[2].t.editing&&firstParts.flat().every(t=>!t.stacked));
      check('nativeCaretHidden',getComputedStyle(caretInput).caretColor==='rgba(0, 0, 0, 0)');
      check('customInputCaretVisible',cv.customCaret&&cv.caretElement.isConnected&&getComputedStyle(cv.caretElement).display!=='none'&&caretInput.hasAttribute('data-norin-custom-caret'));
      const priorSignature=cv.signature;caretInput.setSelectionRange(2,2);await until(()=>api.controls.get(caretInput).view.items[0].t.editing&&api.controls.get(caretInput).view.signature!==priorSignature);await settle();
      cv=api.controls.get(caretInput).view;const vowelParts=[...cv.items[0].glyph.children].map(tokens);
      check('caretBeforeVowelMakesFullGlyph',vowelParts[0].map(t=>t.token).join('')==='dr'&&vowelParts[0].every(t=>!t.accent)&&vowelParts[1].map(t=>t.token).join('')==='aw'&&vowelParts[1].every(t=>!t.accent));
      caretInput.setSelectionRange(4,4);await until(()=>!api.controls.get(caretInput).view.items[0].t.editing);await settle();
      check('wordRestacksAtBoundary',api.shapeFor('draw').querySelectorAll('.sinogram').length===1&&!api.controls.get(caretInput).view.items[0].t.flat);
      caretInput.setSelectionRange(0,4);await settle();check('selectionRestoresNativeCaret',!caretInput.hasAttribute('data-norin-custom-caret')&&!caretInput.hasAttribute('data-norin-input'));
      caretInput.setSelectionRange(2,2);await settle();caretInput.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true,data:'a'}));await settle();
      check('imeUsesNativeEnglish',!caretInput.hasAttribute('data-norin-input')&&!caretInput.hasAttribute('data-norin-custom-caret'));
      caretInput.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'a'}));await settle();check('caretReturnsAfterIme',caretInput.hasAttribute('data-norin-custom-caret'));
      check('normalizedCaretMapping',api.normalizedCaret('draw',2).cut===2&&api.normalizedCaret('draw',3).cut===3&&api.sourceAlignment('could').text==='kud'&&api.sourceAlignment('one').text==='won');
      caretInput.value='draw '.repeat(60);caretInput.setSelectionRange(caretInput.value.length,caretInput.value.length);caretInput.dispatchEvent(new Event('input',{bubbles:true}));await settle();
      cv=api.controls.get(caretInput).view;let caretBox=cv.caretElement.getBoundingClientRect(),fieldBox=cv.box.getBoundingClientRect();
      check('longInputFollowsNorinCaret',cv.scrollX>0&&caretBox.left>=fieldBox.left-.5&&caretBox.right<=fieldBox.right+.5);
      composer.value=Array(25).fill('draw tampermonkey').join(String.fromCharCode(10));composer.focus();composer.setSelectionRange(composer.value.length,composer.value.length);composer.dispatchEvent(new Event('input',{bubbles:true}));await settle();
      const textareaView=api.controls.get(composer).view;caretBox=textareaView.caretElement.getBoundingClientRect();fieldBox=textareaView.box.getBoundingClientRect();
      check('textareaFollowsNorinCaret',textareaView.scrollY>0&&caretBox.top>=fieldBox.top-1&&caretBox.bottom<=fieldBox.bottom+1);
      caretEditor.textContent='draw tampermonkey';caretEditor.focus();let editingNode=caretEditor.firstChild;getSelection().setPosition(editingNode,3);
      await until(()=>api.textNodes.get(editingNode)?.words[0].template?.editing);await settle();
      let editingGroup=api.textNodes.get(editingNode).group;
      check('discordComposerCaret',!!editingGroup.caretState&&editingGroup.caretElement.isConnected&&getComputedStyle(editingGroup.caretElement).display!=='none'&&caretEditor.hasAttribute('data-norin-custom-caret')&&editingNode.data==='draw tampermonkey');
      getSelection().setPosition(editingNode,2);await settle();check('composerCaretMoves',editingGroup.caretState.offset===2&&getComputedStyle(editingGroup.caretElement).display!=='none');
      getSelection().setPosition(editingNode,4);await settle();check('composerRestacks',!api.textNodes.get(editingNode).words[0].template.editing);
      caretEditor.blur();await settle();check('blurRestoresNormalRendering',!caretEditor.hasAttribute('data-norin-custom-caret')&&!api.textNodes.get(editingNode).words[0].template.editing);
      caretInput.type='email';caretInput.focus();await settle();check('unsupportedCaretApiUsesEnglish',!caretInput.hasAttribute('data-norin-input')&&!caretInput.hasAttribute('data-norin-custom-caret'));caretInput.blur();caretInput.type='text';await settle();
      caretInput.value='English typing';composer.value='hello changed 20';caretInput.dispatchEvent(new Event('input',{bubbles:true}));composer.dispatchEvent(new Event('input',{bubbles:true}));await settle();
      check('noBrowserErrors',errors.length===0);

      const nodes=roots().reduce((n,r)=>n+r.querySelectorAll('*').length,0);
      return {checks:results,metrics:{trackedNodes:api.textNodes.size,activeBlocks:api.activeRecords.size,liveOverlayNodes:nodes,cachedWords:api.templates.size,conversions:stats.conversions,maxFlushMs:Math.max(...stats.flushMs),flushCount:stats.flushMs.length}};
    })()`,sessionId);
    // Use real browser pointer events so drag suppression and pointer capture are exercised.
    const buttonRect=()=>client.evaluate(`document.querySelector('#norin-floating-toggle').getBoundingClientRect().toJSON()`,sessionId);
    const mode=()=>client.evaluate(`document.querySelector('#norin-floating-toggle').shadowRoot.querySelector('button').textContent`,sessionId);
    async function mouse(type,x,y){await client.call('Input.dispatchMouseEvent',{type,x,y,buttons:type==='mouseReleased'?0:1,...(type==='mouseMoved'?{}:{button:'left',clickCount:1})},sessionId);}
    const controlPoint=await client.evaluate(`(async()=>{
      const input=document.querySelector('#input');input.value='draw tampermonkey';input.focus();input.setSelectionRange(4,4);input.dispatchEvent(new Event('input',{bubbles:true}));
      for(let i=0;i<100;i++){await new Promise(r=>setTimeout(r,30));const item=norinTest.controls.get(input).view.items?.[0];if(item?.t.ready&&!item.t.editing&&!norinTest.pending&&!norinTest.dirtyRecords.size){const rect=item.glyph.getBoundingClientRect(),unit=rect.width/item.t.width,hit=item.t.hits.find(h=>h.start===0&&h.end===1);return {x:rect.left+(hit.left*.25+hit.right*.75)*unit,y:rect.top+(hit.top+hit.bottom)/2*unit};}}throw Error('control click setup timed out');
    })()`,sessionId);
    await mouse('mousePressed',controlPoint.x,controlPoint.y);await mouse('mouseReleased',controlPoint.x,controlPoint.y);await delay(200);
    assert.equal(await client.evaluate(`document.querySelector('#input').selectionStart`,sessionId),1);
    result.checks.clickMapsControlGlyph=true;
    await client.call('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39},sessionId);
    await client.call('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39},sessionId);await delay(150);
    assert.equal(await client.evaluate(`document.querySelector('#input').selectionStart`,sessionId),2);result.checks.nativeArrowCaret=true;
    const editorPoint=await client.evaluate(`(async()=>{
      const editor=document.querySelector('#editor');editor.textContent='draw tampermonkey';editor.focus();getSelection().setPosition(editor.firstChild,4);
      for(let i=0;i<100;i++){await new Promise(r=>setTimeout(r,30));const record=norinTest.textNodes.get(editor.firstChild),word=record?.words[0];if(word?.template?.ready&&!word.template.editing&&word.box?.isConnected&&!norinTest.pending&&!norinTest.dirtyRecords.size){const rect=word.glyph.getBoundingClientRect(),unit=rect.width/word.template.width,hit=word.template.hits.find(h=>h.start===2&&h.end===3);return {x:rect.left+(hit.left*.75+hit.right*.25)*unit,y:rect.top+(hit.top+hit.bottom)/2*unit};}}throw Error('editor click setup timed out');
    })()`,sessionId);
    await mouse('mousePressed',editorPoint.x,editorPoint.y);await mouse('mouseReleased',editorPoint.x,editorPoint.y);await delay(200);
    assert.equal(await client.evaluate(`getSelection().focusOffset`,sessionId),2);
    assert.equal(await client.evaluate(`!!norinTest.textNodes.get(document.querySelector('#editor').firstChild).words[0].template.editing`,sessionId),true);
    result.checks.clickMapsEditorVowel=true;
    const caretPreview=await client.call('Page.captureScreenshot',{format:'png'},sessionId);fs.writeFileSync(path.join(temporary,'caret-preview.png'),Buffer.from(caretPreview.data,'base64'));
    console.log(`Caret preview: ${path.join(temporary,'caret-preview.png')}`);
    async function clickButton(){const r=await buttonRect();await mouse('mousePressed',r.left+r.width/2,r.top+r.height/2);await mouse('mouseReleased',r.left+r.width/2,r.top+r.height/2);}
    async function dragButton(x,y){const r=await buttonRect();await mouse('mousePressed',r.left+r.width/2,r.top+r.height/2);await mouse('mouseMoved',x,y);await mouse('mouseReleased',x,y);}
    assert.equal(await mode(),'Norin');await clickButton();assert.equal(await mode(),'English');
    assert.equal(await client.evaluate(`CSS.highlights.has('norin-original')`,sessionId),false);
    await clickButton();assert.equal(await mode(),'Norin');await delay(150);
    await client.evaluate(`window.uiEvents=[];for(const type of ['pointerdown','pointermove','pointerup'])document.querySelector('#norin-floating-toggle').shadowRoot.querySelector('button').addEventListener(type,e=>uiEvents.push({type,x:e.clientX,y:e.clientY,id:e.pointerId,primary:e.isPrimary,button:e.button}));`,sessionId);
    const before=await buttonRect();await dragButton(before.left+before.width/2-200,before.top+before.height/2+120);
    const moved=await buttonRect();assert.ok(Math.abs(moved.left-(before.left-200))<1&&Math.abs(moved.top-(before.top+120))<1,JSON.stringify({before,moved,events:await client.evaluate('uiEvents',sessionId),errors:await client.evaluate('errors',sessionId)}));assert.equal(await mode(),'Norin');
    await dragButton(0,0);let edge=await buttonRect();assert.ok(edge.left>=0&&edge.top>=0);
    await dragButton(1399,899);edge=await buttonRect();assert.ok(edge.right<=1400&&edge.bottom<=900);assert.equal(await mode(),'Norin');
    await client.call('Emulation.setDeviceMetricsOverride',{width:600,height:450,deviceScaleFactor:1,mobile:false},sessionId);await delay(100);
    const small=await buttonRect();assert.ok(small.left>=0&&small.top>=0&&small.right<=600&&small.bottom<=450);
    await client.call('Emulation.setDeviceMetricsOverride',{width:1400,height:900,deviceScaleFactor:1,mobile:false},sessionId);await delay(100);
    const saved=await buttonRect();const oldOrigin=await client.evaluate('performance.timeOrigin',sessionId);
    await client.call('Page.reload',{},sessionId);
    for(let i=0;i<100;i++){await delay(30);if(await client.evaluate(`performance.timeOrigin>${oldOrigin}&&!!window.norinTest&&!!document.querySelector('#norin-floating-toggle')`,sessionId))break;}
    for(let i=0;i<100;i++){
      const painted=await client.evaluate(`!!window.norinTest&&!norinTest.pending&&!norinTest.dirtyRecords.size&&!!CSS.highlights.get('norin-original')?.size`,sessionId);
      if(painted){await delay(50);break;}await delay(30);
    }
    const restored=await buttonRect();assert.ok(Math.abs(restored.left-saved.left)<1&&Math.abs(restored.top-saved.top)<1);
    result.checks.floatingToggleClick=true;result.checks.dragWithoutToggle=true;result.checks.dragClampedToWindow=true;result.checks.resizeClamping=true;result.checks.positionSurvivesReload=true;
    console.log(JSON.stringify(result,null,2));
    const screenshot=await client.call('Page.captureScreenshot',{format:'png'},sessionId);fs.writeFileSync(path.join(temporary,'preview.png'),Buffer.from(screenshot.data,'base64'));
    console.log(`Preview: ${path.join(temporary,'preview.png')}`);
    // Image/CSP failures must leave a readable vector fallback.
    const injected=await client.call('Page.addScriptToEvaluateOnNewDocument',{source:`window.Image=function(){const image=document.createElement('img');image.decode=()=>Promise.reject(new Error('simulated image failure'));return image;};`},sessionId);
    await client.call('Page.navigate',{url:'file://'+html},sessionId);
    let fallback=false;
    for(let i=0;i<100;i++){
      fallback=await client.evaluate(`!!window.norinTest&&[...norinTest.templates.values()].some(t=>t.ready&&t.failed)&&!!CSS.highlights.get('norin-original')?.size&&!norinTest.pending`,sessionId);
      if(fallback)break;await delay(30);
    }
    assert.ok(fallback,'vector fallback remains readable when image decoding fails');
    console.log('Image-failure fallback: passed');
    await client.call('Page.removeScriptToEvaluateOnNewDocument',{identifier:injected.identifier},sessionId);
    await punctuationRegression(client,sessionId);
    await wrappedRegression(client,sessionId);
    await strictRegression(client,sessionId);
    if(process.argv.includes('--benchmark'))await benchmark(client,sessionId);
  }finally{client.socket.close();chrome.kill();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
