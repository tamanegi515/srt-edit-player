# SRT Edit Player

Local subtitle editor and media viewer built with Svelte and Vite.
Use Chromium on localhost with File System Access API permissions for the selected folder.
Media and subtitle files are processed locally. Font stylesheets may use external font services.

## Development

```sh
npm ci
npm run dev -- --host 127.0.0.1
```

Use the URL printed by Vite. Keep the development server bound to localhost.

## Files and Saving

- `.vc_json` is the project source of truth. `scriptFiles[].filePath` identifies subtitle files; styles and default box geometry are project settings, not embedded subtitle contents. Optional clip-specific box geometry lives in the subtitle JSON.
- When no project exists, folder discovery prefers sentence JSON over SRT and creates a `.vc_json`. Missing audio or images do not prevent subtitle editing.
- Normal subtitle saving writes to the referenced path. New JSON tracks are created in the project folder; new SRT tracks use `srt/<name>.srt`. Creation refuses an existing file, including files not referenced by the project.
- The project save button saves settings. The subtitle save button saves subtitle content/times and image-track timing files. A failed or unreadable source is not overwritten as an empty track; partial failures are reported.
- Whitespace-only editor lines separate sentences. SRT writes a full-width-space separator line; JSON writes separate `sentences` elements. Ordinary line breaks stay inside a sentence. Inline style tags and editor context-menu operations are supported.
- Unsaved edits are retained in memory across media switches. Changing folders or closing the page warns before discarding changes. This is not persistent crash recovery: save explicitly before restarting the browser.
- Undo/Redo history is shared by views of the same runtime track and kept separate from other tracks.
- A clip can display multiple independent boxes with separate editor fields and one shared time range. Use the split-box button beside its time or the editor context menu; extra boxes can be merged into the previous box. Normal paragraph breaks do not create boxes. See [Subtitle Boxes](docs/subtitle-boxes.md).

## Validation

```sh
npx playwright install chromium
npm run build
npm run test:e2e
```

Playwright starts a localhost Vite server on port 4173. Automated fixtures cover persistence round trips, failed loads, file collisions, unsaved drafts, editor history, media controls and viewport geometry. They do not require private sample folders.

The build currently emits accessibility warnings for some existing mouse-operated editing controls. A passing build is not an accessibility audit, and synthetic IME events do not replace native Windows IME testing.
