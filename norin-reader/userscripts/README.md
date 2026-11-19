# Norin Everywhere 3.0.0

Paste `norin-everywhere.user.js` into Tampermonkey, save, and reload the page.
Allow access to `raw.githubusercontent.com` if prompted, and disable older copies.
The floating **Norin / English** button and userscript menu switch modes. Drag
the button to reposition it; its position is remembered per website.

English is converted using the bundled phonetic rules, then rendered as Unicode
text with [Norin.ttf](https://github.com/TheCyaniteProject/norin/blob/main/norin-font/Norin.ttf).
The font is downloaded once per page through Tampermonkey and loaded before any
English text is hidden. A failed download leaves the page in English.

The character map is:

| Characters | First code | Codes per character |
| --- | --- | --- |
| a, e, i, o, u | U+E000 | 4: full, top, bottom, accent |
| air, au, ch, ee, ng, oo, sh, th | U+E014 | 3: full, top, bottom |
| b, d, f, g, h, j, k, l, m, n, p, r, s, t, v, w, y, z | U+E02C | 3: full, top, bottom |

A vowel following an eligible character becomes its accent. Groups of three
characters use full, top, and bottom variants. Uppercase vowels remain full
characters, and all-caps words remain unstacked. The font controls glyph
placement and advance widths; there are no SVG downloads, word images, manually
positioned glyphs, or special punctuation placement rules.

Only mapped characters use Norin. The FontFace is restricted to U+E000–U+E061,
and literal text inherits the website's font. Numbers, punctuation, symbols,
emoji, and unsupported characters retain their text and normal typography.
Hyphens, quotes, and dashes are no longer rewritten for custom symbol spacing.

Original page text, input values, and editor DOM stay English beneath isolated,
non-interactive text overlays. Copying, sending, accessibility, search, and
keyboard editing continue to use English. Selecting text reveals English.
Inputs, textareas, and contenteditable editors have mapped carets; the active
word temporarily unpacks around the caret. IME composition uses English until
composition finishes. Password and non-text controls are excluded.

Code elements, Markdown backtick code, and displayed HTTP(S) URLs stay English.
Other link labels can render in Norin. Add `data-norin-ignore` to exclude a
subtree. Text inside images, canvas, existing SVG, closed shadow roots, browser
UI, CSS-generated content, and native select menus is not translated.

Viewport tracking, mutation updates, scrolling recovery, spelling/template caches,
and detached-view reuse keep work focused on visible content. Overlays follow
the original page's line positions and clipping. Specialized editors and unusual
transforms may still need site-specific adjustments.

Run the syntax check and local Chrome regression suite:

```bash
node --check userscripts/norin-everywhere.user.js
node userscripts/tests/browser.cjs
```

The suite requires Node.js with built-in WebSocket support and Chrome (`CHROME`
can override `google-chrome`). It uses the real font in `tests/fixtures/Norin.ttf`,
downloaded from the linked repository, and mocks only its network delivery.
It checks character mappings, block variants, accents, symbol preservation,
font isolation, original text, overlays, control updates, exclusions, and toggling.
A screenshot is saved to the printed temporary directory. Live Discord still
needs verification after installation.
