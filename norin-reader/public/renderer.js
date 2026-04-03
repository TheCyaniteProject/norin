const openBtn = document.getElementById('openBtn');
const clearBtn = document.getElementById('clearBtn');
const status = document.getElementById('status');
const content = document.getElementById('content');
const contentLatin = document.getElementById('contentLatin');
const contentNorin = document.getElementById('contentNorin');
const toggleGlyphs = document.getElementById('toggleGlyphs');
const sizeRange = document.getElementById('sizeRange');
const sizeVal = document.getElementById('sizeVal');
// const toggleLines = document.getElementById('toggleLines'); (removed - Lines toggle moved/removed)
const exportPdfBtn = document.getElementById('exportPdfBtn');
const toggleDark = document.getElementById('toggleDark');
const tabReader = document.getElementById('tabReader');
const tabNotepad = document.getElementById('tabNotepad');
const tabChat = document.getElementById('tabChat');
const readerTab = document.getElementById('readerTab');
const notepadTab = document.getElementById('notepadTab');
const chatTab = document.getElementById('chatTab');
const notepadInput = document.getElementById('notepadInput');
const notepadOutput = document.getElementById('notepadOutput');
const notepadScale = document.getElementById('notepadScale');
const notepadScaleVal = document.getElementById('notepadScaleVal');

// Chat elements
const chatTranscript = document.getElementById('chatTranscript');
const chatInput = document.getElementById('chatInput');
const chatSend = document.getElementById('chatSend');
const chatStatus = document.getElementById('chatStatus');

// Chat state
let chatSending = false;
let chatAbortController = null;
let chatTranscriptData = []; // { id, role: 'user'|'assistant', latin }
let chatMsgSeq = 0;

// Loading overlay elements
const loadingOverlay = document.getElementById('loadingOverlay');
const loadingLabel = loadingOverlay ? loadingOverlay.querySelector('.loading-label') : null;
const loadingDots = loadingOverlay ? loadingOverlay.querySelector('.loading-dots') : null;
let loadingTimer = null;
let loadingDepth = 0; // simple refcount so nested shows don't prematurely hide

function showLoadingOverlay(label) {
  if (!loadingOverlay) return;
  if (label && loadingLabel) loadingLabel.textContent = label;
  loadingDepth++;
  if (loadingDepth > 1) return; // already visible
  loadingOverlay.setAttribute('aria-hidden', 'false');
  document.body.setAttribute('aria-busy', 'true');
  let i = 0;
  const frames = ['','.', '..', '...'];
  const tick = () => {
    if (loadingDots) loadingDots.textContent = frames[i];
    i = (i + 1) % frames.length;
  };
  tick();
  loadingTimer = setInterval(tick, 400);
}

function hideLoadingOverlay() {
  if (!loadingOverlay) return;
  loadingDepth = Math.max(0, loadingDepth - 1);
  if (loadingDepth > 0) return;
  if (loadingTimer) {
    clearInterval(loadingTimer);
    loadingTimer = null;
  }
  loadingOverlay.setAttribute('aria-hidden', 'true');
  document.body.removeAttribute('aria-busy');
  if (loadingDots) loadingDots.textContent = '   ';
}

let phoneticMap = null;
let phoneticKeys = [];
// cache mapping from original raw text -> rendered glyph HTML
const glyphCache = new Map();

// reader state: keep current loaded text and whether Norin pane is already prepared
let readerRawText = '';
let readerNorinPreparedFor = null;

// single global stroke width (SVG units) used for all glyph outlines
const GLYPH_STROKE_WIDTH = 22;

// shared hover tooltip for Norin words
let hoverTooltip = null;

function ensureHoverTooltip() {
  if (hoverTooltip) return hoverTooltip;

  const tip = document.createElement('div');
  tip.id = 'norinHoverTooltip';

  Object.assign(tip.style, {
    position: 'fixed',
    zIndex: '99999',
    pointerEvents: 'none',
    display: 'none',
    padding: '6px 8px',
    borderRadius: '6px',
    fontSize: '12px',
    lineHeight: '1.2',
    whiteSpace: 'nowrap',
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
    border: '1px solid rgba(0,0,0,0.15)',
    background: 'rgba(255,255,255,0.96)',
    color: '#111'
  });

  document.body.appendChild(tip);
  hoverTooltip = tip;
  return tip;
}

function moveHoverTooltip(x, y) {
  const tip = ensureHoverTooltip();
  const offset = 14;

  let left = x + offset;
  let top = y + offset;

  const rect = tip.getBoundingClientRect();

  if (left + rect.width + 8 > window.innerWidth) {
    left = Math.max(8, x - rect.width - offset);
  }

  if (top + rect.height + 8 > window.innerHeight) {
    top = Math.max(8, y - rect.height - offset);
  }

  tip.style.left = `${left}px`;
  tip.style.top = `${top}px`;
}

function showHoverTooltip(text, x, y) {
  if (!text) {
    hideHoverTooltip();
    return;
  }

  const tip = ensureHoverTooltip();
  const dark = document.body.classList.contains('dark');

  tip.style.background = dark ? 'rgba(24,24,27,0.96)' : 'rgba(255,255,255,0.96)';
  tip.style.borderColor = dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.15)';
  tip.style.color = dark ? '#f5f5f5' : '#111';

  tip.textContent = text;
  tip.style.display = 'block';
  moveHoverTooltip(x, y);
}

function hideHoverTooltip() {
  if (hoverTooltip) {
    hoverTooltip.style.display = 'none';
  }
}

function attachNorinHoverTooltips(container) {
  if (!container) return;

  container.addEventListener('mousemove', (e) => {
    const wordEl = e.target instanceof Element
      ? e.target.closest('.norin-word[data-latin]')
      : null;

    if (!wordEl || !container.contains(wordEl)) {
      hideHoverTooltip();
      return;
    }

    showHoverTooltip(wordEl.dataset.latin || '', e.clientX, e.clientY);
  });

  container.addEventListener('mouseleave', hideHoverTooltip);
  container.addEventListener('mousedown', hideHoverTooltip);
}

