// ==UserScript==
// @name         Norin Everywhere
// @namespace    https://github.com/TheCyaniteProject/norin
// @match        https://*/*
// @match        http://*/*
// @run-at       document-idle
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @connect      raw.githubusercontent.com
// @version      3.0.0
// @description  English-to-Norin font overlays, including Discord PWA. Original text and input values stay English.
// ==/UserScript==

(() => {
'use strict';
// Prepare and retain text well beyond both viewport and nested scroll edges. High values may cause lag.
const RENDER_AHEAD_PX=3400;

// Minimum rendered font size in CSS pixels.
const MIN_NORIN_FONT_SIZE=18;

// Font source (update @connect too if changing the host).
const FONT_URL='https://raw.githubusercontent.com/TheCyaniteProject/norin/main/norin-font/Norin.ttf';

// Maximum work per foreground frame before yielding.
const FRAME_BUDGET_MS=7;

// Maximum entries retained in each rendering cache.
const LIMITS={spellings:4000,shapes:1000,templates:2000,views:2500};

// Space around the mapped editing caret, in em.
const CARET_GAP=.22;

// Number of new word templates prepared per batch.
const TEMPLATE_BATCH_SIZE=32;

// Polling interval for silent form-control changes, in milliseconds.
const CONTROL_POLL_MS=500;

// Font download timeout, in milliseconds.
const FONT_DOWNLOAD_TIMEOUT_MS=20000;

// Settings: strings match an exact, case-sensitive class name. Regexes test
// each class name (use /pattern/i for case-insensitive matching).
// Plain entries exclude direct text only; {match, subtree:true} excludes children.
const CLASS_EXCLUSIONS = [
  /Username/,
  {match: 'applicationSublabel_nByiE3', subtree: true},
  {match: /codeBlock|code-block/, subtree: true}
];
let phoneticMap;
let phoneticKeys = [];
const bundledMappings = {
  "replacements": {
    "’": "'",
    "“": "\"",
    "”": "\"",
    "—": "-",
    "00devcomment_case": "Phonetic rules below are lowercase-only so uppercase can pass through mostly unchanged.",
    "write_word": {
      "regex": "\\b[Ww]rite\\b",
      "replace": "rit"
    },
    "writes_word": {
      "regex": "\\b[Ww]rites\\b",
      "replace": "rits"
    },
    "writer_word": {
      "regex": "\\b[Ww]riter\\b",
      "replace": "riter"
    },
    "writers_word": {
      "regex": "\\b[Ww]riters\\b",
      "replace": "riters"
    },
    "writing_word": {
      "regex": "\\b[Ww]riting\\b",
      "replace": "riting"
    },
    "written_word": {
      "regex": "\\b[Ww]ritten\\b",
      "replace": "riten"
    },
    "have_word": {
      "regex": "\\b[Hh]ave\\b",
      "replace": "hav"
    },
    "has_word": {
      "regex": "\\b[Hh]as\\b",
      "replace": "haz"
    },
    "said_word": {
      "regex": "\\b[Ss]aid\\b",
      "replace": "sed"
    },
    "says_word": {
      "regex": "\\b[Ss]ays\\b",
      "replace": "sez"
    },
    "does_word": {
      "regex": "\\b[Dd]oes\\b",
      "replace": "duz"
    },
    "was_word": {
      "regex": "\\b[Ww]as\\b",
      "replace": "wuz"
    },
    "were_word": {
      "regex": "\\b[Ww]ere\\b",
      "replace": "wur"
    },
    "soft_g_initial": {
      "regex": "\\b[Gg](?=(?:iants?|yms?|ymnast(?:s|ic|ics)?|ems?|erms?|entle|ently|eneral(?:s|ly)?|eneration(?:s)?|enius(?:es)?|iraffes?)\\b)",
      "replace": "j"
    },
    "soft_g_words": {
      "regex": {
        "\\b([Mm]a)g(?=ic(?:al|ally)?\\b)": "$1j",
        "\\b([Ee]n)g(?=ine(?:s|er|ers|ering)?\\b)": "$1j",
        "\\b([Dd]an)g(?=er(?:s|ous|ously)?\\b)": "$1j",
        "\\b([Oo]ran)g(?=es?\\b)": "$1j",
        "\\b([Aa])g(?=e(?:s|d|ing)?\\b)": "$1j",
        "\\b([Pp]a|[Cc]a|[Ll]ar|[Hh]u|[Cc]han|[Ss]ta)g(?=e(?:s|d)?\\b)": "$1j"
      }
    },
    "im_contraction": {
      "regex": "\\b[Ii]'m\\b",
      "replace": "i am"
    },
    "ive_contraction": {
      "regex": "\\b[Ii]'ve\\b",
      "replace": "i have"
    },
    "ill_contraction": {
      "regex": "\\b[Ii]'ll\\b",
      "replace": "i will"
    },
    "and_word": {
      "regex": "\\b[Aa]nd\\b",
      "replace": "y"
    },
    "he_word": {
      "regex": "\\b[Hh]e\\b",
      "replace": "hee"
    },
    "she_word": {
      "regex": "\\b[Ss]he\\b",
      "replace": "shee"
    },
    "me_word": {
      "regex": "\\b[Mm]e\\b",
      "replace": "mee"
    },
    "we_word": {
      "regex": "\\b[Ww]e\\b",
      "replace": "wee"
    },
    "be_word": {
      "regex": "\\b[Bb]e\\b",
      "replace": "bee"
    },
    "one_word": {
      "regex": "\\b[Oo]ne\\b",
      "replace": "won"
    },
    "once_word": {
      "regex": "\\b[Oo]nce\\b",
      "replace": "wuns"
    },
    "two_word": {
      "regex": "\\b[Tt]wo\\b",
      "replace": "too"
    },
    "of_word": {
      "regex": "\\b[Oo]f\\b",
      "replace": "uv"
    },
    "done_word": {
      "regex": "\\b[Dd]one\\b",
      "replace": "dun"
    },
    "some_word": {
      "regex": "\\b[Ss]ome\\b",
      "replace": "sum"
    },
    "come_word": {
      "regex": "\\b[Cc]ome\\b",
      "replace": "kum"
    },
    "from_word": {
      "regex": "\\b[Ff]rom\\b",
      "replace": "frum"
    },
    "people_word": {
      "regex": "\\b[Pp]eople\\b",
      "replace": "peepul"
    },
    "woman_word": {
      "regex": "\\b[Ww]oman\\b",
      "replace": "wuman"
    },
    "could_word": {
      "regex": "\\b[Cc]ould\\b",
      "replace": "kud"
    },
    "would_word": {
      "regex": "\\b[Ww]ould\\b",
      "replace": "wud"
    },
    "should_word": {
      "regex": "\\b[Ss]hould\\b",
      "replace": "shud"
    },
    "young_word": {
      "regex": "\\b[Yy]oung\\b",
      "replace": "yung"
    },
    "touch_word": {
      "regex": "\\b[Tt]ouch\\b",
      "replace": "tuch"
    },
    "blood_word": {
      "regex": "\\b[Bb]lood\\b",
      "replace": "blud"
    },
    "great_word": {
      "regex": "\\b[Gg]reat\\b",
      "replace": "grait"
    },
    "break_word": {
      "regex": "\\b[Bb]reak\\b",
      "replace": "braik"
    },
    "steak_word": {
      "regex": "\\b[Ss]teak\\b",
      "replace": "staik"
    },
    "who_word": {
      "regex": "\\b[Ww]ho\\b",
      "replace": "hoo"
    },
    "whole_word": {
      "regex": "\\b[Ww]hole\\b",
      "replace": "hol"
    },
    "through_word": {
      "regex": "\\b[Tt]hrough\\b",
      "replace": "throo"
    },
    "though_word": {
      "regex": "\\b[Tt]hough\\b",
      "replace": "tho"
    },
    "thought_word": {
      "regex": "\\b[Tt]hought\\b",
      "replace": "thaut"
    },
    "bought_word": {
      "regex": "\\b[Bb]ought\\b",
      "replace": "baut"
    },
    "rough_word": {
      "regex": "\\b[Rr]ough\\b",
      "replace": "ruf"
    },
    "tough_word": {
      "regex": "\\b[Tt]ough\\b",
      "replace": "tuf"
    },
    "enough_word": {
      "regex": "\\b[Ee]nough\\b",
      "replace": "enuf"
    },
    "cough_word": {
      "regex": "\\b[Cc]ough\\b",
      "replace": "kof"
    },
    "bough_word": {
      "regex": "\\b[Bb]ough\\b",
      "replace": "bau"
    },
    "laugh_word": {
      "regex": "\\b[Ll]augh\\b",
      "replace": "laf"
    },
    "laughing_word": {
      "regex": "\\b[Ll]aughing\\b",
      "replace": "lafing"
    },
    "laughter_word": {
      "regex": "\\b[Ll]aughter\\b",
      "replace": "lafter"
    },
    "sch": {
      "regex": {
        "[Ss]ch": "sk"
      }
    },
    "tch": {
      "regex": {
        "[Tt]ch": "ch"
      }
    },
    "dge": {
      "regex": "dge",
      "replace": "j"
    },
    "aigh": {
      "regex": "aigh",
      "replace": "ai"
    },
    "eigh": {
      "regex": "eigh",
      "replace": "ai"
    },
    "igh": {
      "regex": "igh",
      "replace": "ai"
    },
    "augh": {
      "regex": "augh",
      "replace": "au"
    },
    "tion": {
      "regex": "tion",
      "replace": "shon"
    },
    "sion": {
      "regex": "sion",
      "replace": "shon"
    },
    "tial": {
      "regex": "tial",
      "replace": "shal"
    },
    "cial": {
      "regex": "cial",
      "replace": "shal"
    },
    "tian": {
      "regex": "tian\\b",
      "replace": "shan"
    },
    "cian": {
      "regex": "cian\\b",
      "replace": "shan"
    },
    "oar": {
      "regex": "oar",
      "replace": "or"
    },
    "rea": {
      "regex": "[Rr]ea",
      "replace": "ree"
    },
    "wr": {
      "regex": "\\bwr",
      "replace": "r"
    },
    "kn": {
      "regex": "\\bkn",
      "replace": "n"
    },
    "gn": {
      "regex": "\\bgn",
      "replace": "n"
    },
    "ps": {
      "regex": "\\bps",
      "replace": "s"
    },
    "pn": {
      "regex": "\\bpn",
      "replace": "n"
    },
    "pt": {
      "regex": "\\bpt",
      "replace": "t"
    },
    "rh": {
      "regex": "\\brh",
      "replace": "r"
    },
    "qu": {
      "regex": "[Qq]u",
      "replace": "kw"
    },
    "q": {
      "regex": {
        "q": "k",
        "Q": "K"
      }
    },
    "ph": {
      "regex": {
        "[Pp]h": "f",
        "PH": "F"
      }
    },
    "air": {
      "regex": {
        "eir": "air",
        "(th)ere(?=[^a-z]|$)": "$1air",
        "(wh)ere(?=[^a-z]|$)": "$1air",
        "([bwp])ear(?=[^a-z]|$)": "$1air",
        "(?<=[^aeiou])are(?=[^a-z]|$)": "air",
        "([Tt]h)ey'?re(?=[^a-z]|$)": "$1air'"
      }
    },
    "wh": {
      "regex": "[Ww]h",
      "replace": "w"
    },
    "ck": {
      "regex": {
        "[Cc]k": "k",
        "CK": "kk"
      }
    },
    "sc": {
      "regex": {
        "sc(?=[eiy])": "s",
        "sc": "sk",
        "[Ss]c(?=[eiy])": "s",
        "[Ss]c": "sk",
        "SC(?=[eiy])": "S",
        "SC": "SK"
      }
    },
    "cc": {
      "regex": {
        "[Cc]c(?=[eiy])": "ks",
        "[Cc]c": "k",
        "CC(?=[eiy])": "KS",
        "CC": "KK"
      }
    },
    "dg": {
      "regex": "dg(?=[eiy])",
      "replace": "j"
    },
    "c": {
      "regex": {
        "c(?=[eiy])": "s",
        "c(?![heiy])": "k",
        "C(?=[eiy])": "S",
        "C(?![heiy])": "K"
      }
    },
    "gh_before_t_silent": {
      "regex": "(?<=[aeiou])gh(?=t)",
      "replace": ""
    },
    "gh_final_silent": {
      "regex": "(?<=[aeiou])gh(?=[^a-z]|$)",
      "replace": ""
    },
    "x_initial": {
      "regex": "\\bx",
      "replace": "z"
    },
    "x_medial": {
      "regex": "(?<=[aeiou])x(?=[aeiou])",
      "replace": "gz"
    },
    "x_default": {
      "regex": "x",
      "replace": "ks"
    },
    "ll": "l",
    "tt": "t",
    "ff": "f",
    "ss": "s",
    "bb": "b",
    "dd": "d",
    "gg": "g",
    "mm": "m",
    "nn": "n",
    "pp": "p",
    "rr": "r",
    "final_y": {
      "regex": "(?<=[a-z]{2})y(?=s?(?:[^a-z]|$))",
      "replace": "i"
    }
  }
};
const fontCodes=Object.create(null);
for(const [keys,start,stride] of [
  [['a','e','i','o','u'],0xE000,4],
  [['air','au','ch','ee','ng','oo','sh','th'],0xE014,3],
  [['b','d','f','g','h','j','k','l','m','n','p','r','s','t','v','w','y','z'],0xE02C,3]
])keys.forEach((key,index)=>{fontCodes[key]={code:start+index*stride,mark:stride===4};});
let replacementRules = [];

function buildReplacementRules(map) {
  const rules = [];

  if (map && map.replacements && typeof map.replacements === 'object') {
    for (const [key, val] of Object.entries(map.replacements)) {
      if (typeof val === 'string') {
        if(!/^[a-z]+$/i.test(key))continue;
        rules.push({ re: new RegExp(escapeRegex(key), 'gu'), repl: val });
        continue;
      }

      if (val && typeof val === 'object') {
        const flags = typeof val.flags === 'string' ? val.flags : 'gu';

        if (val.regex) {
          if (typeof val.regex === 'string') {
            const repl = typeof val.replace === 'string' ? val.replace : '';
            rules.push({ re: new RegExp(val.regex, flags), repl });
            continue;
          }
          if (typeof val.regex === 'object') {
            for (const [pat, repl] of Object.entries(val.regex)) {
              rules.push({ re: new RegExp(pat, flags), repl });
            }
            continue;
          }
        }

        if (typeof val.replace === 'string') {
          rules.push({ re: new RegExp(escapeRegex(key), 'gu'), repl: val.replace });
          continue;
        }
      }
    }
  }

  return rules;
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeText(text) {
  if (!text) return text;
  try {
    text = text.normalize('NFC').replace(/\u00ad/g,'');
  } catch (e) {}

  for (const rule of replacementRules) {
    if (!rule) continue;
    if (rule.re instanceof RegExp) {
      text = text.replace(rule.re, rule.repl);
    } else if (rule.re === null && rule.repl && rule.repl.from) {
      text = text.split(rule.repl.from).join(rule.repl.to);
    }
  }
  return text;
}

// Glyph variants carry their own placement and advance widths in Norin.ttf.
function renderInto(target, rawText, opts = {}) {
  target.replaceChildren();
  const text=opts.alreadyNormalized?rawText:normalizeText(rawText);
  const word=document.createElement('span');word.className='norin-word';target.append(word);
  const tokens=[];
  for(let i=0;i<text.length;){
    const key=phoneticKeys.find(key=>text.slice(i,i+key.length).toLowerCase()===key);
    if(!key){
      const literal=String.fromCodePoint(text.codePointAt(i));
      tokens.push({text:literal,start:i,end:i+literal.length});i+=literal.length;continue;
    }
    const entry=fontCodes[key],previous=tokens.at(-1),upper=text.slice(i,i+key.length)===key.toUpperCase();
    if(entry.mark&&previous?.key&&!previous.accent&&!(opts.readerMode&&upper)){
      previous.accent={code:entry.code+3,start:i,end:i+key.length};
    }else tokens.push({key,code:entry.code,start:i,end:i+key.length});
    i+=key.length;
  }
  function emit(token,variant=0){
    const span=document.createElement('span');
    span.className=token.key?'norin-character':'literal-source';
    span.dataset.norinStart=String(token.start);span.dataset.norinEnd=String(token.end);
    span.textContent=token.key?String.fromCodePoint(token.code+variant):token.text;word.append(span);
    if(token.accent){const accent=document.createElement('span');accent.className='norin-character';accent.dataset.norinStart=String(token.accent.start);accent.dataset.norinEnd=String(token.accent.end);accent.textContent=String.fromCodePoint(token.accent.code);word.append(accent);}
  }
  for(let i=0;i<tokens.length;){
    if(!opts.unstacked&&!(opts.readerMode&&text===text.toUpperCase()&&/[A-Z]/.test(text))&&tokens.slice(i,i+3).length===3&&tokens.slice(i,i+3).every(t=>t.key)){
      emit(tokens[i]);emit(tokens[i+1],1);emit(tokens[i+2],2);i+=3;
    }else emit(tokens[i++]);
  }
}

let enabled=true;
let floatingControl=null;
function norinFontSize(cs){return Math.max(MIN_NORIN_FONT_SIZE,parseFloat(cs.fontSize)||16);}
const layer=document.createElement('div');
layer.id='norin-userscript-layer';
layer.setAttribute('aria-hidden','true');
layer.style.cssText='position:fixed;left:0;top:0;width:0;height:0;pointer-events:none;visibility:hidden;overflow:hidden';
const shadow=layer.attachShadow({mode:'open'});
const renderCSS=`
:host{all:initial;pointer-events:none}
.norin-edit-word,.word{position:absolute;width:max-content;white-space:nowrap;transform-origin:0 0;line-height:1}
.norin-character{font-family:NorinEverywhere}
.norin-input-mirror>*{flex-shrink:0}
.norin-caret{position:absolute;display:block;width:1px;pointer-events:none;user-select:none;animation:norin-caret-blink 1s step-end infinite;z-index:2}
@keyframes norin-caret-blink{0%,45%{opacity:1}50%,100%{opacity:0}}
@media(prefers-reduced-motion:reduce){.norin-caret{animation:none}}
`;
const sharedSheet=new CSSStyleSheet(); sharedSheet.replaceSync(renderCSS);
shadow.adoptedStyleSheets=[sharedSheet];
const pageStyle=document.createElement('style');
pageStyle.textContent=`[data-norin-custom-caret],[data-norin-custom-caret] *{caret-color:transparent!important}
::highlight(norin-original){color:transparent;text-shadow:none}
[data-norin-input]{-webkit-text-fill-color:transparent!important;text-shadow:none!important}
[data-norin-input]::placeholder{color:transparent!important;-webkit-text-fill-color:transparent!important}`;
const skip='pre,code,kbd,samp,[data-slate-type="code-block"],[data-slate-type="code-line"],area,[data-norin-mount],script,style,noscript,svg,canvas,select,option,title,head,[data-norin-ignore],#norin-userscript-layer,input[name*="username" i],input[id*="username" i],textarea[name*="username" i],textarea[id*="username" i],[autocomplete~="username" i],[autocomplete~="current-password" i],[autocomplete~="new-password" i],input[type="password"]';
function excludedClass(element,subtreeOnly=false){
  if(!element)return false;
  return CLASS_EXCLUSIONS.some(rule=>{
    const descriptor=typeof rule==='object'&&!(rule instanceof RegExp);
    if(subtreeOnly&&!(descriptor&&rule.subtree))return false;
    const pattern=descriptor?rule.match:rule;
    return [...element.classList].some(name=>{
      if(typeof pattern==='string')return name===pattern;
      if(!(pattern instanceof RegExp))return false;
      const previous=pattern.lastIndex;pattern.lastIndex=0;
      const matches=pattern.test(name);pattern.lastIndex=previous;return matches;
    });
  });
}
function excludedSubtree(element){
  if(element?.closest(skip))return true;
  for(let current=element;current;current=current.parentElement)if(excludedClass(current,true))return true;
  return false;
}
const textNodes=new Map(), scopes=new Map(), controls=new Map(), mounts=new Map(), anchors=new Map();
const activeRecords=new Set(), dirtyRecords=new Set(), removedRoots=new Set();
const spellings=new Map(), shapes=new Map(), templates=new Map(), detachedViews=new Map(), recycledViews=new Map();
const ownStyles=new WeakMap(), writtenStyles=new WeakMap();
let pending=false, selectionPending=false, highlightsDirty=true, fontEpoch=0;
let styleCache=new Map(), scopeCache=new Map(), clipCache=new Map(), codeCache=new WeakMap();
let scrollTimer=0;
const scrollRoots=new Set();
function setStyles(el,values){
  let previous=writtenStyles.get(el);if(!previous){previous={};writtenStyles.set(el,previous);}
  let changed=false;
  for(const [key,value] of Object.entries(values))if(previous[key]!==value){
    if(el.style[key]!==value){el.style[key]=value;changed=true;}
    previous[key]=value;
  }
  return changed;
}
function setAttr(el,name,value){if(el.getAttribute(name)!==value)el.setAttribute(name,value);}
function styleOf(el){if(!styleCache.has(el))styleCache.set(el,getComputedStyle(el));return styleCache.get(el);}
function scopeFor(el){
  if(!el)return document.body;
  if(!scopeCache.has(el))scopeCache.set(el,/^(inline|contents)/.test(styleOf(el).display)?scopeFor(el.parentElement):el);
  return scopeCache.get(el);
}
function literalToken(text){return text.includes('@')||/^https?:\/\//i.test(text);}
function literalLink(el){const link=el?.closest('a,[role="link"]');return !!link&&literalToken(link.textContent.trimStart());}
function dirty(record,urgent=false){
  if(!record||record.disposed)return;
  if(urgent){dirtyRecords.delete(record);const rest=[...dirtyRecords];dirtyRecords.clear();dirtyRecords.add(record);for(const r of rest)dirtyRecords.add(r);}
  else dirtyRecords.add(record);
  schedule();
}
function schedule(){if(pending||!enabled||document.hidden)return;pending=true;requestAnimationFrame(flush);}
function recordFor(scope){
  let record=scopes.get(scope);
  if(!record){
    record={kind:'text',element:scope,nodes:new Set(),emojis:new Set(),near:false,ranges:[],mounts:new Set()};
    scopes.set(scope,record);intersection.observe(scope);
  }
  return record;
}
const emojiRecords=new Map(),movedEmojis=new Set();
const emojiText=/\p{Extended_Pictographic}|\p{Regional_Indicator}/u;
function addEmoji(element,recover=false){
  let carrier=element;
  if(element.tagName==='IMG'){
    const hint=`${element.getAttribute('src')||''} ${element.className}`;
    if(/avatar|attachment|profile_images|\/avatars\//i.test(hint))return;
    if(!emojiText.test(element.alt||'')&&!/emoji|twemoji/i.test(hint))return;
    for(let i=0;i<2;i++){
      const parent=carrier.parentElement;
      if(!parent||parent.tagName!=='SPAN'||parent.childElementCount!==1||parent.textContent.trim())break;
      carrier=parent;
    }
  }else{
    if(!element.matches('span,[role="img"]')||element.childElementCount||!emojiText.test(element.textContent)||/[\p{L}\p{N}]/u.test(element.textContent))return;
  }
  if(excludedSubtree(carrier))return;
  const group=recordFor(scopeFor(carrier.parentElement));
  let record=emojiRecords.get(carrier);
  if(!record){
    record={element:carrier,group,original:carrier.style.getPropertyValue('translate'),priority:carrier.style.getPropertyPriority('translate'),dx:0,desired:0,applied:false,expected:''};
    emojiRecords.set(carrier,record);group.emojis.add(record);
  }else if(record.group!==group){record.group.emojis.delete(record);dirty(record.group);record.group=group;group.emojis.add(record);}
  if(recover){const r=carrier.getBoundingClientRect();if(r.bottom>-RENDER_AHEAD_PX&&r.top<innerHeight+RENDER_AHEAD_PX&&r.right>-RENDER_AHEAD_PX&&r.left<innerWidth+RENDER_AHEAD_PX&&!group.near){group.near=true;activeRecords.add(group);resize.observe(group.element);}}
  if(group.near)dirty(group);
}
function restoreEmoji(record){
  if(record.applied&&record.element.style.getPropertyValue('translate')===record.expected){
    if(record.original)record.element.style.setProperty('translate',record.original,record.priority);else record.element.style.removeProperty('translate');
    ownStyles.set(record.element,record.element.getAttribute('style'));
  }
  record.applied=false;record.dx=0;movedEmojis.delete(record);
}
function showEmoji(record){
  const value=`${record.desired}px 0px`;
  if(Math.abs(record.desired)<.05){restoreEmoji(record);return;}
  if(!record.applied||Math.abs(record.dx-record.desired)>.01||record.element.style.getPropertyValue('translate')!==record.expected){
    record.element.style.setProperty('translate',value);ownStyles.set(record.element,record.element.getAttribute('style'));
    record.expected=record.element.style.getPropertyValue('translate');record.dx=record.desired;record.applied=true;movedEmojis.add(record);
  }
}
function dropEmoji(record){restoreEmoji(record);record.group.emojis.delete(record);emojiRecords.delete(record.element);dirty(record.group);}
function emojiPlacement(record){
  const el=record.element;
  if(!el.isConnected){dropEmoji(record);return null;}
  if(excludedSubtree(el)){restoreEmoji(record);return null;}
  if(record.applied&&el.style.getPropertyValue('translate')!==record.expected){record.applied=false;record.dx=0;record.original=el.style.getPropertyValue('translate');record.priority=el.style.getPropertyPriority('translate');}
  if(!record.applied&&styleOf(el).translate!=='none')return null;
  const bounds=el.getBoundingClientRect(),size=parseFloat(styleOf(el).fontSize)||16,clip=renderClipFor(el.parentElement);
  const rect={left:bounds.left-record.dx,right:bounds.right-record.dx,top:bounds.top,bottom:bounds.bottom,width:bounds.width,height:bounds.height};
  if(!rect.width||!rect.height||rect.height>size*4||rect.right<=clip.left||rect.left>=clip.right||rect.bottom<=clip.top||rect.top>=clip.bottom){restoreEmoji(record);return null;}
  return {kind:'emoji',emoji:record,rect,size,naturalWidth:rect.width};
}
function emojiGapHasText(previous,current){
  try{
    const range=document.createRange();
    if(previous.kind==='emoji')range.setStartAfter(previous.emoji.element);else range.setStart(previous.word.range.endContainer,previous.word.range.endOffset);
    if(current.kind==='emoji')range.setEndBefore(current.emoji.element);else range.setEnd(current.word.range.startContainer,current.word.range.startOffset);
    return !!range.toString().trim();
  }catch(_){return true;}
}
function addNode(node,resetRanges=false,recover=false){
  if(!node.parentElement||excludedSubtree(node.parentElement)||node.parentElement.closest('input,textarea'))return;
  let record=textNodes.get(node);
  if(!record&&!/[a-z0-9\x21-\x2f\x3a-\x40\x5b-\x60\x7b-\x7e]/i.test(node.data))return;
  const group=recordFor(scopeFor(node.parentElement));
  if(!record){record={node,text:null,words:[],group};textNodes.set(node,record);group.nodes.add(record);}
  else if(record.group!==group){record.group.nodes.delete(record);dirty(record.group);record.group=group;group.nodes.add(record);}
  // Ranges are live and may collapse even when a framework writes the same string.
  if(resetRanges)record.text=null;
  if(recover){
    const rect=node.parentElement.getBoundingClientRect(),clip=renderClipFor(node.parentElement);
    if(rect.width&&rect.height&&rect.bottom>clip.top&&rect.top<clip.bottom&&rect.right>clip.left&&rect.left<clip.right){
      const missing=record.text!==node.data||record.words.length>0&&!record.words.some(w=>w.box?.isConnected||[...(w.fragments?.values()||[])].some(f=>f.box?.isConnected));
      if(!group.near){group.near=true;activeRecords.add(group);resize.observe(group.element);dirty(group);}
      else if(missing)dirty(group);
    }
  }else if(group.near)dirty(group);
}
function addControl(input){
  if(excludedSubtree(input)||excludedClass(input)||input.tagName==='INPUT'&&!['text','search','email','url','tel'].includes(input.type)){
    if(controls.has(input))disposeControl(controls.get(input));return;
  }
  if(!controls.has(input)){
    const record={kind:'control',element:input,near:false,view:null,value:null,ranges:[],mounts:new Set()};
    controls.set(input,record);intersection.observe(input);
  }
}
function track(root,resetRanges=false,recover=false){
  if(root.nodeType===Node.TEXT_NODE){addNode(root,resetRanges,recover);return;}
  if(!(root instanceof Element)||excludedSubtree(root))return;
  if(root.matches('input,textarea')){addControl(root);return;}
  addEmoji(root,recover);
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_ELEMENT|NodeFilter.SHOW_TEXT,{
    acceptNode(n){
      if(n.nodeType===Node.ELEMENT_NODE){if(n.matches(skip)||excludedClass(n,true))return NodeFilter.FILTER_REJECT;if(n.matches('input,textarea')){addControl(n);return NodeFilter.FILTER_REJECT;}addEmoji(n,recover);return NodeFilter.FILTER_SKIP;}
      return /[a-z0-9\x21-\x2f\x3a-\x40\x5b-\x60\x7b-\x7e]/i.test(n.data)||textNodes.has(n)?NodeFilter.FILTER_ACCEPT:NodeFilter.FILTER_REJECT;
    }
  });
  let node;while((node=walker.nextNode()))addNode(node,resetRanges,recover);
}
const intersection=new IntersectionObserver(entries=>{
  for(const entry of entries){
    const record=scopes.get(entry.target)||controls.get(entry.target);if(!record)continue;
    const wasNear=record.near;record.intersecting=entry.isIntersecting;record.near=entry.isIntersecting;
    if(record.near){activeRecords.add(record);resize.observe(record.element);}
    else{activeRecords.delete(record);resize.unobserve(record.element);}
    if(wasNear||record.near)dirty(record);
  }
},{rootMargin:`${RENDER_AHEAD_PX}px`,scrollMargin:`${RENDER_AHEAD_PX}px`,threshold:0});
const resize=new ResizeObserver(entries=>{
  for(const entry of entries){
    const record=scopes.get(entry.target)||controls.get(entry.target);if(!record)continue;
    const key=`${entry.contentRect.width}:${entry.contentRect.height}`;
    if(record.size!==key){record.size=key;dirty(record);}
  }
});
function removeBucket(entry){const bucket=recycledViews.get(entry.key);if(bucket){bucket.delete(entry);if(!bucket.size)recycledViews.delete(entry.key);}}
function trimViews(){
  while(detachedViews.size>LIMITS.views){
    const [box,entry]=detachedViews.entries().next().value;detachedViews.delete(box);
    if(entry.word){entry.word.box=null;entry.word.glyph=null;entry.word.template=null;}
    else removeBucket(entry);
  }
}
function parkWord(word,recycle=false){
  if(word.fragments)for(const fragment of word.fragments.values())parkWord(fragment,recycle);
  if(!word.box)return;
  const box=word.box;box.remove();
  let entry=detachedViews.get(box);
  if(!entry){entry={box,glyph:word.glyph,template:word.template,key:word.template.key,word};detachedViews.set(box,entry);}
  if(recycle){entry.word=null;if(!recycledViews.has(entry.key))recycledViews.set(entry.key,new Set());recycledViews.get(entry.key).add(entry);word.box=null;word.glyph=null;word.template=null;}
  trimViews();
}
function reclaimWord(word,key){
  if(word.box){detachedViews.delete(word.box);return;}
  const entry=recycledViews.get(key)?.values().next().value;if(!entry)return;
  removeBucket(entry);detachedViews.delete(entry.box);word.box=entry.box;word.glyph=entry.glyph;word.template=entry.template;
}
function releaseWords(record,recycle=false){for(const word of record.words)parkWord(word,recycle);}
function dropNode(record){releaseWords(record,true);record.group.nodes.delete(record);textNodes.delete(record.node);dirty(record.group);}
function clipFor(el){
  if(!el)return{left:0,top:0,right:innerWidth,bottom:innerHeight};
  if(clipCache.has(el))return clipCache.get(el);
  const c={...clipFor(el.parentElement)},cs=styleOf(el);
  // Root overflow clips the viewport, not the root's scrolling DOM rectangle.
  // When both root axes are visible, HTML also propagates body overflow to the
  // viewport. Applying either element's box again creates a fixed page cutoff.
  const rootStyle=el===document.body?styleOf(document.documentElement):null;
  const viewportOverflow=el===document.documentElement||rootStyle&&rootStyle.overflowX==='visible'&&rootStyle.overflowY==='visible';
  if(!viewportOverflow&&cs.display!=='inline'&&cs.display!=='contents'&&/auto|scroll|hidden|clip/.test(cs.overflowX+cs.overflowY)){
    const b=el.getBoundingClientRect();
    if(/auto|scroll|hidden|clip/.test(cs.overflowX)){c.left=Math.max(c.left,b.left+el.clientLeft);c.right=Math.min(c.right,b.left+el.clientLeft+el.clientWidth);}
    if(/auto|scroll|hidden|clip/.test(cs.overflowY)){c.top=Math.max(c.top,b.top+el.clientTop);c.bottom=Math.min(c.bottom,b.top+el.clientTop+el.clientHeight);}
  }
  clipCache.set(el,c);return c;
}
function renderClipFor(el){
  const clip=clipFor(el);
  return {left:clip.left-RENDER_AHEAD_PX,right:clip.right+RENDER_AHEAD_PX,
    top:clip.top-RENDER_AHEAD_PX,bottom:clip.bottom+RENDER_AHEAD_PX};
}
function mountFor(owner,group){
  let mount=[...group.mounts].find(m=>m.owner===owner);
  if(mount&&!mount.host.isConnected)owner.append(mount.host);
  if(!mount){
    const host=document.createElement('div');host.setAttribute('data-norin-mount','');host.setAttribute('aria-hidden','true');
    // Contain overlay descendants at the source's normal stacking level so
    // page dialogs, menus, and backdrops can cover the underlying text.
    host.style.cssText='all:initial;position:absolute;left:0;top:0;width:0;height:0;overflow:visible;pointer-events:none;visibility:inherit;z-index:0';
    const root=host.attachShadow({mode:'open'});root.adoptedStyleSheets=[sharedSheet];
    let anchor=anchors.get(owner);
    if(!anchor){
      const cs=styleOf(owner);anchor={oldPosition:owner.style.position,changedPosition:cs.position==='static'&&cs.transform==='none',count:0};anchors.set(owner,anchor);
      if(anchor.changedPosition){owner.style.position='relative';ownStyles.set(owner,owner.getAttribute('style'));}
    }
    anchor.count++;
    owner.append(host);mount={host,root,owner,anchor,group};mounts.set(host,mount);
  }
  const currentStyle=styleOf(owner);
  if(currentStyle.position==='static'&&currentStyle.transform==='none'){
    mount.anchor.oldPosition=owner.style.position;mount.anchor.changedPosition=true;
    owner.style.position='relative';ownStyles.set(owner,owner.getAttribute('style'));
  }
  group.mounts.add(mount);
  return mount;
}
function dropMount(mount){
  mount.host.remove();mounts.delete(mount.host);mount.group.mounts.delete(mount);
  if(--mount.anchor.count===0){
    anchors.delete(mount.owner);
    if(mount.anchor.changedPosition&&mount.owner.style.position==='relative'){
      mount.owner.style.position=mount.anchor.oldPosition;ownStyles.set(mount.owner,mount.owner.getAttribute('style'));
    }
  }
}
// Cache conversion per spelling, but identify rendered words by their glyph layout.
// Only case distinctions that affect the renderer survive in this key.
function wordPlan(text){
  let plan=spellings.get(text);
  if(plan){spellings.delete(text);spellings.set(text,plan);return plan;}
  if(text.includes('`'))plan={key:JSON.stringify(['code',text]),text,normalized:false};
  else{
    const converted=normalizeText(text),layout=[];
    for(const part of converted.split(/(\s+)/)){
      if(!part)continue;
      if(/^\s+$/.test(part)){layout.push(['space',part]);continue;}
      const tokens=[];
      for(let i=0;i<part.length;){
        let key=null;
        for(const candidate of phoneticKeys)if(part.substr(i,candidate.length).toLowerCase()===candidate.toLowerCase()){key=candidate;break;}
        if(key){
          const original=part.substr(i,key.length);
          const upperVowel=!!phoneticMap[key]?.mark&&key.length===1&&/[aeiouy]/i.test(key)&&original===original.toUpperCase()&&/[A-Z]/.test(original);
          tokens.push(['glyph',key,upperVowel]);i+=key.length;
        }else{tokens.push(['literal',part[i]]);i++;}
      }
      layout.push(['word',part===part.toUpperCase()&&/[A-Z]/.test(part),tokens]);
    }
    plan={key:JSON.stringify(layout),text:converted,normalized:true};
  }
  spellings.set(text,plan);if(spellings.size>LIMITS.spellings)spellings.delete(spellings.keys().next().value);
  return plan;
}
function shapeFor(text,flat=false,normalized=false){
  const plan=flat||normalized?{key:JSON.stringify([flat?'editing':'fragment',text]),text,normalized:true}:wordPlan(text);let shape=shapes.get(plan.key);
  if(shape){shapes.delete(plan.key);shapes.set(plan.key,shape);return shape;}
  shape=document.createElement('div');shape.className='word';renderInto(shape,plan.text,{readerMode:true,alreadyNormalized:plan.normalized,unstacked:flat});
  shapes.set(plan.key,shape);if(shapes.size>LIMITS.shapes)shapes.delete(shapes.keys().next().value);return shape;
}
function templateKey(text,cs,flat=false,normalized=false){return JSON.stringify([flat||normalized?JSON.stringify([flat?'editing':'fragment',text]):wordPlan(text).key,cs.fontFamily,cs.fontWeight,cs.fontStyle,cs.color,fontEpoch]);}
function templateFor(text,cs,group,flat=false,normalized=false){
  const key=templateKey(text,cs,flat,normalized);let t=templates.get(key);
  if(t){templates.delete(key);templates.set(key,t);if(!t.ready)t.waiters.add(group);return t;}
  t={key,text,flat,normalized,font:cs.fontFamily,weight:cs.fontWeight,fontStyle:cs.fontStyle,color:cs.color,width:null,node:null,ready:false,waiters:new Set([group])};
  templates.set(key,t);if(templates.size>LIMITS.templates)templates.delete(templates.keys().next().value);return t;
}
function cellInk(cell){
  const range=document.createRange();range.selectNodeContents(cell);return range.getBoundingClientRect();
}
function finishTemplates(list){
  const probes=[];
  for(const t of new Set(list))if(t.width===null){
    if(probes.length>=TEMPLATE_BATCH_SIZE)break;
    const probe=shapeFor(t.text,t.flat,t.normalized).cloneNode(true);
    probe.style.cssText='position:absolute;visibility:hidden;font-size:100px;left:0;top:0;width:max-content;line-height:1';
    setStyles(probe,{fontFamily:t.font,fontWeight:t.weight,fontStyle:t.fontStyle,color:t.color});
    shadow.append(probe);probes.push({t,probe});
  }
  for(const {t,probe}of probes)t.width=probe.getBoundingClientRect().width/100;
  // Cache text bounds for line alignment and source-offset hit testing.
  for(const {t,probe}of probes){
    const origin=probe.getBoundingClientRect();let top=Infinity,bottom=-Infinity;
    for(const word of probe.querySelectorAll('.norin-word'))for(const cell of word.children){
      const ink=cellInk(cell);top=Math.min(top,ink.top);bottom=Math.max(bottom,ink.bottom);
    }
    t.hits=[];
    for(const literal of probe.querySelectorAll('[data-norin-start]')){
      const bounds=cellInk(literal);t.hits.push({start:Number(literal.dataset.norinStart),end:Number(literal.dataset.norinEnd),left:(bounds.left-origin.left)/100,right:(bounds.right-origin.left)/100,top:(bounds.top-origin.top)/100,bottom:(bounds.bottom-origin.top)/100});
    }
    t.inkTop=Number.isFinite(top)?(top-origin.top)/100:0;
    t.inkBottom=Number.isFinite(bottom)?(bottom-origin.top)/100:1;
  }
  for(const {t,probe}of probes){
    t.node=probe.cloneNode(true);t.node.removeAttribute('style');
    setStyles(t.node,{fontFamily:t.font,fontWeight:t.weight,fontStyle:t.fontStyle,color:t.color});
    t.ready=true;
    for(const group of t.waiters)if(group.element.isConnected&&!group.disposed)dirty(group);
    t.waiters.clear();probe.remove();
  }
  // Yield between batches of new text templates.
  for(const t of list)if(t.width===null)for(const group of t.waiters)if(group.near)dirty(group);
}
// Protect literal Markdown code before normalization/tokenization, including split text nodes.
function codeSpans(text){
  const spans=[];const ticks=/`+/g;let open;
  while((open=ticks.exec(text))){
    const start=open.index,length=open[0].length;let end=text.length,close;
    while((close=ticks.exec(text)))if(close[0].length===length){end=ticks.lastIndex;break;}
    spans.push({start,end});
    if(!close)break;
  }
  return spans;
}
function protectedCode(group){
  const root=group.element.closest('[contenteditable="true"],[role="textbox"]')||group.element;
  if(codeCache.has(root))return codeCache.get(root);
  const result=new WeakMap();codeCache.set(root,result);
  if(!root.textContent.includes('`'))return result;
  const pieces=[];let text='';
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_ELEMENT|NodeFilter.SHOW_TEXT,{
    acceptNode(n){if(n.nodeType===Node.ELEMENT_NODE)return (n.matches(skip+',input,textarea')||excludedClass(n,true))?NodeFilter.FILTER_REJECT:NodeFilter.FILTER_SKIP;return NodeFilter.FILTER_ACCEPT;}
  });
  let node;while((node=walker.nextNode())){pieces.push({node,start:text.length,end:text.length+node.data.length});text+=node.data;}
  const spans=codeSpans(text);
  for(const piece of pieces){
    const intervals=spans.filter(s=>s.start<piece.end&&s.end>piece.start).map(s=>({start:Math.max(0,s.start-piece.start),end:Math.min(piece.node.data.length,s.end-piece.start)}));
    if(intervals.length)result.set(piece.node,intervals);
  }
  return result;
}
// English offsets remain authoritative. Only the active spelling needs an alignment.
const caretAlignments=new Map(),editingViews=new Map(),nativeCaretOwners=new Set();
let lastCaret=null,composingEditor=null;
function sourceAlignment(raw){
  let result=caretAlignments.get(raw);if(result){caretAlignments.delete(raw);caretAlignments.set(raw,result);return result;}
  const normalized=wordPlan(raw).text,m=raw.length,n=normalized.length,spans=[];
  if(raw===normalized){for(let i=0;i<n;i++)spans.push({start:i,end:i+1});}
  else if(m*n>16384){for(let i=0;i<n;i++)spans.push({start:Math.floor(i*m/Math.max(1,n)),end:Math.ceil((i+1)*m/Math.max(1,n))});}
  else{
    const cols=n+1,table=new Uint16Array((m+1)*cols);
    for(let i=0;i<=m;i++)table[i*cols]=i;for(let j=0;j<=n;j++)table[j]=j;
    for(let i=1;i<=m;i++)for(let j=1;j<=n;j++)table[i*cols+j]=Math.min(table[(i-1)*cols+j]+1,table[i*cols+j-1]+1,table[(i-1)*cols+j-1]+(raw[i-1]===normalized[j-1]?0:1));
    const operations=[];let i=m,j=n;
    while(i||j){
      if(i&&j&&table[i*cols+j]===table[(i-1)*cols+j-1]+(raw[i-1]===normalized[j-1]?0:1)){operations.push({start:i-1,end:i});i--;j--;}
      else if(i&&table[i*cols+j]===table[(i-1)*cols+j]+1){i--;}
      else{operations.push({insert:true,at:i});j--;}
    }
    operations.reverse();for(const operation of operations){if(operation.insert){const previous=spans.at(-1);spans.push(previous?{...previous}:{start:operation.at,end:operation.at});}else spans.push(operation);}
  }
  result={text:normalized,spans};caretAlignments.set(raw,result);if(caretAlignments.size>1000)caretAlignments.delete(caretAlignments.keys().next().value);return result;
}
function normalizedCaret(raw,offset){
  const alignment=sourceAlignment(raw);let cut=0;
  while(cut<alignment.spans.length&&alignment.spans[cut].end<=offset)cut++;
  if(cut>0&&cut<alignment.text.length&&/[\uDC00-\uDFFF]/.test(alignment.text[cut])&&/[\uD800-\uDBFF]/.test(alignment.text[cut-1]))cut--;
  return {text:alignment.text,cut};
}
function wordRequest(raw,cs,group,cut=null,prepared=null){
  if(cut===null)return {raw,templates:[templateFor(prepared?.text??raw,cs,group,false,!!prepared)]};
  const normalized=prepared||normalizedCaret(raw,cut),left=normalized.text.slice(0,normalized.cut),right=normalized.text.slice(normalized.cut);
  return {raw,cut,normalized,left:left?templateFor(left,cs,group,true):null,right:right?templateFor(right,cs,group,true):null,
    templates:[...(left?[templateFor(left,cs,group,true)]:[]),...(right?[templateFor(right,cs,group,true)]:[])]};
}
function resolveWord(request){
  if(request.cut===undefined)return request.templates[0];
  if(request.templates.some(t=>!t.ready))return {ready:false};
  const key=JSON.stringify(['editing',request.left?.key,request.right?.key,request.normalized.cut]);let t=editingViews.get(key);
  if(t){editingViews.delete(key);editingViews.set(key,t);return t;}
  const leftWidth=request.left?.width||0,shift=leftWidth+CARET_GAP;
  const node=document.createElement('div');node.className='norin-edit-word';
  t={key,ready:true,editing:true,width:leftWidth+(request.right?.width||0)+CARET_GAP,caretX:leftWidth+CARET_GAP/2,node,
    inkTop:request.templates.length?Math.min(...request.templates.map(t=>t.inkTop)):0,inkBottom:request.templates.length?Math.max(...request.templates.map(t=>t.inkBottom)):1,hits:[]};
  node.style.cssText=`position:absolute;width:${t.width}em;height:1em;white-space:nowrap;transform-origin:0 0`;
  for(const [part,x,offset]of [[request.left,0,0],[request.right,shift,request.normalized.cut]])if(part){
    const segment=part.node.cloneNode(true);setStyles(segment,{position:'absolute',left:`${x}em`,top:'0px'});node.append(segment);
    for(const hit of part.hits||[])t.hits.push({...hit,start:hit.start+offset,end:hit.end+offset,left:hit.left+x,right:hit.right+x});
  }
  editingViews.set(key,t);if(editingViews.size>500)editingViews.delete(editingViews.keys().next().value);return t;
}
function editorFor(element){return element?.closest?.('[contenteditable="true"],[contenteditable="plaintext-only"]')||null;}
function readCaret(){
  const element=document.activeElement;if(!element||composingEditor)return null;
  if(controls.has(element))return Number.isInteger(element.selectionStart)&&element.selectionStart===element.selectionEnd?{element,offset:element.selectionStart,control:true}:null;
  const editor=element.isContentEditable?editorFor(element)||element:null,selection=window.getSelection();
  if(!editor||!selection?.isCollapsed||!selection.focusNode||!editor.contains(selection.focusNode))return null;
  let node=selection.focusNode,offset=selection.focusOffset;
  if(node.nodeType!==Node.TEXT_NODE){
    const child=node.childNodes[offset]||node.childNodes[offset-1];if(!child)return null;
    const walker=document.createTreeWalker(child,NodeFilter.SHOW_TEXT,{acceptNode:n=>n.parentElement?.closest('[data-norin-mount]')?NodeFilter.FILTER_REJECT:NodeFilter.FILTER_ACCEPT});
    if(child.nodeType===Node.TEXT_NODE){node=child;offset=selection.focusOffset<selection.focusNode.childNodes.length?0:node.length;}
    else{const all=[];let text;while((text=walker.nextNode()))all.push(text);node=selection.focusOffset<selection.focusNode.childNodes.length?all[0]:all.at(-1);if(!node)return null;offset=selection.focusOffset<selection.focusNode.childNodes.length?0:node.length;}
  }
  if(!node.data.replace(/[\u200b\ufeff]/g,'')){
    const walker=document.createTreeWalker(editor,NodeFilter.SHOW_TEXT,{acceptNode:n=>n.parentElement?.closest('[data-norin-mount]')?NodeFilter.FILTER_REJECT:NodeFilter.FILTER_ACCEPT}),texts=[];let text;
    while((text=walker.nextNode()))texts.push(text);
    const index=texts.indexOf(node),previous=texts.slice(0,index).reverse().find(n=>n.data.replace(/[\u200b\ufeff]/g,'')),next=texts.slice(index+1).find(n=>n.data.replace(/[\u200b\ufeff]/g,''));
    if(previous){node=previous;offset=node.length;}else if(next){node=next;offset=0;}else return null;
  }
  if(excludedSubtree(node.parentElement))return null;
  return {element:editor,node,offset,control:false};
}
function queueCaretUpdate(){
  const next=readCaret(),previous=lastCaret;
  if(previous?.element===next?.element&&previous?.node===next?.node&&previous?.offset===next?.offset)return;
  lastCaret=next;
  for(const caret of [previous,next])if(caret){if(caret.control)dirty(controls.get(caret.element),true);else{const group=textNodes.get(caret.node)?.group;if(group)dirty(group,true);else invalidate(caret.element,true);}}
}
function caretAppearance(element){
  // Our native-caret suppression must not mask the site's original CSS values.
  const owner=element.closest('[data-norin-custom-caret]');
  const previous=owner?.getAttribute('data-norin-custom-caret');
  if(owner)owner.removeAttribute('data-norin-custom-caret');
  try{
    const cs=getComputedStyle(element),color=cs.caretColor;
    return {color:color&&color!=='auto'?color:cs.color,
      shape:cs.getPropertyValue('caret-shape').trim(),
      steady:cs.getPropertyValue('caret-animation').trim()==='manual'};
  }finally{if(owner)owner.setAttribute('data-norin-custom-caret',previous);}
}
function caretBar(existing,appearance,height){
  const bar=existing||document.createElement('span');bar.className='norin-caret';bar.setAttribute('aria-hidden','true');
  const wide=appearance.shape==='block'||appearance.shape==='underscore';
  setStyles(bar,{backgroundColor:appearance.color,width:wide?`${height*.6}px`:'1px',
    height:appearance.shape==='underscore'?'1px':`${height}px`,
    transform:appearance.shape==='underscore'?`translateY(${height-1}px)`:'none',
    animationName:appearance.steady?'none':'norin-caret-blink'});return bar;
}
function restartCaret(bar,signature){if(bar.dataset.position!==signature){bar.dataset.position=signature;for(const animation of bar.getAnimations())animation.currentTime=0;}}
function renderTextCaret(group,placements,caret,origins){
  group.caretState=null;
  if(group.caretElement)setStyles(group.caretElement,{display:'none'});
  if(!caret||caret.control)return;
  const words=placements.filter(p=>p.word.range.startContainer===caret.node&&p.lineReady&&!p.nativePrefix).sort((a,b)=>a.word.range.startOffset-b.word.range.startOffset);
  if(!words.length)return;
  let selected=words.find(p=>caret.offset>=p.word.range.startOffset&&caret.offset<=p.word.range.endOffset),x;
  if(selected){
    const cut=caret.offset-selected.word.range.startOffset;
    x=selected.x+(selected.t.editing?selected.t.caretX*selected.size:cut===0?0:selected.naturalWidth);
  }else{
    const before=words.filter(p=>p.word.range.endOffset<caret.offset).at(-1),after=words.find(p=>p.word.range.startOffset>caret.offset);
    const from=before?.word.range.endOffset??0,to=after?.word.range.startOffset??caret.node.length;
    if(caret.node.data.slice(from,to).trim())return;
    selected=after||before;if(!selected)return;
    const left=before?before.x+before.naturalWidth:after.x-(after.word.range.startOffset-caret.offset)*selected.size*.35;
    const right=after?after.x:left+(caret.offset-from)*selected.size*.35;
    x=before&&after?left+(right-left)*(caret.offset-from)/Math.max(1,to-from):before?right:left;
  }
  const {mount,rect:origin}=origins.get(selected.el),height=Math.max(12,selected.size),top=(selected.rect.top+selected.rect.bottom-height)/2;
  const bar=group.caretElement=caretBar(group.caretElement,caretAppearance(selected.el),height);
  if(bar.parentNode!==mount.root)mount.root.append(bar);
  setStyles(bar,{display:'block',left:`${x-origin.left}px`,top:`${top-origin.top}px`});restartCaret(bar,`${caret.offset}:${x}:${top}`);
  group.caretState={...caret,bar};
}
function syncNativeCarets(next){
  for(const owner of nativeCaretOwners)if(!next.has(owner))owner.removeAttribute('data-norin-custom-caret');
  for(const owner of next)setAttr(owner,'data-norin-custom-caret','');
  nativeCaretOwners.clear();for(const owner of next)nativeCaretOwners.add(owner);
}
function tokenize(record,protectedRanges=[]){
  const node=record.node;
  const codeKey=protectedRanges.map(s=>`${s.start}:${s.end}`).join(',');
  if(record.text===node.data&&record.codeKey===codeKey)return;record.codeKey=codeKey;
  releaseWords(record,true);record.text=node.data;record.words=[];
  for(const match of node.data.matchAll(/\S+/gu)){
    if(!/[a-z0-9\x21-\x2f\x3a-\x40\x5b-\x60\x7b-\x7e]/i.test(match[0])||literalToken(match[0])||protectedRanges.some(s=>match.index<s.end&&match.index+match[0].length>s.start))continue;
    const range=document.createRange();range.setStart(node,match.index);range.setEnd(node,match.index+match[0].length);
    record.words.push({text:match[0],range,box:null,glyph:null,template:null});
  }
}
// A native word may occupy several line boxes (hyphens, soft hyphens,
// overflow-wrap). Cache a separate overlay/range for each contiguous fragment.
function wordFragments(word,rects){
  if(rects.length===1){
    if(word.fragments)for(const fragment of word.fragments.values())parkWord(fragment);
    return [{word,rect:rects[0]}];
  }
  parkWord(word);
  const previous=word.fragments||new Map(),next=new Map(),pieces=[];
  const node=word.range.startContainer,base=word.range.startOffset;
  let run=null;
  for(let offset=0;offset<word.text.length;){
    const end=offset+String.fromCodePoint(word.text.codePointAt(offset)).length;
    const range=document.createRange();range.setStart(node,base+offset);range.setEnd(node,base+end);
    const rect=[...range.getClientRects()].find(r=>r.width&&r.height);
    if(rect){
      if(!run||Math.abs(run.rect.top-rect.top)>1||Math.abs(run.rect.bottom-rect.bottom)>1){
        run={start:offset,end,rect:{left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom,width:rect.width,height:rect.height}};pieces.push(run);
      }else{
        run.end=end;run.rect.left=Math.min(run.rect.left,rect.left);run.rect.right=Math.max(run.rect.right,rect.right);run.rect.width=run.rect.right-run.rect.left;
      }
    }else if(run)run.end=end;
    offset=end;
  }
  const result=[];
  for(const piece of pieces){
    const key=`${piece.start}:${piece.end}`;
    let fragment=previous.get(key);
    if(!fragment){
      const range=document.createRange();range.setStart(node,base+piece.start);range.setEnd(node,base+piece.end);
      fragment={text:word.text.slice(piece.start,piece.end),range,box:null,glyph:null,template:null};
    }
    const start=normalizedCaret(word.text,piece.start).cut,end=normalizedCaret(word.text,piece.end).cut;
    fragment.sourceWord=word;fragment.normalizedStart=start;
    const prepared={text:wordPlan(word.text).text.slice(start,end),start};
    next.set(key,fragment);result.push({word:fragment,rect:piece.rect,prepared,source:word});
  }
  for(const [key,fragment]of previous)if(!next.has(key))parkWord(fragment,true);
  word.fragments=next;
  return result;
}
function deactivate(group){
  group.caretElement?.remove();group.caretState=null;
  if(group.kind==='control'){
    if(group.view)group.view.box.remove();group.element.removeAttribute('data-norin-input');
    for(const mount of [...group.mounts])dropMount(mount);return;
  }
  for(const record of group.nodes)releaseWords(record);
  for(const emoji of group.emojis){emoji.desired=0;restoreEmoji(emoji);}
  for(const mount of [...group.mounts])dropMount(mount);
  if(group.ranges.length){group.ranges=[];highlightsDirty=true;}
}
function processText(group){
  if(!group.element.isConnected||!group.nodes.size&&!group.emojis.size){
    for(const record of [...group.nodes])dropNode(record);for(const emoji of [...group.emojis])dropEmoji(emoji);deactivate(group);
    group.disposed=true;intersection.unobserve(group.element);resize.unobserve(group.element);activeRecords.delete(group);scopes.delete(group.element);dirtyRecords.delete(group);return;
  }
  if(!group.near){deactivate(group);return;}
  const placements=[],ranges=[],owners=new Set(),protectedRanges=protectedCode(group),activeCaret=readCaret();
  for(const record of [...group.nodes]){
    const node=record.node,el=node.parentElement;
    if(!node.isConnected){dropNode(record);continue;}
    if(!el||excludedSubtree(el)||excludedClass(el)||literalLink(el)){releaseWords(record);continue;}
    const cs=styleOf(el);if(cs.display==='none'){releaseWords(record);continue;}
    tokenize(record,protectedRanges.get(node)||[]);const clip=renderClipFor(el);
    for(const word of record.words){
      const rects=[...word.range.getClientRects()].filter(r=>r.width&&r.height);
      if(!rects.some(r=>r.right>clip.left&&r.left<clip.right&&r.bottom>clip.top&&r.top<clip.bottom)){parkWord(word);continue;}
      const pieces=wordFragments(word,rects);
      const whole=rects.length>1?{word,request:wordRequest(word.text,cs,group,activeCaret&&!activeCaret.control&&activeCaret.node===node&&activeCaret.offset>word.range.startOffset&&activeCaret.offset<word.range.endOffset?activeCaret.offset-word.range.startOffset:null),fits:false}:null;
      for(const [index,piece]of pieces.entries()){
        const fragment=piece.word,r=piece.rect;
        if(r.right<=clip.left||r.left>=clip.right||r.bottom<=clip.top||r.top>=clip.bottom){parkWord(fragment);continue;}
        const cut=activeCaret&&!activeCaret.control&&activeCaret.node===node&&activeCaret.offset>fragment.range.startOffset&&activeCaret.offset<fragment.range.endOffset?activeCaret.offset-fragment.range.startOffset:null;
        const prepared=piece.prepared?{text:piece.prepared.text,cut:cut===null?null:normalizedCaret(word.text,activeCaret.offset-word.range.startOffset).cut-piece.prepared.start}:null;
        const request=wordRequest(fragment.text,cs,group,cut,prepared);
        placements.push({word:fragment,whole,wholeCandidate:index===0?whole:null,request,t:request.templates[0],cs,el,rect:r,size:norinFontSize(cs),scope:group.element});owners.add(el);
      }
    }
  }
  finishTemplates(placements.flatMap(p=>[...p.request.templates,...(p.wholeCandidate?.request.templates||[])]));
  for(const placement of placements){placement.t=resolveWord(placement.request);if(placement.wholeCandidate)placement.wholeCandidate.t=resolveWord(placement.wholeCandidate.request);}
  const lines=new Map();
  for(const p of placements){const key=Math.round(p.rect.top/3)*3;if(!lines.has(key))lines.set(key,[]);lines.get(key).push(p);}
  for(const emoji of [...group.emojis]){
    emoji.desired=0;
    const placement=emojiPlacement(emoji);if(!placement)continue;
    let selected=null,distance=Infinity;
    for(const line of lines.values()){
      const top=Math.min(...line.map(p=>p.rect.top)),bottom=Math.max(...line.map(p=>p.rect.bottom));
      const overlap=Math.min(bottom,placement.rect.bottom)-Math.max(top,placement.rect.top),delta=Math.abs((top+bottom-placement.rect.top-placement.rect.bottom)/2);
      if(overlap>0&&delta<distance){selected=line;distance=delta;}
    }
    if(selected)selected.push(placement);
  }
  for(const originalLine of [...lines.values()].sort((a,b)=>a[0].rect.top-b[0].rect.top)){
    const line=originalLine.filter(p=>!p.whole?.fits);
    if(!line.length)continue;
    const ready=line.every(p=>p.kind==='emoji'||p.t.ready&&(!p.wholeCandidate||p.wholeCandidate.t.ready));for(const p of line)p.lineReady=ready;
    if(!ready)continue; // Reveal a complete line only when its text templates are ready.
    line.sort((a,b)=>a.rect.left-b.rect.left);const start=line[0].rect.left;let prev=null;
    for(const p of line){p.gap=prev?Math.max(0,p.rect.left-prev.rect.right):0;p.naturalWidth=p.kind==='emoji'?p.rect.width:p.t.width*p.size;prev=p;}
    // Keep Norin readable at a minimum of 18px, regardless of word or line length.
    let cursor=start;
    let previous=null,translated=false;
    for(const p of line){
      // Keep leading numbers and symbols native, including their exact spacing.
      p.nativePrefix=p.kind!=='emoji'&&!translated&&!/[a-z]/i.test(p.word.text);
      if(p.kind!=='emoji'&&!p.nativePrefix)translated=true;
      const node=p.word?.range.startContainer;
      const barrier=previous&&(p.kind==='emoji'||previous.kind==='emoji'?emojiGapHasText(previous,p):(previous.word.range.startContainer===node?node.data.slice(previous.word.range.endOffset,p.word.range.startOffset).trim():emojiGapHasText(previous,p)));
      if(barrier||p.nativePrefix||previous?.nativePrefix)cursor=p.rect.left;else cursor+=p.gap;
      if(p.wholeCandidate){
        const scope=group.element,box=scope.getBoundingClientRect(),scopeStyle=styleOf(scope);
        const right=Math.min(clipFor(p.el).right,box.right-(parseFloat(scopeStyle.paddingRight)||0)-(parseFloat(scopeStyle.borderRightWidth)||0));
        const wholeWidth=p.wholeCandidate.t.width*p.size;
        if(cursor+wholeWidth<=right+.5){
          p.wholeCandidate.fits=true;p.word=p.wholeCandidate.word;p.t=p.wholeCandidate.t;p.naturalWidth=wholeWidth;
        }
      }
      p.x=cursor;cursor+=p.naturalWidth;
      if(p.kind==='emoji')p.emoji.desired=p.x-p.rect.left;previous=p;
    }
    const glyphs=line.filter(p=>p.kind!=='emoji');
    const inkTop=Math.min(...glyphs.map(p=>p.t.inkTop*p.size)),inkBottom=Math.max(...glyphs.map(p=>p.t.inkBottom*p.size));
    const center=(Math.min(...line.map(p=>p.rect.top))+Math.max(...line.map(p=>p.rect.bottom)))/2;
    for(const p of line)p.visualY=center-(inkTop+inkBottom)/2;
  }
  // Create local anchors after reading source geometry; measure each anchor only once.
  const origins=new Map(),used=new Set();
  for(const el of new Set(placements.filter(p=>p.lineReady&&!p.nativePrefix).map(p=>p.el))){const mount=mountFor(el,group);origins.set(el,{mount,rect:mount.host.getBoundingClientRect()});}
  for(const p of placements){
    const {word,t,rect:r,size}=p;
    if(!p.lineReady||p.nativePrefix){parkWord(word);continue;}
    reclaimWord(word,t.key);
    if(word.template!==t){word.template=t;if(word.box){word.glyph=t.node.cloneNode(true);word.box.replaceChildren(word.glyph);}}
    if(!word.box){word.box=document.createElement('div');word.box.style.cssText='position:absolute;pointer-events:none;overflow:visible';word.glyph=t.node.cloneNode(true);word.box.append(word.glyph);}
    const {mount,rect:origin}=origins.get(p.el);used.add(mount);
    if(word.box.parentNode!==mount.root)mount.root.append(word.box);
    const top=r.top;
    setStyles(word.box,{display:'block',left:`${p.x-origin.left}px`,top:`${top-origin.top}px`,width:`${p.naturalWidth}px`,height:`${r.height}px`});
    setStyles(word.glyph,{position:'absolute',left:'0px',top:`${p.visualY-top}px`,fontSize:`${size}px`,fontFamily:p.cs.fontFamily,fontWeight:p.cs.fontWeight,fontStyle:p.cs.fontStyle,color:p.cs.color});
    ranges.push(word.range);
  }
  for(const mount of [...group.mounts])if(!used.has(mount))dropMount(mount);
  renderTextCaret(group,placements,activeCaret,origins);
  const merged=mergeRanges(ranges);
  if(merged.length!==group.ranges.length||merged.some((r,i)=>{
    const old=group.ranges[i];return !old||old.startContainer!==r.startContainer||old.endContainer!==r.endContainer||old.startOffset!==r.startOffset||old.endOffset!==r.endOffset;
  }))highlightsDirty=true;
  group.ranges=merged;
}
function mergeRanges(ranges){
  const merged=[];
  for(const range of ranges){const prev=merged.at(-1);
    if(prev&&prev.endContainer===range.startContainer&&prev.endOffset<=range.startOffset&&!range.startContainer.data.slice(prev.endOffset,range.startOffset).trim())prev.setEnd(range.endContainer,range.endOffset);
    else merged.push(range.cloneRange());
  }return merged;
}
function controlParts(value){
  const parts=[];let offset=0;
  const normal=text=>{for(const part of text.split(/(\s+)/u))if(part)parts.push({text:part,plain:/^\s+$/.test(part)||literalToken(part)});};
  for(const span of codeSpans(value)){normal(value.slice(offset,span.start));parts.push({text:value.slice(span.start,span.end),plain:true});offset=span.end;}
  normal(value.slice(offset));return parts;
}
function processControl(group){
  const input=group.element;
  if(!input.isConnected){disposeControl(group);return;}
  if(!group.near){deactivate(group);return;}
  const cs=styleOf(input),b=input.getBoundingClientRect(),clip=renderClipFor(input);
  if(!b.width||!b.height||b.bottom<=clip.top||b.top>=clip.bottom){deactivate(group);return;}
  let view=group.view;
  if(!view){view=group.view={box:document.createElement('div'),mirror:document.createElement('div'),signature:null,scrollX:0,scrollY:0,revision:0};view.box.append(view.mirror);}
  if(document.activeElement===input&&!Number.isInteger(input.selectionStart)){
    view.customCaret=false;view.box.remove();input.removeAttribute('data-norin-input');group.value=input.value;return;
  }
  const color=cs.color;group.color=color;const value=input.value||input.placeholder,active=readCaret();
  const caret=active?.control&&active.element===input?active:null,offset=caret?.offset??null;
  const parts=controlParts(value);let sourceOffset=0;
  const requests=[];
  for(const part of parts){
    part.start=sourceOffset;sourceOffset+=part.text.length;part.end=sourceOffset;
    if(!part.plain){const cut=input.value&&offset!==null&&offset>part.start&&offset<part.end?offset-part.start:null;part.request=wordRequest(part.text,{fontFamily:cs.fontFamily,fontWeight:cs.fontWeight,fontStyle:cs.fontStyle,color},group,cut);requests.push(part.request);}
  }
  finishTemplates(requests.flatMap(request=>request.templates));
  const wordTemplates=requests.map(resolveWord),ready=wordTemplates.every(t=>t.ready);
  if(!ready){view.customCaret=false;input.removeAttribute('data-norin-input');view.box.remove();return;}
  const signature=JSON.stringify([value,offset,...wordTemplates.map(t=>t.key)]);
  if(view.signature!==signature){
    const inkTop=wordTemplates.length?Math.min(...wordTemplates.map(t=>t.inkTop)):0,inkBottom=wordTemplates.length?Math.max(...wordTemplates.map(t=>t.inkBottom)):1;
    const visualTop=`${(1-(inkTop+inkBottom))*50}%`,fragment=document.createDocumentFragment();let i=0;
    view.items=[];view.caretAnchor=null;
    function anchor(parent,inline=true,left=0){
      if(view.caretAnchor)return;
      const marker=document.createElement('span');marker.setAttribute('aria-hidden','true');
      marker.style.cssText='display:inline-block;width:0;height:1em;vertical-align:baseline;pointer-events:none';
      if(!inline)setStyles(marker,{position:'absolute',left:`${left}em`,top:'0px'});
      parent.append(marker);view.caretAnchor=marker;
    }
    for(const part of parts){
      if(offset===part.start)anchor(fragment);
      if(part.plain){
        const span=document.createElement('span');span.className='norin-literal';
        if(offset!==null&&offset>part.start&&offset<part.end){span.append(document.createTextNode(part.text.slice(0,offset-part.start)));anchor(span);span.append(document.createTextNode(part.text.slice(offset-part.start)));}
        else span.textContent=part.text;
        fragment.append(span);view.items.push({...part,node:span});
      }else{
        const t=wordTemplates[i++],span=document.createElement('span');span.style.cssText=`display:inline-block;position:relative;width:${t.width}em;height:1em;vertical-align:baseline`;
        const word=t.node.cloneNode(true);setStyles(word,{position:'absolute',left:'0px',top:visualTop,fontSize:'inherit'});span.append(word);
        if(t.editing)anchor(span,false,t.caretX);
        fragment.append(span);view.items.push({...part,t,node:span,glyph:word});
      }
      if(offset===part.end)anchor(fragment);
    }
    if(offset===0&&!view.caretAnchor)anchor(fragment);
    view.mirror.replaceChildren(fragment);view.signature=signature;view.revision++;
  }
  const mount=mountFor(input.parentElement,group),origin=mount.host.getBoundingClientRect();
  if(view.box.parentNode!==mount.root)mount.root.append(view.box);
  setStyles(view.box,{position:'absolute',left:`${b.left+input.clientLeft-origin.left}px`,top:`${b.top+input.clientTop-origin.top}px`,width:`${input.clientWidth}px`,height:`${input.clientHeight}px`,overflow:'hidden'});
  const singleLine=input.tagName==='INPUT';
  view.mirror.classList.toggle('norin-input-mirror',singleLine);
  setStyles(view.mirror,{display:singleLine?'flex':'block',alignItems:singleLine?'center':'normal',height:singleLine?`${input.clientHeight}px`:'auto',justifyContent:singleLine?(cs.textAlign==='center'?'center':/^(right|end)$/.test(cs.textAlign)?'flex-end':'flex-start'):'normal',direction:cs.direction,position:'relative',fontSize:`${norinFontSize(cs)}px`,fontFamily:cs.fontFamily,fontWeight:cs.fontWeight,fontStyle:cs.fontStyle,lineHeight:cs.lineHeight,color,boxSizing:'border-box',width:`${input.clientWidth}px`,padding:cs.padding,whiteSpace:input.tagName==='TEXTAREA'?'pre-wrap':'pre',overflowWrap:cs.overflowWrap,transform:`translate(${-view.scrollX}px,${-view.scrollY}px)`});
  view.customCaret=!!caret&&!!view.caretAnchor;
  if(view.customCaret){
    const marker=view.caretAnchor.getBoundingClientRect(),mirror=view.mirror.getBoundingClientRect(),height=norinFontSize(cs);
    const bar=view.caretElement=caretBar(view.caretElement,caretAppearance(input),height);if(bar.parentNode!==view.mirror)view.mirror.append(bar);
    setStyles(bar,{display:'block',left:`${marker.left-mirror.left}px`,top:`${marker.top-mirror.top+(marker.height-height)/2}px`});restartCaret(bar,`${offset}:${view.revision}`);
    const caretSignature=`${offset}:${view.revision}:${input.clientWidth}:${input.clientHeight}`;
    if(view.caretSignature!==caretSignature){
      const box=view.box.getBoundingClientRect(),edge=8;
      const dx=marker.left<box.left+edge?marker.left-box.left-edge:marker.left>box.right-edge?marker.left-box.right+edge:0;
      const dy=marker.top<box.top?marker.top-box.top:marker.bottom>box.bottom?marker.bottom-box.bottom:0;
      view.scrollX=Math.max(0,Math.min(Math.max(0,view.mirror.scrollWidth-input.clientWidth),view.scrollX+dx));
      view.scrollY=Math.max(0,Math.min(Math.max(0,view.mirror.scrollHeight-input.clientHeight),view.scrollY+dy));
      setStyles(view.mirror,{transform:`translate(${-view.scrollX}px,${-view.scrollY}px)`});view.caretSignature=caretSignature;
    }
  }else if(view.caretElement)setStyles(view.caretElement,{display:'none'});
  group.value=input.value;setAttr(input,'data-norin-input','');
}
function disposeControl(group){
  group.disposed=true;group.near=false;group.element.removeAttribute('data-norin-custom-caret');
  group.view?.box.remove();group.element.removeAttribute('data-norin-input');
  for(const mount of [...group.mounts])dropMount(mount);
  intersection.unobserve(group.element);resize.unobserve(group.element);controls.delete(group.element);activeRecords.delete(group);dirtyRecords.delete(group);
}
function flush(){
  pending=false;if(!enabled||document.hidden)return;
  styleCache=new Map();scopeCache=new Map();clipCache=new Map();codeCache=new WeakMap();
  for(const root of removedRoots)untrack(root);removedRoots.clear();
  const started=performance.now();
  while(dirtyRecords.size){
    const record=dirtyRecords.values().next().value;dirtyRecords.delete(record);
    if(record.kind==='text')processText(record);else processControl(record);
    if(performance.now()-started>=FRAME_BUDGET_MS)break;
  }
  updateSelection();
  if(dirtyRecords.size)schedule();
}
let selectionSignature='';
function updateSelection(force=false){
  const selection=window.getSelection(),selected=[];
  if(selection&&!selection.isCollapsed)for(let i=0;i<selection.rangeCount;i++)selected.push(selection.getRangeAt(i));
  const hidden=new Set();
  for(const mount of mounts.values()){
    const owner=mount.owner;
    const intersects=!!composingEditor&&(composingEditor===owner||composingEditor.contains(owner))||selected.some(r=>[...owner.childNodes].some(n=>n.nodeType===Node.TEXT_NODE&&n.length&&r.intersectsNode(n)));
    // Keep the anchor measurable during selection and English mode. display:none
    // zeroes its rect and makes concurrent redraws save viewport coordinates.
    if(intersects)hidden.add(owner);setStyles(mount.host,{visibility:enabled&&!intersects?'inherit':'hidden'});
  }
  const signature=[...mounts.values()].filter(m=>hidden.has(m.owner)).map(m=>m.selectionId||(m.selectionId=++selectionId)).join(',');
  if(enabled&&(highlightsDirty||force||signature!==selectionSignature)){
    const highlight=new Highlight();for(const group of activeRecords)if(group.kind==='text')for(const range of group.ranges)if(range.startContainer.isConnected&&!hidden.has(range.startContainer.parentElement))highlight.add(range);
    CSS.highlights.set('norin-original',highlight);
  }
  selectionSignature=signature;highlightsDirty=false;
  const visibleEmojis=new Set(movedEmojis);
  for(const group of activeRecords)if(group.kind==='text')for(const emoji of group.emojis)visibleEmojis.add(emoji);
  for(const emoji of visibleEmojis){
    const selectedHere=hidden.has(emoji.element.parentElement)||hidden.has(emoji.group.element)||selected.some(range=>range.intersectsNode(emoji.element));
    if(enabled&&emoji.group.near&&!selectedHere)showEmoji(emoji);else restoreEmoji(emoji);
  }
  const nextNative=new Set(),caret=readCaret();
  for(const group of activeRecords)if(group.kind==='text'&&group.caretState){
    const current=group.caretState,visible=enabled&&caret&&caret.element===current.element&&caret.node===current.node&&caret.offset===current.offset&&!selected.length;
    setStyles(current.bar,{visibility:visible?'visible':'hidden'});if(visible)nextNative.add(current.element);
  }
  for(const group of controls.values())if(group.view){
    const input=group.element,sel=document.activeElement===input&&input.selectionStart!==null&&input.selectionStart!==input.selectionEnd;
    const composing=composingEditor===input;setStyles(group.view.box,{visibility:sel||composing?'hidden':'inherit'});
    if(enabled&&group.near&&group.view.box.isConnected&&!sel&&!composing)setAttr(input,'data-norin-input','');else input.removeAttribute('data-norin-input');
    if(enabled&&caret?.control&&caret.element===input&&group.view.customCaret&&group.view.box.isConnected&&!sel&&!composing)nextNative.add(input);
  }
  syncNativeCarets(nextNative);
}
let selectionId=0;
function selectionChanged(){if(selectionPending)return;selectionPending=true;requestAnimationFrame(()=>{selectionPending=false;queueCaretUpdate();updateSelection();});}
function invalidate(root,urgent=false){
  if(!root)return;
  for(const group of activeRecords)if(group.element===root||root.contains(group.element)||group.element.contains(root))dirty(group,urgent);
}
function onInput(event){queueCaretUpdate();const record=controls.get(event.target);if(record)dirty(record,true);else invalidate(event.target,true);}
function onScroll(event){
  const record=controls.get(event.target);
  if(record?.view){
    const input=event.target,view=record.view;
    view.scrollX=input.scrollLeft/Math.max(1,input.scrollWidth-input.clientWidth)*Math.max(0,view.mirror.scrollWidth-input.clientWidth);
    view.scrollY=input.scrollTop/Math.max(1,input.scrollHeight-input.clientHeight)*Math.max(0,view.mirror.scrollHeight-input.clientHeight);
    setStyles(view.mirror,{transform:`translate(${-view.scrollX}px,${-view.scrollY}px)`});return;
  }
  const root=event.target===document?document.body:event.target;
  invalidate(root);
  scrollRoots.add(root);clearTimeout(scrollTimer);
  scrollTimer=setTimeout(()=>{for(const root of scrollRoots)invalidate(root);scrollRoots.clear();recoverViewport();},100);
}
// Settled-scroll recovery checks indexed blocks and samples visible cards.
let recoveryGeneration=0;
function recoverViewport(){
  if(!enabled||document.hidden)return;
  styleCache=new Map();scopeCache=new Map();clipCache=new Map();
  const generation=++recoveryGeneration,roots=new Set(),width=innerWidth,height=innerHeight;
  samples:for(let y=24;y<height;y+=Math.max(72,height/8))for(const fraction of [.15,.4,.65,.85]){
    for(const hit of document.elementsFromPoint(width*fraction,y)){
      if(hit===document.body||hit===document.documentElement||excludedSubtree(hit))continue;
      let root=hit.closest('article,li,[role="listitem"],[data-testid="cellInnerDiv"],[data-testid="tweetText"]')||hit;
      const box=root.getBoundingClientRect();
      if(box.height>height*2||root.childElementCount>80)root=hit;
      const cs=styleOf(root);
      if(root.childElementCount>80||/auto|scroll/.test(cs.overflowX+cs.overflowY)&&(root.scrollHeight>root.clientHeight+1||root.scrollWidth>root.clientWidth+1))continue;
      if(root!==document.body&&root!==document.documentElement&&root.getBoundingClientRect().height<=height*2)roots.add(root);
      if(roots.size>=24)break samples;
    }
    if(roots.size>=24)break;
  }
  // Reconcile the complete block index, including text between sample points
  // and blocks whose intersection did not change while their words scrolled in.
  // This measures block boxes only, never walks the document's text again.
  const indexed=[...scopes.values(),...controls.values()];
  let index=0;
  function reconcile(){
    if(generation!==recoveryGeneration||!enabled||document.hidden)return;
    const started=performance.now();
    while(index<indexed.length){
      const group=indexed[index++];
      if(group.disposed)continue;
      if(!group.element.isConnected){dirty(group);continue;}
      const box=group.element.getBoundingClientRect(),clip=renderClipFor(group.element);
      // Do not undo observer prefetch when browser scroll margins extend farther.
      const near=box.width>0&&box.height>0&&(group.intersecting||box.bottom>clip.top&&box.top<clip.bottom&&box.right>clip.left&&box.left<clip.right);
      if(near){group.near=true;activeRecords.add(group);resize.observe(group.element);dirty(group);}
      else if(group.near){group.near=false;activeRecords.delete(group);resize.unobserve(group.element);dirty(group);}
      if(performance.now()-started>=5)break;
    }
    if(index<indexed.length)requestAnimationFrame(reconcile);
  }
  reconcile();
  const pendingRoots=[...roots].filter(root=>![...roots].some(other=>other!==root&&other.contains(root)));
  function next(){
    if(generation!==recoveryGeneration||!enabled||document.hidden)return;
    const started=performance.now();
    while(pendingRoots.length){track(pendingRoots.shift(),false,true);if(performance.now()-started>=5)break;}
    if(pendingRoots.length)requestAnimationFrame(next);
  }
  next();
}
function distanceToRect(x,y,rect){const dx=Math.max(rect.left-x,0,x-rect.right),dy=Math.max(rect.top-y,0,y-rect.bottom);return dx*dx+dy*dy*4;}
function glyphPointOffset(raw,t,glyph,x,y){
  const rect=glyph.getBoundingClientRect(),unit=rect.width/Math.max(.001,t.width),alignment=sourceAlignment(raw);
  const localX=(x-rect.left)/unit,localY=(y-rect.top)/unit;
  let best=null,score=Infinity;
  for(const hit of t.hits||[]){const distance=distanceToRect(localX,localY,hit);if(distance<score){score=distance;best=hit;}}
  if(!best)return Math.max(0,Math.min(raw.length,Math.round((x-rect.left)/Math.max(1,rect.width)*raw.length)));
  const after=localX>(best.left+best.right)/2;
  return after?(alignment.spans[Math.max(0,best.end-1)]?.end??raw.length):(alignment.spans[best.start]?.start??0);
}
function plainPointOffset(item,x,y){
  const walker=document.createTreeWalker(item.node,NodeFilter.SHOW_TEXT);let node,best=item.start,score=Infinity,offset=0;
  while((node=walker.nextNode())){
    const step=Math.max(1,Math.ceil(node.length/512));let closest=0;
    const test=index=>{const range=document.createRange();range.setStart(node,index);range.collapse(true);const rect=range.getBoundingClientRect();if(!rect.height)return;const distance=distanceToRect(x,y,rect);if(distance<score){score=distance;best=item.start+offset+index;closest=index;}};
    for(let i=0;i<=node.length;i+=step)test(i);test(node.length);
    if(step>1)for(let i=Math.max(0,closest-step);i<=Math.min(node.length,closest+step);i++)test(i);
    offset+=node.length;
  }
  return best;
}
function editingPoint(owner,x,y){
  const control=controls.get(owner);
  if(control){
    const input=control.element,view=control.view;if(!input.hasAttribute('data-norin-input')||!view?.box.isConnected||!Number.isInteger(input.selectionStart))return null;
    for(const item of view.items||[])if(item.plain&&[...item.node.getClientRects()].some(rect=>x>=rect.left&&x<=rect.right&&y>=rect.top&&y<=rect.bottom))return {control:true,element:input,value:input.value,offset:Math.min(input.value.length,plainPointOffset(item,x,y))};
    let best=null,distance=Infinity;
    for(const item of view.items||[])if(item.t){const score=distanceToRect(x,y,item.node.getBoundingClientRect());if(score<distance){distance=score;best=item;}}
    return best?{control:true,element:input,value:input.value,offset:Math.min(input.value.length,best.start+glyphPointOffset(best.text,best.t,best.glyph,x,y))}:null;
  }
  // Code and literal URLs keep their native English hit testing.
  const native=document.caretRangeFromPoint?.(x,y);
  if(native?.startContainer.nodeType===Node.TEXT_NODE){
    const node=native.startContainer,offset=native.startOffset,group=textNodes.get(node)?.group;
    if(excludedSubtree(node.parentElement)||excludedClass(node.parentElement)||literalLink(node.parentElement))return null;
    if(group&&(protectedCode(group).get(node)||[]).some(span=>offset>=span.start&&offset<=span.end))return null;
    for(const match of node.data.matchAll(/\S+/gu))if(offset>=match.index&&offset<=match.index+match[0].length&&literalToken(match[0]))return null;
  }
  let best=null,distance=Infinity;
  for(const group of activeRecords)if(group.kind==='text')for(const record of group.nodes)if(owner.contains(record.node))for(const source of record.words)for(const word of source.box?.isConnected?[source]:source.fragments?.values()||[])if(word.box?.isConnected){
    const score=distanceToRect(x,y,word.box.getBoundingClientRect());if(score<distance){distance=score;best=word;}
  }
  if(!best)return null;
  const source=best.sourceWord||best;
  const template=best.sourceWord?{...best.template,hits:(best.template.hits||[]).map(hit=>({...hit,start:hit.start+best.normalizedStart,end:hit.end+best.normalizedStart}))}:best.template;
  const offset=source.range.startOffset+glyphPointOffset(source.text,template,best.glyph,x,y);
  return {control:false,element:owner,node:best.range.startContainer,value:best.range.startContainer.data,offset:Math.max(best.range.startOffset,Math.min(best.range.endOffset,offset))};
}
let editingPointer=null;
function editingPointerDown(event){
  editingPointer=null;if(!enabled||composingEditor||event.button!==0||!event.isPrimary||event.shiftKey||event.ctrlKey||event.metaKey||event.altKey)return;
  const element=event.target instanceof Element?event.target:null;if(!element||excludedSubtree(element)||element.tagName==='IMG'||element.closest('[contenteditable="false"],button,a,[role="img"]')||literalLink(element))return;
  const owner=controls.has(element)?element:editorFor(element);if(!owner)return;
  if(!controls.has(element)&&!window.getSelection()?.isCollapsed)return;
  const point=editingPoint(owner,event.clientX,event.clientY);
  if(point)editingPointer={...point,id:event.pointerId,x:event.clientX,y:event.clientY,time:performance.now()};
}
function editingPointerUp(event){
  const pointer=editingPointer;editingPointer=null;
  if(!pointer||pointer.id!==event.pointerId||Math.hypot(event.clientX-pointer.x,event.clientY-pointer.y)>4||performance.now()-pointer.time>500)return;
  setTimeout(()=>{
    if(!enabled||composingEditor||!pointer.element.isConnected)return;
    if(pointer.control){
      const input=pointer.element;if(document.activeElement!==input||input.selectionStart!==input.selectionEnd||input.value!==pointer.value)return;
      input.setSelectionRange(pointer.offset,pointer.offset);
    }else{
      const selection=window.getSelection();if(!selection?.isCollapsed||!pointer.element.contains(selection.focusNode)||!pointer.node.isConnected||pointer.node.data!==pointer.value)return;
      selection.setPosition(pointer.node,pointer.offset);
    }
    queueCaretUpdate();
  },0);
}
function createFloatingToggle(){
  // Keep a single control in the top window, outside page-owned React/Slate DOM.
  if(window.top!==window.self)return;
  const storageKey='norin-toggle-position-v1';
  const host=document.createElement('div');host.id='norin-floating-toggle';
  host.setAttribute('data-norin-ignore','');
  host.style.cssText='all:initial;position:fixed;left:0;top:0;width:max-content;height:max-content;z-index:2147483647;pointer-events:auto';
  const root=host.attachShadow({mode:'open'}),css=document.createElement('style');
  css.textContent=`
    :host{all:initial}
    button{all:initial;box-sizing:border-box;display:block;width:min(76px,100vw);height:min(28px,100vh);padding:0 9px;
      border:1px solid #7779;border-radius:14px;background:#25272deb;color:#fafafa;font:500 12px/1 system-ui,sans-serif;
      text-align:center;cursor:grab;user-select:none;-webkit-user-select:none;touch-action:none;box-shadow:0 2px 7px #0004}
    button[aria-pressed="true"]{border-color:#a89cf0;background:#37314aeb}
    button:focus-visible{outline:2px solid #c4b5fd;outline-offset:2px}
    button[data-dragging]{cursor:grabbing}
  `;
  const button=document.createElement('button');button.type='button';
  root.append(css,button);document.documentElement.append(host);
  let x=innerWidth-88,y=12,gesture=null,suppressClick=false;
  try{const saved=JSON.parse(localStorage.getItem(storageKey));if(saved&&Number.isFinite(saved.x)&&Number.isFinite(saved.y)){x=saved.x;y=saved.y;}}catch(_){/* Storage may be unavailable on a site. */}
  function position(nextX=x,nextY=y){
    const rect=button.getBoundingClientRect(),maxX=Math.max(0,innerWidth-rect.width),maxY=Math.max(0,innerHeight-rect.height);
    x=Math.min(maxX,Math.max(0,nextX));y=Math.min(maxY,Math.max(0,nextY));
    setStyles(host,{left:`${x}px`,top:`${y}px`});
  }
  function save(){try{localStorage.setItem(storageKey,JSON.stringify({x,y}));}catch(_){}}
  function sync(){
    button.textContent=enabled?'Norin':'English';
    button.setAttribute('aria-pressed',String(enabled));
    button.setAttribute('aria-label',`Showing ${enabled?'Norin':'English'}. Switch to ${enabled?'English':'Norin'}.`);
    button.title=`Showing ${enabled?'Norin':'English'}. Click to switch; drag to move.`;
  }
  button.addEventListener('pointerdown',event=>{
    if(!event.isPrimary||event.button!==0)return;
    event.stopPropagation();suppressClick=false;
    gesture={id:event.pointerId,startX:event.clientX,startY:event.clientY,x,y,moved:false};
    button.setPointerCapture(event.pointerId);
    window.addEventListener('pointermove',move,{capture:true,passive:false});
    window.addEventListener('pointerup',finish,true);
    window.addEventListener('pointercancel',cancel,true);
  });
  function move(event){
    if(!gesture||gesture.id!==event.pointerId)return;
    const dx=event.clientX-gesture.startX,dy=event.clientY-gesture.startY;
    if(!gesture.moved&&Math.hypot(dx,dy)<4)return;
    event.preventDefault();event.stopPropagation();gesture.moved=true;suppressClick=true;
    button.setAttribute('data-dragging','');position(gesture.x+dx,gesture.y+dy);
  }
  function finish(event){
    if(!gesture||gesture.id!==event.pointerId)return;
    event.stopPropagation();gesture=null;button.removeAttribute('data-dragging');
    window.removeEventListener('pointermove',move,true);window.removeEventListener('pointerup',finish,true);window.removeEventListener('pointercancel',cancel,true);
    if(button.hasPointerCapture(event.pointerId))button.releasePointerCapture(event.pointerId);
    save();
  }
  function cancel(event){suppressClick=true;finish(event);}
  button.addEventListener('lostpointercapture',event=>{if(gesture){suppressClick=true;finish(event);}});
  button.addEventListener('click',event=>{
    event.stopPropagation();
    if(suppressClick&&event.detail!==0){suppressClick=false;return;}
    toggle();
  });
  root.addEventListener('keydown',event=>event.stopPropagation());
  root.addEventListener('keyup',event=>event.stopPropagation());
  window.addEventListener('resize',()=>{position();save();});
  position();sync();floatingControl={host,button,sync};
}
function toggle(){
  enabled=!enabled;if(!enabled){CSS.highlights.delete('norin-original');for(const group of controls.values()){group.element.removeAttribute('data-norin-input');}}
  else for(const group of activeRecords)dirty(group);
  updateSelection(true);floatingControl?.sync();
}
async function start(){
  if(!CSS.highlights||typeof Highlight==='undefined')throw new Error('Norin requires CSS Custom Highlight support.');
  phoneticMap={...fontCodes,replacements:bundledMappings.replacements};replacementRules=buildReplacementRules(phoneticMap);
  phoneticKeys=Object.keys(phoneticMap).filter(k=>k!=='replacements').sort((a,b)=>b.length-a.length);
  const font=new FontFace('NorinEverywhere',await getRemote(FONT_URL),{unicodeRange:'U+E000-E061'});
  await font.load();document.fonts.add(font);
  document.documentElement.append(pageStyle,layer);
  track(document.body);lastCaret=readCaret();
  const observer=new MutationObserver(records=>{
    styleCache=new Map();scopeCache=new Map();
    for(const r of records){
      if(r.target===layer||layer.contains(r.target)||r.target.closest?.('[data-norin-mount]'))continue;
      if(r.type==='childList'&&[...r.addedNodes,...r.removedNodes].every(n=>n.nodeType===1&&n.hasAttribute('data-norin-mount'))){
        for(const node of r.removedNodes){const mount=mounts.get(node);if(mount)dirty(mount.group);}
        continue;
      }
      if(r.type==='attributes'&&r.attributeName==='style'&&ownStyles.get(r.target)===r.target.getAttribute('style'))continue;
      if(r.type==='characterData'){addNode(r.target,true);const editor=r.target.parentElement?.closest('[contenteditable="true"],[role="textbox"]');if(editor)invalidate(editor);}
      if(r.type==='attributes')addEmoji(r.target);
      if(r.type==='attributes'&&['type','name','id','autocomplete','class'].includes(r.attributeName)&&r.target.matches('input,textarea'))addControl(r.target);
      if(r.type==='childList'){
        for(const n of r.removedNodes)removedRoots.add(n);
        for(const n of r.addedNodes)track(n,true);
      }
      const control=controls.get(r.target);
      if(control)dirty(control);
      invalidate(r.target.nodeType===Node.TEXT_NODE?r.target.parentElement:r.target);
      if(removedRoots.size)schedule();
    }
  });
  observer.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['class','style','hidden','placeholder','value','href','role','type','name','id','autocomplete','data-slate-type','src','alt','aria-label']});
  new MutationObserver(()=>{for(const group of activeRecords)dirty(group);}).observe(document.documentElement,{attributes:true,attributeFilter:['class','style','data-theme','data-color-mode']});
  for(const event of ['input','change','focusin','focusout'])document.addEventListener(event,onInput,true);
  document.addEventListener('scroll',onScroll,{capture:true,passive:true});
  document.addEventListener('selectionchange',selectionChanged);
  document.addEventListener('pointerdown',editingPointerDown,true);
  document.addEventListener('pointerup',editingPointerUp,true);
  document.addEventListener('pointercancel',()=>{editingPointer=null;},true);
  document.addEventListener('compositionstart',event=>{composingEditor=controls.has(event.target)?event.target:editorFor(event.target);queueCaretUpdate();updateSelection(true);},true);
  document.addEventListener('compositionend',()=>{const previous=composingEditor;composingEditor=null;if(controls.has(previous))dirty(controls.get(previous),true);else if(previous)invalidate(previous,true);queueCaretUpdate();},true);
  document.addEventListener('select',selectionChanged,true);
  document.addEventListener('focusout',selectionChanged,true);
  window.addEventListener('resize',()=>{for(const group of activeRecords)dirty(group);});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){for(const group of activeRecords)dirty(group);schedule();}});
  // Poll values only for visible controls, never query/measure the full document.
  setInterval(()=>{
    if(!enabled||document.hidden)return;
    for(const group of activeRecords)if(group.kind==='control'&&group.value!==group.element.value)dirty(group,true);
  },CONTROL_POLL_MS);
  const fontChanged=()=>{fontEpoch++;for(const group of activeRecords)dirty(group);};
  document.fonts?.ready.then(fontChanged);document.fonts?.addEventListener('loadingdone',fontChanged);
  setTimeout(recoverViewport,150);
  createFloatingToggle();
  GM_registerMenuCommand('Toggle Norin / English',toggle);
}
function untrack(root){
  function remove(node){
    if(node.nodeType===Node.TEXT_NODE){const record=textNodes.get(node);if(record&&!node.isConnected)dropNode(record);}
    else if(node instanceof Element){if(controls.has(node))disposeControl(controls.get(node));if(emojiRecords.has(node))dropEmoji(emojiRecords.get(node));}
  }
  if(root.isConnected)return;
  if(root.nodeType===Node.TEXT_NODE){remove(root);return;}
  if(!(root instanceof Element)||root.matches('[data-norin-mount]'))return;
  remove(root);const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT|NodeFilter.SHOW_ELEMENT);let node;while((node=walker.nextNode()))remove(node);
}
start().catch(error=>console.error('[Norin] English left unchanged:',error));

function getRemote(url) {
  return new Promise((resolve,reject) => GM_xmlhttpRequest({url,method:'GET',responseType:'arraybuffer',timeout:FONT_DOWNLOAD_TIMEOUT_MS,
    onload:r => r.status === 200 ? resolve(r.response) : reject(new Error(`HTTP ${r.status}: ${url}`)),
    onerror:() => reject(new Error(`Could not load ${url}`)), ontimeout:() => reject(new Error(`Timed out: ${url}`))}));
}

})();
