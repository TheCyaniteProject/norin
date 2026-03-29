# Norin Reader

Simple Electron-based reader to help with practicing reading the Norin conscript. The app converts Latin/English input into Norin glyphs using a phonetic mapping and renders a side-by-side view for reading practice.

**Files:**

- **Reader UI:** [renderer.html](renderer.html)
- **Renderer logic:** [renderer.js](renderer.js)
- **Phonetic map & glyphs:** [mappings.json](mappings.json)

## Features

- Open text files and view a Norin glyph rendering alongside the Latin text.
- Toggle Norin/Latin view, adjust glyph size, and switch dark mode.
- Notepad with live conversion for quick practice.
- Export the rendered view to PDF.
- Recent files list and simple local preferences (font size, dark mode).

## Install

Requires Node.js and npm. This project uses Electron.

```bash
npm install
npm start
```

The `start` script launches the Electron app (see `package.json`).

## Usage

###### Please note that at the moment, the app will momentarily freeze when opening most documents (especially large ones). This can take several seconds or even 1-2 minutes depending on file size. This is due to the large amount of regex replacements and the generation of the SVG-based text, and will be optimized over time.

- Click "Open File" to select a text file (.txt, .md, etc.). The Latin text appears on the left and the converted Norin rendering on the right (when `Norin` is checked).
- Use the `Size` slider to change glyph/font size.
- `Export PDF` prints the current view to a PDF file.
- Switch to the `Notepad` tab to type live and see the converted Norin output.
- Toggle `Darkmode` to switch themes.

Hovering a Norin word shows its Latin value as a tooltip. The renderer applies punctuation spacing rules to keep punctuation visually correct with glyphs.

## mappings.json

The conversion rules and glyph lookups live in [mappings.json](mappings.json). It contains two main sections:

- `replacements`: ordered regex/string rules applied to input text (useful for phonetic rules, contractions, spelling transforms).
- glyph keys (e.g. `a`, `th`, `sh`): each key maps to an object with at least an `svg` path. Optionally a `mark` (accent SVG), `scale`, or padding/offset fields are supported.

Notes:

- The renderer attempts to fetch any `.svg` paths referenced in `mappings.json` and will replace file paths with the SVG text so glyphs render inline.
- The example `mappings.json` points to glyphs like `/home/kieee/dev/norin/glyphs/*.svg`. Update those paths if your glyph files live elsewhere (relative paths inside the project are fine).
- You can add or tune `replacements` to refine how English/Latin input maps phonetically to Norin.

## Customization

- To add a glyph: add a key to `mappings.json` and set `svg` to the path (or inline SVG string). If the character is an accent/mark, set `mark`.
- For multi-letter mappings (e.g. `th`, `sh`, `air`) include them as keys; the renderer prefers longer keys when tokenizing.

## Internals (quick)

- `main.js` creates the Electron window and exposes IPC handlers for opening files and exporting PDFs.
- `preload.js` exposes a minimal `readerAPI` to the renderer for file/open/export operations.
- `renderer.js` loads `mappings.json`, compiles replacement rules, fetches SVG glyphs, and renders glyphs into the DOM. It implements caching, sinogram block layout (three-glyph stacks), and hover tooltips.

## Troubleshooting

- If glyphs do not appear, ensure the `svg` paths in `mappings.json` are correct and readable from the app. Using relative paths inside the repo is recommended.
- If `mappings.json` fails to load, check the console output in the Electron app for errors.

## License

MIT