window.addEventListener('scroll', hideHoverTooltip, true);

function cacheGlyphsFor(rawText) {
  if (!rawText) return '';
  if (glyphCache.has(rawText)) return glyphCache.get(rawText);
  const tmp = document.createElement('div');
  // renderInto will normalize and build glyph DOM into tmp
  // render in reader mode so capitalization rules and block-skipping apply
  renderInto(tmp, rawText, { readerMode: true });
  const html = tmp.innerHTML;
  glyphCache.set(rawText, html);
  return html;
}

// default unicode replacements (kept as ordered sequence -> compiled to regex rules)
const defaultReplacements = [
  ['\u2019', "'"],
  ['\u2018', "'"],
  ['\u201C', '"'],
  ['\u201D', '"'],
  ['\u2013', '-'],
  ['\u2014', '-'],
  ['\u2026', '...'],
  ['\u00A0', ' ']
];

// apply outline style to an SVG element: make it lineart (no fill) and stroked
function applyOutlineToSVG(svg) {
  if (!svg || !svg.querySelector) return;
  try {
    const cssStroke = String(GLYPH_STROKE_WIDTH);

    svg.removeAttribute('fill');
    svg.removeAttribute('style');
    svg.style.setProperty('fill', 'none', 'important');
    svg.style.setProperty('stroke', 'currentColor', 'important');
    svg.style.setProperty('stroke-width', cssStroke, 'important');
    svg.style.setProperty('stroke-linejoin', 'round', 'important');
    svg.style.setProperty('stroke-linecap', 'round', 'important');
    svg.style.removeProperty('vector-effect');

    const elems = svg.querySelectorAll('path, circle, rect, ellipse, polygon, polyline, g');
    for (const el of elems) {
      try {
        el.removeAttribute('fill');
        el.removeAttribute('stroke');
        el.removeAttribute('style');
        el.style.setProperty('fill', 'none', 'important');
        el.style.setProperty('stroke', 'currentColor', 'important');
        el.style.setProperty('stroke-width', cssStroke, 'important');
        el.style.setProperty('stroke-linejoin', 'round', 'important');
        el.style.setProperty('stroke-linecap', 'round', 'important');
        el.style.removeProperty('vector-effect');
      } catch (e) {}
    }
  } catch (e) {
    console.warn('applyOutlineToSVG failed', e);
  }
}

// parse a CSS transform matrix string like 'matrix(a,b,c,d,tx,ty)' and return scale (approx)
function computeScaleFromTransform(transformStr) {
  try {
    if (!transformStr || transformStr === 'none') return 1;
    const m = transformStr.match(/matrix\(([^)]+)\)/);
    if (!m) return 1;
    const parts = m[1].split(',').map(s => parseFloat(s.trim()));
    if (parts.length >= 6) {
      const a = parts[0], b = parts[1];
      const scaleX = Math.hypot(a, b);
      return scaleX || 1;
    }
  } catch (e) {}
  return 1;
}

function setStrokeWidthOnSVG(svg, px) {
  if (!svg) return;
  try {
    const val = String(px);
    svg.style.setProperty('stroke-width', val, 'important');
    const elems = svg.querySelectorAll('path, circle, rect, ellipse, polygon, polyline');
    for (const el of elems) {
      try {
        el.style.setProperty('stroke-width', val, 'important');
      } catch (e) {}
    }
  } catch (e) {}
}

// adjust stroke width of svg children inside a sinogram block so visual stroke matches full glyphs
function adjustStrokeForBlock(block) {
  try {
    const base = Number(GLYPH_STROKE_WIDTH) || 2;
    const wrappers = block.querySelectorAll('.glyph-wrapper');
    for (const w of wrappers) {
      const cs = window.getComputedStyle(w);
      const scale = computeScaleFromTransform(cs.transform);
      const svgs = w.querySelectorAll('svg');
      for (const s of svgs) {
        s.style.removeProperty('vector-effect');
        setStrokeWidthOnSVG(s, base / scale);
      }
    }
  } catch (e) {
    console.warn('adjustStrokeForBlock failed', e);
  }
}

// apply global stroke width to all SVGs under a container and fix sinogram blocks
function applyGlobalStrokeToContainer(root) {
  if (!root) return;
  try {
    const svgs = root.querySelectorAll('svg');
    for (const s of svgs) {
      try {
        s.style.removeProperty('vector-effect');
        setStrokeWidthOnSVG(s, GLYPH_STROKE_WIDTH);
      } catch (e) {}
    }
    const blocks = root.querySelectorAll('.sinogram');
    for (const b of blocks) {
      try {
        adjustStrokeForBlock(b);
      } catch (e) {}
    }
  } catch (e) {
    console.warn('applyGlobalStrokeToContainer failed', e);
  }
}

// compiled ordered replacement rules (each { re: RegExp, repl: string })
let replacementRules = [];

