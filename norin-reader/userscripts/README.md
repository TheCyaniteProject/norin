# Norin Everywhere 2.7.12

Create a Tampermonkey script, paste all of `norin-everywhere.user.js`, save,
and reload Discord or another website. Allow access to
`raw.githubusercontent.com` if Tampermonkey prompts for it. Disable any older
duplicate Norin scripts. The menu command **Toggle Norin / English** restores
the original view.

A small **Norin / English** button defaults to the top-right corner. Its
label shows the current mode; click it to switch. Drag it with a mouse, pen,
or touch to reposition it. Dragging does not toggle the mode. It stays within
the window and remembers its position per website when local storage is
available. The button stays readable and visible in either mode, and the menu
command updates it too.

The script embeds the current `public/mappings.json` rules in their original
order. Normalization, vowel accents, punctuation, capitalization, and the
three-glyph 1⅔-em blocks are preserved. The two smaller glyphs are two-thirds
size. SVGs come from
[the Norin glyph repository](https://github.com/TheCyaniteProject/norin/tree/main/norin-font/glyphs);
no local server is needed.

## Rendering and performance

- `IntersectionObserver` tracks text blocks and controls near the viewport.
  Offscreen history is indexed but not tokenized or measured word by word.
- Mutations queue the affected block. Typing queues the composer/control,
  rather than rescanning the page. Resizes and theme/font changes invalidate
  the visible blocks that need updating.
- A spelling cache runs the regex pipeline once per distinct input spelling.
  Equivalent glyph layouts (such as `Could` and `could`) then share a shape,
  measured width, and rendered image across locations with the same styling.
  The cache key retains uppercase-vowel and all-caps layout distinctions, literal
  text, font, weight, style, color, and font revision. Original English source text
  is never replaced by the representative cached spelling.
- Word images are measured from visible SVG stroke bounds (including accents),
  not the blank margins in the original SVG cells. Within-word clearances are
  0.14 em, or 0.05 em beside apostrophes/hyphens; normal word boundaries have at
  least 0.60 em of spacing. These internal clearances are measured before the uniform glyph scale.
  Packing is cached with the word image and does not change token grouping or
  the 1⅔ block width and two-thirds-size secondary glyphs.
- A complete word is a cached SVG image, including its accents, literal digits,
  punctuation, and block layout. The glyph trees are inside the image resource,
  not thousands of live page elements. Word images have padding for accents.
- Color-independent word shapes, styled word images, measured widths, and
  detached word elements are cached. Discord message remounts can reuse the
  detached elements. Limits are 4,000 spelling conversions, 1,000 shapes, 2,000 styled word images, and
  2,500 detached word views. Least-recently-used entries are evicted.
- Offscreen elements stay detached, so they do not add page layout/paint work.
  Source-element anchors preserve native scrolling, clipping, and hover-only
  visibility. Shared shadow stylesheets isolate the glyphs from website CSS.
- Work yields between blocks with a best-effort 7 ms frame budget. Cold image
  generation is limited to eight new word images per block pass. A cold line
  remains English until all its images are ready, avoiding blank or partly
  translated lines. First-time work for an individual block can exceed the
  scheduling budget.
- Style writes and highlight rebuilds are skipped when unchanged. There are no
  page-wide hover redraws or periodic page-wide text scans. Polling checks only
  values of visible form controls to catch silent programmatic changes.

Caches are in memory for the current page session. Reloading starts a fresh
cache. If a browser or site policy blocks word images, the script falls back to
inline vector rendering for readability; that fallback uses more live elements.

## Behavior

Original page text and editor DOM stay intact under non-interactive overlays.
This avoids rewriting Discord's React messages or Slate editor nodes. Typing,
sending, copying, accessibility tools, and search still use English. Text inputs
and textareas receive separate div overlays; contenteditable editors use text
ranges. Password and non-text controls are excluded.

Only displayed URL labels beginning with `http://` or `https://` stay English.
Other clickable labels, including Discord names, render in Norin regardless of
the destination URL. Literal HTTP(S) URL tokens are also excluded.

HTML `pre`, `code`, `kbd`, and `samp` elements, Discord/Slate code blocks,
and literal backtick-delimited inline/fenced code remain English. Backtick
protection also works across inline nodes and in composers and form controls.

Hyphens touching a letter on either side render as em dashes: `oo-`, `-oo`,
and `o-o` become `oo—`, `—oo`, and `o—o`. Each `--` pair also becomes one
em dash, so `----` becomes `——`. Spaced single hyphens (`o - o`), numeric
ranges, original English, code, and URLs are unchanged.

Selecting text hides the selected source element's Norin and reveals English;
clearing the selection restores Norin. Selecting text in a form control reveals
that control's English. Selection updates do not rerender glyphs or measure the
page. Add `data-norin-ignore` to an element to exclude its subtree.

Page line positions follow the original English layout. A word split across
English lines stays whole on its first line when its complete Norin image fits
the available width after preceding Norin words. Otherwise each native line
fragment receives its own overlay. Normalization runs on the complete word
before dividing its result, and discretionary soft hyphens are ignored. Words with the same
site font size use the same fixed 72% glyph scale rather than shrinking individual
words or lines differently. Accents are raised above their letters, and the two
secondary glyphs have more vertical separation. Images have extra transparent
padding and can overflow their own word boxes. Painted vertical bounds are
cached and aligned per line, making room for accents inside tight name rows.
Discord's overflow/clipping rules are not overridden. The block remains 1⅔ em
wide before the uniform scale, with secondary glyphs at two-thirds size. Input overlays
wrap the Norin representation and show a mapped Norin caret while editing.
Text embedded in images, canvas, existing SVG, closed shadow roots, browser UI,
CSS-generated content, and native select menus is not translated. Unusually
transformed elements or specialized editors may need site-specific adjustments.

## Checks

```bash
node --check userscripts/norin-everywhere.user.js
node userscripts/tests/browser.cjs
node userscripts/tests/browser.cjs --benchmark
```

The browser suite requires Node.js with built-in `WebSocket` support and a local
Chrome executable (`CHROME` can override `google-chrome`). It uses a local
1,000-message fixture and mocked SVG downloads, not a real Discord account.
It checks mappings, viewport tracking, word-image loading, native scrolling,
visibility, selection, numbers, links, control/editor updates, cache reuse and
bounds, style-write suppression, font/theme changes, and image-failure fallback.
A screenshot and benchmark results are saved to the printed temporary directory.

To compare an older script on the same scrolling fixture:

```bash
NORIN_BASELINE=/path/to/previous.user.js node userscripts/tests/browser.cjs --benchmark
```

Synthetic timings are not a guarantee of frame rates in live Discord or on
other websites. Live Discord still needs a check after installation.

For accent-bound checks using the real glyph artwork instead of mock SVGs:

```bash
NORIN_TEST_GLYPHS=/path/to/norin-font/glyphs node userscripts/tests/browser.cjs
```

This path is used only by the local test fixture. The installed userscript
still downloads its SVGs from the GitHub repository.


Inline image emojis (Discord/custom emojis and Twemoji) and emoji-only inline
spans keep their native size, appearance, and click behavior, but move with the
Norin word flow instead of staying at the old English coordinates. Avatars and
attachments are excluded. English mode and selection restore their original
positions; repeated updates do not accumulate translation offsets.

Scrolling immediately queues active blocks. Settled scrolling also checks the
indexed block boxes in frame-budgeted batches, so narrow text, offscreen footers,
and missed feed intersections can recover without relying on sample points. A
supplementary scan samples at most 24 small visible roots for recycled feed
content. Neither recovery path walks the full document/history or invalidates
cached spellings that have not changed. Inline elements with zero
client dimensions no longer create false clipping boxes, and page updates that
remove an overlay without replacing the text can now repair that overlay.

## Editing caret

Text inputs, textareas, and contenteditable editors (including Discord's composer)
show a blinking caret at the Norin position corresponding to the English cursor.
Only the word containing the cursor temporarily unpacks into full-size glyphs.
Its left and right halves render separately, so a vowel immediately after the
cursor becomes a full vowel glyph rather than an accent across the caret:
`dra|w` displays `D Ra |W`, while `dr|aw` displays `D R |A W`.
The word restacks at its boundary or on blur. Other words retain their normal
cached images and three-glyph blocks.

The whole word is normalized first; the two halves are not independently run
through the regex rules. Alignment results and editing segments are cached.
New segments can draw as small inline vectors while their cached images decode,
so moving to a new caret position does not need to flash English.

Keyboard editing remains native English. Clicking a rendered glyph or vowel
accent maps back to its English source offset; selecting or dragging text still
reveals English as before. Form-control overlays scroll to keep the Norin caret
visible rather than following the longer English text's scroll distance.
Composition/IME uses native English until composition finishes. Input types
without a browser selection-offset API (such as email) use English while focused.

Regex rules can remove letters or expand one letter into several phonetic
characters. Such cases do not have a perfect one-to-one cursor mapping: multiple
English positions can correspond to the same visible boundary. English remains
the authoritative editable value, and no editor-owned text nodes are replaced.

SVG artwork is read as a restricted set of geometry elements and attributes,
constructed directly with DOM methods and sanitized before use.
Rendering avoids page HTML sinks, supporting sites that enforce Trusted Types
(such as YouTube) without creating or changing a page policy. The browser suite
includes strict Trusted Types with policy creation disabled and document-scroll
checks for narrow text and an initially offscreen footer.

Root overflow and body overflow propagated to the viewport use viewport clipping
rather than the scrolling HTML/body rectangle. This prevents a fixed translation
cutoff on full-height pages, including reloads at a restored scroll position.
Nested scroll containers keep their own clipping bounds.

Wrapped-word checks cover forced wrapping, hyphen breaks, soft hyphens, compact
words staying whole, and resizing between wrapped and unwrapped layouts.

Standalone ASCII punctuation, including `:` and `>`, participates in the same
Norin word flow as surrounding text instead of remaining at English coordinates.
Adjacent inline text elements also share that flow when no protected text lies
between them. Punctuation-only images use the same measured spacing as words.

Apostrophes sit higher beside Norin glyphs in both cached word images and
unstacked editing segments.

Literal `<` and `>` symbols render at 160% size to distinguish them from Norin
glyphs. Their measured width participates in word spacing and caret placement.

Forward/back slashes, colons, and semicolons have an extra 0.1 em of space on each side. Em dashes and
vertical bars have 0.1 em on the left and 0.3 em on the right,
included in measured word widths and editing positions.

For a visual comparison of common symbols in `this|test` at 18px and 26px:

```bash
NORIN_TEST_GLYPHS=/path/to/norin-font/glyphs node userscripts/tests/browser.cjs --symbols
```

This writes a standalone comparison HTML page, screenshot, and JSON spacing
measurements to the printed temporary directory. The larger samples are editable.
