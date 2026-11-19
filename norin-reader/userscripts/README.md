# Norin Everywhere 3.0.0

Paste `norin-everywhere.user.js` into Tampermonkey, save, and reload the page.
Allow access to `raw.githubusercontent.com` if prompted, and disable older copies.
The floating **Norin / English** button and userscript menu switch modes. Drag
the button to reposition it; its position is remembered per website.

English is converted using the bundled phonetic rules, then rendered as Unicode
text with [Norin.ttf](https://github.com/TheCyaniteProject/norin/blob/main/norin-font/Norin.ttf).
The font is downloaded once per page through Tampermonkey and loaded before any
English text is hidden. A failed download leaves the page in English.

Conversion preserves letters used for mouth shape or spelling context, even when
unvoiced: `hope` and `boat` retain their vowels, and `comb` retains its `b`
(`komb` after the existing C rule). Word exceptions include `write` → `rit`,
`have` → `hav`, `said` → `sed`, and `does` → `duz`. Soft G conversions target
known words and families, preserving hard G in `get`, `give`, `girl`, and `gear`.

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
positioned glyphs, or special punctuation placement rules. The old SVG accent
padding, glyph scaling, and vector/image fallback paths have also been removed.
Text bounds are still measured for overlay alignment and editing hit testing.

Norin overlays use a minimum font size of 18px, including inputs and editors.
Larger text keeps its original size, and English mode retains the site's sizing.

Only mapped characters use Norin. The FontFace is restricted to U+E000–U+E061,
and literal text inherits the website's font. Numbers, punctuation, symbols,
emoji, and unsupported characters retain their text and normal typography.
Hyphens, quotes, and dashes are no longer rewritten for custom symbol spacing.

Original page text, input values, and editor DOM stay English beneath isolated,
non-interactive text overlays. Copying, sending, accessibility, search, and
keyboard editing continue to use English. Selecting text reveals English. Hidden overlays retain their positioning anchors,
so selection followed by a resize or scroll does not shift the restored text.
Leading numbers and symbols (for example, `1 - ` before a title) retain their
native positions, and the first translated word starts at its English position.
Word flow uses the original whitespace widths without a forced minimum gap.
Inputs, textareas, and contenteditable editors have mapped carets. The overlay
copies the source caret color (including transparent), honors supported
`caret-shape` and `caret-animation: manual` settings, and respects reduced motion.
Caret height follows the rendered Norin size. Native inline caret styles are
left intact. OS blink timing and native caret thickness are not exposed to page
JavaScript; the fallback is a 1px blinking bar, with approximate block/underscore
widths when those shapes are supported.

For editing, the active
word temporarily unpacks around the caret. IME composition uses English until
composition finishes. Password and non-text controls are excluded.

Code elements, Markdown backtick code, displayed HTTP(S) URLs, and words containing
`@` stay English. This includes mentions and email addresses in page text, links,
and editors. Text directly inside an element with a class containing `username`
(case-insensitive) stays English on any site. The marker does not exclude child
elements, so containers such as `usernameAndPronounsRow` do not suppress pronouns
or display names in their own spans. Username fields identified by name, ID, or autocomplete, and password
fields identified by type or autocomplete, are excluded. Display names without
a username marker still translate normally.
Other link labels can render in Norin. Add `data-norin-ignore` to exclude a
subtree. Text inside images, canvas, existing SVG, closed shadow roots, browser
UI, CSS-generated content, and native select menus is not translated.

Viewport tracking, mutation updates, scrolling recovery, spelling/template caches,
and detached-view reuse keep work focused on nearby content. A 3,400px buffer
around the viewport and nested scroll panels prepares text before it appears
and retains it after it leaves view, so short scrolls reuse mounted overlays.
Settled-scroll recovery uses the same buffer. Font templates are prepared in
batches of up to 32 while retaining the frame budget; distant text is still culled. Overlays follow
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

## Class exclusions

Edit `CLASS_EXCLUSIONS` near the top of the userscript. Strings match exact,
case-sensitive class names; regexes test each individual class name:

```js
const CLASS_EXCLUSIONS = [
  'ExactClassName',
  /username/i,
  {match: 'applicationSublabel_nByiE3', subtree: true},
  {match: /codeBlock|code-block/, subtree: true}
];
```

Plain strings and regexes exclude only directly contained text. Use
`{match: stringOrRegex, subtree: true}` to exclude the element and its descendants.
This keeps username container classes from suppressing nested pronouns or names.
Reload the page after editing the settings.