function buildReplacementRules(map) {
  const rules = [];

  for (const [from, to] of defaultReplacements) {
    try {
      rules.push({ re: new RegExp(escapeRegex(from), 'gu'), repl: to });
    } catch (e) {
      rules.push({ re: null, repl: { from, to } });
    }
  }

  if (map && map.replacements && typeof map.replacements === 'object') {
    for (const [key, val] of Object.entries(map.replacements)) {
      if (typeof val === 'string') {
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

async function loadMappings() {
  if (phoneticMap) return phoneticMap;
  try {
    const resp = await fetch('mappings.json');
    const map = await resp.json();

    // derive glyph base URL from meta if present; expected to point to the directory that directly contains .svg files
    const meta = document.querySelector('meta[name="glyph-base"]');
    const GLYPH_BASE_URL = (meta && (meta.getAttribute('content') || '').trim()) || '';

    const resolveGlyphUrl = (u) => {
      if (!GLYPH_BASE_URL || typeof u !== 'string') return u;
      const base = GLYPH_BASE_URL.replace(/\/$/, '');
      // Strip leading ../norin-font/ and optional glyphs/ so base can be set to .../norin-font/glyphs
      const stripped = u.replace(/^\.\.\/norin-font\/(?:glyphs\/)?/, '');
      return `${base}/${stripped}`;
    };

    for (const [k, v] of Object.entries(map)) {
      let val = v;
      if (typeof val === 'string' && val.toLowerCase().endsWith('.svg')) {
        if (GLYPH_BASE_URL && val.startsWith('../norin-font/')) {
          val = resolveGlyphUrl(val);
          map[k] = val;
        }
        try {
          const r = await fetch(val);
          if (r.ok) map[k] = { svg: await r.text() };
        } catch (e) {
          console.warn('Failed to fetch svg for', k, val, e);
        }
      } else if (
        typeof val === 'object' &&
        val !== null &&
        val.svg &&
        typeof val.svg === 'string' &&
        val.svg.toLowerCase().endsWith('.svg')
      ) {
        if (GLYPH_BASE_URL && val.svg.startsWith('../norin-font/')) {
          val.svg = resolveGlyphUrl(val.svg);
        }
        try {
          const r = await fetch(val.svg);
          if (r.ok) val.svg = await r.text();
        } catch (e) {
          console.warn('Failed to fetch svg for', k, val.svg, e);
        }
      }

      if (
        typeof val === 'object' &&
        val !== null &&
        val.mark &&
        typeof val.mark === 'string' &&
        val.mark.toLowerCase().endsWith('.svg')
      ) {
        if (GLYPH_BASE_URL && val.mark.startsWith('../norin-font/')) {
          val.mark = resolveGlyphUrl(val.mark);
        }
        try {
          const r2 = await fetch(val.mark);
          if (r2.ok) val.mark = await r2.text();
        } catch (e) {
          console.warn('Failed to fetch mark svg for', k, val.mark, e);
        }
      }
    }

    replacementRules = buildReplacementRules(map);

    if (map.replacements) delete map.replacements;

    phoneticMap = map;
    phoneticKeys = Object.keys(map).sort((a, b) => b.length - a.length);
    return phoneticMap;
  } catch (e) {
    console.warn('Failed to load mappings.json', e);
    phoneticMap = null;
    phoneticKeys = [];
    return null;
  }
}

/**
 * Render plain unmapped text/punctuation without forcing it into a glyph box.
 * This is the key fix for punctuation spacing/alignment issues like:
 *   i'm  -> looking like i' m
 *   glyph, -> comma colliding with a glyph box
 */
function createLiteralNode(text) {
  if (text == null || text === '') {
    return document.createTextNode('');
  }

  const apostrophes = new Set(["'", '’', 'ʼ']);
  const hyphens = new Set(['-', '‐', '‑', '‒', '–', '—']);
  const openPunct = new Set(['(', '[', '{', '“', '‘', '«']);
  const closePunct = new Set([')', ']', '}', ',', '.', ';', ':', '!', '?', '”', '»']);
  const neutralPunct = new Set(['"', '/', '\\', '|', '·', '•']);

  const isSpecialPunct =
    apostrophes.has(text) ||
    hyphens.has(text) ||
    openPunct.has(text) ||
    closePunct.has(text) ||
    neutralPunct.has(text);

  let isGeneralPunct = false;
  try {
    isGeneralPunct = /^[\p{P}\p{S}]$/u.test(text);
  } catch (e) {}

  if (!isSpecialPunct && !isGeneralPunct) {
    return document.createTextNode(text);
  }

  const span = document.createElement('span');
  span.className = 'literal-token';
  span.textContent = text;

  if (apostrophes.has(text)) {
    span.classList.add('punct-joiner', 'punct-apostrophe');
  } else if (hyphens.has(text)) {
    span.classList.add('punct-joiner', 'punct-hyphen');
  } else if (openPunct.has(text)) {
    span.classList.add('punct-open');
  } else if (closePunct.has(text)) {
    span.classList.add('punct-close');
  } else {
    span.classList.add('punct-neutral');
  }

  return span;
}

function createGlyphNode(token) {
  let text, entry, accents;
  if (typeof token === 'string') {
    text = token;
    entry = phoneticMap ? phoneticMap[token] : null;
    accents = [];
  } else {
    text = token.text;
    entry = token.entry || (phoneticMap ? phoneticMap[token.text] : null);
    accents = token.accents || [];
  }

  // IMPORTANT:
  // Unmapped characters should NOT be wrapped in .glyph-wrapper,
  // because that forces punctuation into glyph-cell layout.
  if (!entry) {
    return createLiteralNode(text);
  }

  const wrapper = document.createElement('span');
  wrapper.className = 'glyph-wrapper';
  wrapper.dataset.token = text;
  wrapper.dataset.hasAccent = 'false';

  let svgText = null;
  let pathData = null;
  let paddingLeft = 0;
  let paddingRight = 0;
  let offsetX = 0;
  let offsetY = 0;
  let scale = 1;

  if (typeof entry === 'string') {
    if (entry.trim().startsWith('<')) svgText = entry;
    else pathData = entry;
  } else if (typeof entry === 'object' && entry !== null) {
    if (entry.svg && typeof entry.svg === 'string') {
      if (entry.svg.trim().startsWith('<')) svgText = entry.svg;
      else pathData = entry.svg;
    }
    paddingLeft = Number(entry.paddingLeft ?? entry.padding ?? 0) || 0;
    paddingRight = Number(entry.paddingRight ?? 0) || 0;
    offsetX = Number(entry.offsetX ?? 0) || 0;
    offsetY = Number(entry.offsetY ?? 0) || 0;
    scale = Number(entry.scale ?? 1) || 1;
  }

  if (paddingLeft) wrapper.style.paddingLeft = `${paddingLeft}em`;
  if (paddingRight) wrapper.style.paddingRight = `${paddingRight}em`;

  if (svgText) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgText, 'image/svg+xml');
    const svg = doc.querySelector('svg');
    if (svg) {
      svg.classList.add('glyph');
      svg.style.width = '100%';
      svg.style.height = '100%';
      svg.style.transformOrigin = '50% 50%';
      applyOutlineToSVG(svg);
      if (offsetX || offsetY || scale !== 1) {
        svg.style.transform = `translate(${offsetX}em, ${offsetY}em) scale(${scale})`;
      }
      wrapper.appendChild(svg);

      for (const a of accents) {
        try {
          const d2 = new DOMParser().parseFromString(a, 'image/svg+xml');
          const m = d2.querySelector('svg');
          if (m) {
            m.classList.add('accent');
            applyOutlineToSVG(m);
            m.style.pointerEvents = 'none';
            wrapper.appendChild(m);
            wrapper.dataset.hasAccent = 'true';
          }
        } catch (e) {
          console.warn('Failed to parse accent svg', e);
        }
      }
      return wrapper;
    }
  }

  if (pathData) {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.classList.add('glyph');
    svg.style.width = '100%';
    svg.style.height = '100%';

    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', pathData);
    path.removeAttribute('fill');
    path.removeAttribute('style');
    path.style.setProperty('fill', 'none', 'important');
    path.style.setProperty('stroke', 'currentColor', 'important');
    path.style.setProperty('stroke-width', String(GLYPH_STROKE_WIDTH), 'important');
    path.style.setProperty('stroke-linejoin', 'round', 'important');
    path.style.setProperty('stroke-linecap', 'round', 'important');
    svg.appendChild(path);

    if (offsetX || offsetY || scale !== 1) {
      svg.style.transform = `translate(${offsetX}em, ${offsetY}em) scale(${scale})`;
      svg.style.transformOrigin = '50% 50%';
    }

    wrapper.appendChild(svg);

    for (const a of accents) {
      try {
        const d2 = new DOMParser().parseFromString(a, 'image/svg+xml');
        const m = d2.querySelector('svg');
        if (m) {
          m.classList.add('accent');
          applyOutlineToSVG(m);
          m.style.pointerEvents = 'none';
          wrapper.appendChild(m);
          wrapper.dataset.hasAccent = 'true';
        }
      } catch (e) {
        console.warn('Failed to parse accent svg', e);
      }
    }

    return wrapper;
  }

  // If an entry exists but is malformed/unusable, fall back to plain literal text
  // instead of forcing it through glyph-wrapper layout.
  return createLiteralNode(text);
}

function createPlainWrapperForChar(ch) {
  const w = document.createElement('span');
  w.className = 'glyph-wrapper';
  w.dataset.token = ch;
  w.dataset.isAccent = 'false';
  w.textContent = ch;
  return w;
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeText(text) {
  if (!text) return text;
  try {
    text = text.normalize('NFC');
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

// Segment text into normal and code (inline/backtick and fenced triple backticks)
function segmentByBackticks(input) {
  const out = [];
  let i = 0;
  const n = input.length;
  while (i < n) {
    const pos3 = input.indexOf('```', i);
    const pos1 = input.indexOf('`', i);
    let nextPos = -1;
    let type = null;
    if (pos3 !== -1 && (pos1 === -1 || pos3 <= pos1)) {
      nextPos = pos3;
      type = 'fence3';
    } else if (pos1 !== -1) {
      nextPos = pos1;
      type = 'tick1';
    }

    if (nextPos === -1) {
      out.push({ type: 'text', text: input.slice(i) });
      break;
    }

    if (nextPos > i) {
      out.push({ type: 'text', text: input.slice(i, nextPos) });
    }

    if (type === 'fence3') {
      const end = input.indexOf('```', nextPos + 3);
      if (end === -1) {
        // unmatched: treat rest as code block
        out.push({ type: 'code-block', text: input.slice(nextPos + 3) });
        i = n;
      } else {
        const body = input.slice(nextPos + 3, end);
        out.push({ type: 'code-block', text: body });
        i = end + 3;
      }
      continue;
    }

    if (type === 'tick1') {
      const end = input.indexOf('`', nextPos + 1);
      if (end === -1) {
        // unmatched: treat as literal
        out.push({ type: 'text', text: '`' });
        i = nextPos + 1;
      } else {
        const body = input.slice(nextPos + 1, end);
        out.push({ type: 'code-inline', text: body });
        i = end + 1;
      }
      continue;
    }
  }
  return out;
}

// Render converted content into a given element (like content or notepadOutput)
function renderInto(target, rawText, opts = {}) {
  if (!target) return;
  try {
    target.setAttribute('data-raw', rawText);
  } catch (e) {}

  if (!phoneticMap) {
    target.textContent = rawText;
    return;
  }

  const readerMode = Boolean(opts.readerMode);

  function renderMappedSegment(targetEl, text) {
    const normalized = normalizeText(text);
    const parts = normalized.split(/(\s+)/);
    for (const part of parts) {
      if (!part) continue;

      if (/^\s+$/.test(part)) {
        for (const ch of part) {
          if (ch === '\n') {
            targetEl.appendChild(document.createElement('br'));
          } else if (ch === ' ') {
            const sp = document.createElement('span');
            sp.className = 'space';
            sp.innerHTML = '&nbsp;';
            targetEl.appendChild(sp);
          } else {
            const sp = document.createElement('span');
            sp.className = 'space';
            sp.textContent = ch;
            targetEl.appendChild(sp);
          }
        }
        continue;
      }

      const tokens = [];
      const isWordAllCaps = readerMode && (part === part.toUpperCase()) && /[A-Z]/.test(part);
      for (let i = 0; i < part.length;) {
        let matched = false;
        for (const key of phoneticKeys) {
          const substr = part.substr(i, key.length);
          if (substr.toLowerCase() === key.toLowerCase()) {
            const entry = phoneticMap[key];
            if (entry && entry.mark) {
              const prev = tokens[tokens.length - 1];
              const prevIsPunct = !prev || /^[^\p{L}\p{N}]+$/u.test(prev.text);
              const prevHasAccent = prev && prev.accents && prev.accents.length > 0;
              const isVowelKey = key.length === 1 && /[aeiouy]/i.test(key);
              const matchedIsUpper = substr === substr.toUpperCase() && /[A-Z]/.test(substr);
              if (prev && !prevIsPunct && !prevHasAccent && !(readerMode && isVowelKey && matchedIsUpper)) {
                prev.accents.push(entry.mark);
                i += key.length;
                matched = true;
                break;
              }
            }
            tokens.push({ text: key, entry: entry, accents: [] });
            i += key.length;
            matched = true;
            break;
          }
        }

        if (!matched) {
          const ch = part[i];
          const entry = phoneticMap && phoneticMap[ch] ? phoneticMap[ch] : null;
          tokens.push({ text: ch, entry: entry, accents: [] });
          i += 1;
        }
      }

      const hasWordChars = /[\p{L}\p{N}]/u.test(part);
      const hasMappedGlyph = tokens.some(t => Boolean(t.entry));

      let output = targetEl;
      if (hasWordChars || hasMappedGlyph) {
        const wordWrapper = document.createElement('span');
        wordWrapper.className = 'norin-word';
        wordWrapper.dataset.latin = part;
        wordWrapper.style.cursor = 'help';
        targetEl.appendChild(wordWrapper);
        output = wordWrapper;
      }

      const glyphBuffer = [];
      const flushBufferAsSingles = () => {
        for (const gt of glyphBuffer) output.appendChild(createGlyphNode(gt));
        glyphBuffer.length = 0;
      };

      for (const tok of tokens) {
        if (readerMode && isWordAllCaps) {
          output.appendChild(createGlyphNode(tok));
          continue;
        }

        const isGlyph = Boolean(tok.entry);
        if (!isGlyph) {
          if (glyphBuffer.length > 0) flushBufferAsSingles();
          output.appendChild(createGlyphNode(tok));
          continue;
        }

        glyphBuffer.push(tok);
        if (glyphBuffer.length === 3) {
          const block = document.createElement('span');
          block.className = 'sinogram';

          const t1 = createGlyphNode(glyphBuffer[0]);
          t1.classList.add('sin-first');
          block.appendChild(t1);

          const t2 = createGlyphNode(glyphBuffer[1]);
          t2.classList.add('sin-right');
          block.appendChild(t2);

          const t3 = createGlyphNode(glyphBuffer[2]);
          t3.classList.add('sin-below');
          block.appendChild(t3);

          output.appendChild(block);
          adjustStrokeForBlock(block);
          glyphBuffer.length = 0;
        }
      }

      if (glyphBuffer.length > 0) flushBufferAsSingles();
    }
  }

  target.innerHTML = '';
  const segments = segmentByBackticks(String(rawText || ''));
  for (const seg of segments) {
    if (!seg || typeof seg.text !== 'string') continue;
    if (seg.type === 'text') {
      renderMappedSegment(target, seg.text);
      continue;
    }
    if (seg.type === 'code-inline') {
      const span = document.createElement('span');
      span.className = 'norin-code-inline';
      span.style.fontFamily = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace';
      span.style.background = 'transparent';
      span.style.border = 'none';
      span.textContent = seg.text;
      target.appendChild(span);
      continue;
    }
    if (seg.type === 'code-block') {
      const pre = document.createElement('pre');
      pre.className = 'norin-code-block';
      pre.style.fontFamily = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace';
      pre.style.whiteSpace = 'pre-wrap';
      pre.style.border = '1px solid var(--border)';
      pre.style.padding = '10px 12px';
      pre.style.borderRadius = '6px';
      pre.style.background = 'var(--panel-bg)';
      pre.style.color = 'var(--text)';
      pre.style.margin = '8px 0';
      pre.textContent = seg.text.replace(/^\n/, '');
      target.appendChild(pre);
      continue;
    }
  }
}

function setReaderMode(showGlyphs) {
  contentLatin.style.display = showGlyphs ? 'none' : '';
  contentNorin.style.display = showGlyphs ? '' : 'none';
}

function prepareReaderContent(rawText) {
  readerRawText = rawText || '';
  content.setAttribute('data-raw', readerRawText);

  contentLatin.textContent = readerRawText;

  if (!phoneticMap) {
    contentNorin.innerHTML = '';
    readerNorinPreparedFor = null;
    return;
  }

  if (readerNorinPreparedFor !== readerRawText) {
    const html = glyphCache.get(readerRawText) || cacheGlyphsFor(readerRawText);
    contentNorin.innerHTML = html;
    // ensure norin pane is visible temporarily so computed transforms (scale) are applied
    const prevDisplay = contentNorin.style.display;
    try {
      contentNorin.style.display = '';
      applyGlobalStrokeToContainer(contentNorin);
    } finally {
      contentNorin.style.display = prevDisplay;
    }
    readerNorinPreparedFor = readerRawText;
  }
}

async function loadReaderDocument(result) {
  await loadMappings();

  const original = result.content || '';

  // Yield a frame so overlay/dots can update before heavy rendering work
  try { await new Promise((r) => requestAnimationFrame(r)); } catch (e) {}

  cacheGlyphsFor(original);
  prepareReaderContent(original);
  setReaderMode(toggleGlyphs.checked);

  // set window title to include filename (basename)
  try {
    const name = result.name || ((result.filePath || '').split(/[/\\]/).pop()) || 'Untitled';
    document.title = `Norin Reader - "${name}"`;
  } catch (e) {}

  try { localStorage.setItem('lastFilePath', result.filePath); } catch (e) {}
}

function renderText(rawText) {
  prepareReaderContent(rawText);
  setReaderMode(toggleGlyphs && toggleGlyphs.checked);
}

openBtn.addEventListener('click', async () => {
  let result;
  try {
    // Wait for user's selection; do not show overlay during file picker
    result = await window.readerAPI.openFile();
  } catch (e) {
    status.textContent = `Error: ${e && e.message ? e.message : 'failed to open'}`;
    return;
  }

  if (result.canceled) {
    status.textContent = 'Open canceled.';
    return;
  }

  if (result.error) {
    status.textContent = `Error: ${result.error}`;
    contentLatin.textContent = '';
    contentNorin.innerHTML = '';
    readerRawText = '';
    readerNorinPreparedFor = null;
    content.removeAttribute('data-raw');
    return;
  }

  showLoadingOverlay('Loading');
  // Ensure the overlay paints before heavy work begins
  try { await new Promise((r) => requestAnimationFrame(r)); } catch (e) {}
  try {
    await loadReaderDocument(result);
  } finally {
    hideLoadingOverlay();
  }

  // mark opened on server to update shared history (fire-and-forget)
  try { window.NorinAPI && window.NorinAPI.markOpened && result.id && window.NorinAPI.markOpened(result.id); } catch (e) {}

  renderRecentLinksIfStart();
});

toggleGlyphs.addEventListener('change', () => {
  hideHoverTooltip();
  if (!readerRawText) return;
  setReaderMode(toggleGlyphs.checked);
});

// Render recent file links when content is the start placeholder
async function renderRecentLinks() {
  const div = document.createElement('div');
  div.className = 'recent-list';

  let arr = [];
  try {
    const list = await (window.NorinAPI && window.NorinAPI.listFiles ? window.NorinAPI.listFiles('opened', { dedupe: 'name' }) : Promise.resolve([]));
    arr = Array.isArray(list) ? list.slice(0, 5) : [];
  } catch (e) {
    return null; // graceful: no recents shown on failure
  }

  if (!arr || arr.length === 0) return null;

  for (const doc of arr) {
    const btn = document.createElement('button');
    btn.className = 'recent-link';
    btn.textContent = doc.name || ('#' + (doc.id || '?'));
    btn.title = doc.id || '';

    btn.addEventListener('click', async () => {
      showLoadingOverlay('Loading');
      // Allow one frame so dots start animating before fetch/render
      try { await new Promise((r) => requestAnimationFrame(r)); } catch (e) {}
      // open by server document id
      const res = await (window.readerAPI.openById ? window.readerAPI.openById(doc.id) : Promise.resolve({ canceled: true, error: 'unsupported' }));

      if (res.canceled) {
        hideLoadingOverlay();
        status.textContent = 'Open canceled.';
        return;
      }

      if (res.error) {
        hideLoadingOverlay();
        status.textContent = `Error: ${res.error}`;
        return;
      }

      try {
        await loadReaderDocument(res);
      } finally {
        hideLoadingOverlay();
      }

      // mark opened on server to update shared history (fire-and-forget)
      try { window.NorinAPI && window.NorinAPI.markOpened && doc.id && window.NorinAPI.markOpened(doc.id); } catch (e) {}

      renderRecentLinksIfStart();
    });

    div.appendChild(btn);
  }

  return div;
}

async function renderRecentLinksIfStart() {
  const defaultText = 'Start by opening a text file from disk.';
  if (
    (contentLatin.textContent || '').trim() === '' ||
    (contentLatin.textContent || '').trim() === defaultText ||
    content.getAttribute('data-raw') === null
  ) {
    contentLatin.innerHTML = '';

    const p = document.createElement('div');
    p.textContent = defaultText;
    contentLatin.appendChild(p);

    try {
      const links = await renderRecentLinks();
      if (links) {
        contentLatin.appendChild(links);
      } else {
        const note = document.createElement('div');
        note.style.color = 'var(--muted)';
        note.style.marginTop = '6px';
        note.textContent = 'Recent files unavailable.';
        contentLatin.appendChild(note);
      }
    } catch (e) {
      const note = document.createElement('div');
      note.style.color = 'var(--muted)';
      note.style.marginTop = '6px';
      note.textContent = 'Recent files unavailable.';
      contentLatin.appendChild(note);
    }

    contentNorin.innerHTML = '';
    contentLatin.style.display = '';
    contentNorin.style.display = 'none';
    hideHoverTooltip();
    return;
  }
}

window.addEventListener('DOMContentLoaded', async () => {
  const lastFile = null; // deprecated path-based reopen
  // set default window title
  document.title = 'Norin Reader';

  // Optional: show overlay if mappings take noticeable time
  let mappingOverlayShown = false;
  const mappingDelay = setTimeout(() => { showLoadingOverlay('Loading'); mappingOverlayShown = true; }, 300);
  await loadMappings();
  clearTimeout(mappingDelay);
  if (mappingOverlayShown) hideLoadingOverlay();

  // initialize font/glyph size from saved preference or default
  const saved = Number(localStorage.getItem('readerFontSize')) || 18;
  sizeRange.value = saved;
  sizeVal.textContent = String(saved);

  content.style.fontSize = `${saved}px`;
  if (contentLatin) contentLatin.style.fontSize = `${saved}px`;
  if (contentNorin) contentNorin.style.fontSize = `${saved}px`;
  if (chatTranscript) chatTranscript.style.fontSize = `${saved}px`;
  if (chatInput) chatInput.style.fontSize = `${saved}px`;

  // initialize dark mode
  try {
    const darkSaved = localStorage.getItem('readerDark') === 'true';
    if (toggleDark) toggleDark.checked = darkSaved;
    document.body.classList.toggle('dark', darkSaved);
  } catch (e) {}

  // horizontal lines feature removed from UI

  // handle slider changes
  sizeRange.addEventListener('input', () => {
    const v = Number(sizeRange.value);
    sizeVal.textContent = String(v);
    content.style.fontSize = `${v}px`;
    if (contentLatin) contentLatin.style.fontSize = `${v}px`;
    if (contentNorin) contentNorin.style.fontSize = `${v}px`;
    if (chatTranscript) chatTranscript.style.fontSize = `${v}px`;
    if (chatInput) chatInput.style.fontSize = `${v}px`;
    localStorage.setItem('readerFontSize', String(v));
  });

  // Lines toggle removed

  if (toggleDark) {
    toggleDark.addEventListener('change', () => {
      const on = Boolean(toggleDark.checked);
      document.body.classList.toggle('dark', on);
      localStorage.setItem('readerDark', on ? 'true' : 'false');
    });
  }

  // Tab switching
  tabReader.addEventListener('click', () => {
    hideHoverTooltip();
    tabReader.classList.add('active');
    tabNotepad.classList.remove('active');
    if (tabChat) tabChat.classList.remove('active');
    readerTab.style.display = '';
    notepadTab.style.display = 'none';
    if (chatTab) chatTab.style.display = 'none';
  });

  tabNotepad.addEventListener('click', () => {
    hideHoverTooltip();
    tabNotepad.classList.add('active');
    tabReader.classList.remove('active');
    if (tabChat) tabChat.classList.remove('active');
    readerTab.style.display = 'none';
    notepadTab.style.display = '';
    notepadInput.focus();
    if (chatTab) chatTab.style.display = 'none';
  });

  if (tabChat) {
    tabChat.addEventListener('click', () => {
      hideHoverTooltip();
      tabChat.classList.add('active');
      tabReader.classList.remove('active');
      tabNotepad.classList.remove('active');
      readerTab.style.display = 'none';
      notepadTab.style.display = 'none';
      chatTab.style.display = '';
      if (chatInput) chatInput.focus();
    });
  }

  // Live conversion in notepad: render converted view on input
  notepadInput.addEventListener('input', () => {
    const raw = notepadInput.innerText || '';
    // use readerMode rules (capitalization/block behavior) in Notepad as well
    renderInto(notepadOutput, raw, { readerMode: true });
  });

  // Clear placeholder on first focus
  notepadInput.addEventListener('focus', () => {
    if ((notepadInput.innerText || '').trim() === 'Type here...') {
      notepadInput.innerText = '';
    }
  });

  // initialize notepad scale
  const savedNotepadScale = Number(localStorage.getItem('notepadScale')) || 18;
  notepadScale.value = savedNotepadScale;
  notepadScaleVal.textContent = String(savedNotepadScale);
  notepadOutput.style.fontSize = `${savedNotepadScale}px`;
  notepadOutput.style.lineHeight = '1.6';

  notepadScale.addEventListener('input', () => {
    const v = Number(notepadScale.value);
    notepadScaleVal.textContent = String(v);
    notepadOutput.style.fontSize = `${v}px`;
    notepadOutput.style.lineHeight = '1.6';
    localStorage.setItem('notepadScale', String(v));
  });

  exportPdfBtn.addEventListener('click', async () => {
    hideHoverTooltip();
    status.textContent = 'Preparing export...';
    try {
      document.body.classList.add('exporting');
      await new Promise((r) => requestAnimationFrame(r));
      await new Promise((r) => setTimeout(r, 80));

      status.textContent = 'Exporting PDF...';
      const res = await window.readerAPI.exportPdf();

      if (res.canceled) {
        status.textContent = 'Export canceled.';
      } else if (res.error) {
        status.textContent = `Export error: ${res.error}`;
      } else {
        status.textContent = `Exported PDF: ${res.filePath}`;
      }
    } catch (e) {
      status.textContent = `Export failed: ${e.message}`;
    } finally {
      document.body.classList.remove('exporting');
    }
  });

  attachNorinHoverTooltips(contentNorin);
  attachNorinHoverTooltips(notepadOutput);
  attachNorinHoverTooltips(chatTranscript);

  // render recent-file links on the start screen if applicable
  renderRecentLinksIfStart();
});

// -----------------
// Chat functionality
// -----------------
function createMessageRow(role, labelText, opts = {}) {
  const row = document.createElement('div');
  row.className = `chat-row chat-${role}`;
  row.style.display = 'flex';
  row.style.width = '100%';
  row.style.margin = '10px 0';

  // Align row based on role
  row.style.justifyContent = role === 'user' ? 'flex-end' : 'flex-start';

  // Container holds label above bubble
  const container = document.createElement('div');
  container.style.display = 'flex';
  container.style.flexDirection = 'column';
  container.style.gap = '6px';
  // Do not expand horizontally: constrain to a sensible width
  container.style.maxWidth = '75%';

  const labelBar = document.createElement('div');
  labelBar.style.display = 'flex';
  labelBar.style.alignItems = 'center';
  labelBar.style.gap = '8px';
  labelBar.style.justifyContent = role === 'user' ? 'flex-end' : 'space-between';

  const label = document.createElement('div');
  label.className = 'chat-label';
  label.style.fontWeight = '600';
  label.style.color = 'var(--muted)';
  label.style.textAlign = role === 'user' ? 'right' : 'left';
  label.textContent = labelText || (role === 'user' ? 'User' : 'Assistant');

  labelBar.appendChild(label);

  let delBtn = null;
  if (opts.deletable) {
    delBtn = document.createElement('button');
    delBtn.textContent = '×';
    delBtn.title = 'Delete';
    delBtn.style.background = 'transparent';
    delBtn.style.border = '1px solid var(--border)';
    delBtn.style.color = 'var(--text)';
    delBtn.style.borderRadius = '4px';
    delBtn.style.padding = '0 6px';
    delBtn.style.lineHeight = '1.2';
    delBtn.style.cursor = 'pointer';
    if (typeof opts.onDelete === 'function') {
      delBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        opts.onDelete();
      });
    }
    labelBar.appendChild(delBtn);
  }

  const bubble = document.createElement('div');
  bubble.className = 'chat-bubble';
  bubble.style.border = '1px solid var(--border)';
  bubble.style.padding = '10px 12px';
  bubble.style.borderRadius = '8px';
  bubble.style.background = 'var(--panel-bg)';
  bubble.style.color = 'var(--text)';
  // Let the bubble size to content within the container cap
  bubble.style.width = 'auto';
  bubble.style.maxWidth = '100%';
  bubble.style.textAlign = role === 'user' ? 'right' : 'left';
  bubble.style.wordBreak = 'break-word';

  container.appendChild(labelBar);
  container.appendChild(bubble);
  row.appendChild(container);
  return { row, bubble, label, delBtn };
}

function scrollTranscriptToEnd() {
  try { chatTranscript.scrollTop = chatTranscript.scrollHeight; } catch (e) {}
}

function renderLatinAsNorinInto(target, latinText) {
  // Render using existing Norin renderer; readerMode on for consistency
  renderInto(target, latinText || '', { readerMode: true });
}

async function sendChatMessage() {
  if (!chatInput || !chatTranscript || chatSending) return;
  const raw = (chatInput.innerText || '').trim();
  if (!raw) return;

  chatSending = true;
  if (chatStatus) chatStatus.textContent = 'Sending…';
  if (chatSend) { chatSend.textContent = 'Stop'; }

  // Append user message (rendered as Norin)
  const userId = `u${++chatMsgSeq}`;
  const userMsg = createMessageRow('user', 'User', {
    deletable: true,
    onDelete: () => {
      try { userMsg.row.remove(); } catch (e) {}
      chatTranscriptData = chatTranscriptData.filter((m) => m && m.id !== userId);
    }
  });
  userMsg.row.dataset.msgId = userId;
  chatTranscript.appendChild(userMsg.row);
  renderLatinAsNorinInto(userMsg.bubble, raw);
  scrollTranscriptToEnd();
  chatTranscriptData.push({ id: userId, role: 'user', latin: raw });

  // Prepare assistant message container
  let modelLabel = '';
  try {
    const info = await (window.NorinAPI && window.NorinAPI.getChatModelInfo ? window.NorinAPI.getChatModelInfo() : Promise.resolve({ id: '', displayName: '' }));
    modelLabel = (info && (info.displayName || info.id)) || '';
  } catch (e) {}
  const asstId = `a${++chatMsgSeq}`;
  const asstMsg = createMessageRow('assistant', modelLabel || 'Assistant', {
    deletable: true,
    onDelete: () => {
      try { asstMsg.row.remove(); } catch (e) {}
      chatTranscriptData = chatTranscriptData.filter((m) => m && m.id !== asstId);
    }
  });
  asstMsg.row.dataset.msgId = asstId;
  chatTranscript.appendChild(asstMsg.row);
  let partial = '';
  let scheduled = false;
  const scheduleRender = () => {
    if (scheduled) return; scheduled = true;
    setTimeout(() => {
      try { renderLatinAsNorinInto(asstMsg.bubble, partial); } catch (e) {}
      scheduled = false;
      scrollTranscriptToEnd();
    }, 160);
  };

  // Clear input
  chatInput.innerText = '';

  try {
    // Build up to 3 previous messages from transcriptData
    const history = chatTranscriptData
      .filter((m) => m && (m.role === 'user' || m.role === 'assistant'))
      .filter((m) => m.id !== userId)
      .slice(-3)
      .map((m) => ({ role: m.role, content: m.latin }));

    if (window.NorinAPI && typeof window.NorinAPI.chatStream === 'function') {
      chatAbortController = new AbortController();
      const opts = { history, signal: chatAbortController.signal };
      const res = await window.NorinAPI.chatStream(raw, (chunk, full, meta) => {
        if (meta && meta.start && meta.modelName && asstMsg.label) {
          asstMsg.label.textContent = meta.modelName;
        }
        partial = full || partial;
        scheduleRender();
      }, opts);
      // Final render to ensure we show the last part
      renderLatinAsNorinInto(asstMsg.bubble, partial);
      scrollTranscriptToEnd();
      chatTranscriptData.push({ id: asstId, role: 'assistant', latin: partial });
    } else if (window.NorinAPI && typeof window.NorinAPI.chat === 'function') {
      const r = await window.NorinAPI.chat(raw, { history });
      partial = (r && r.text) || '';
      if (r && (r.modelDisplayName || r.modelId) && asstMsg.label) {
        asstMsg.label.textContent = r.modelDisplayName || r.modelId;
      }
      renderLatinAsNorinInto(asstMsg.bubble, partial);
      scrollTranscriptToEnd();
      chatTranscriptData.push({ id: asstId, role: 'assistant', latin: partial });
    } else {
      throw new Error('Chat API unavailable');
    }
  } catch (e) {
    if (e && e.name === 'AbortError') {
      asstMsg.bubble.textContent = (partial && partial.length) ? '' : 'Stopped';
      if (partial && partial.length) {
        chatTranscriptData.push({ id: asstId, role: 'assistant', latin: partial });
      }
    } else {
      asstMsg.bubble.textContent = `Error: ${e && e.message ? e.message : 'failed'}`;
    }
  } finally {
    chatSending = false;
    chatAbortController = null;
    if (chatSend) { chatSend.textContent = 'Send'; }
    if (chatStatus) chatStatus.textContent = '';
  }
}

if (chatSend) chatSend.addEventListener('click', () => {
  if (chatSending && chatAbortController) {
    try { chatAbortController.abort(); } catch (e) {}
    return;
  }
  sendChatMessage();
});
if (chatInput) chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendChatMessage();
  }
});