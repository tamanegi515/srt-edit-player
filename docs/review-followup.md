# Review Follow-up

Review baseline: `865c80ed48e1a60a95bad5e33f2fd6994f1111ab`.

## Implemented

| Review | Resolution |
| --- | --- |
| B01 | Normal SRT/JSON saving preserves the referenced relative path; new SRT tracks still default to `srt/`. |
| B02 | Create-only writes check existing files and serialize concurrent creation in this app. |
| B03 | Session drafts and saved baselines are centralized by project and physical subtitle path. Shared references use one source array. Folder changes and page closing protect dirty edits. |
| B04 | Folder candidates load before committing state; cancel, denied permissions and failed loads retain the current project. Failed media switches restore the loaded selection. |
| B05 | Sliders pass their current DOM value through a single input contract for mouse, keyboard and wheel. |
| B06 | Source-scoped model history captures pre-input state, structural edits and timing changes. Views share history without relying on component indices. |
| B07 | Font wheel changes select valid font options instead of doing arithmetic on font names. |
| B08 | Time formatting rounds total milliseconds before decomposing hours/minutes/seconds. |
| B09 | Tracks carry load status; unreadable/invalid sources cannot be saved as empty files. Partial save results are reported. |
| B10 | Subtitle saving includes image timing tracks at their referenced SRT paths. |
| B11 | Audio-less boundary edits use canonical project seek time. |
| R01 | Image requests use a latest-request token across automatic/manual changes. |
| R02 | Editor auto-scroll follows clip changes rather than repeatedly issuing smooth-scroll requests each frame. |
| R03 | Ruler generation advances by tick intervals and observes viewport resizing. |
| U01/U02/U03/U05 | Shared surface/control tokens, margin-free controls, single outer splitter, aligned editor edges, common sliders and preserved ribbon height. |

Integration review additionally covered shared-file overwrite risks, immutable save payloads and dirty baselines, failed initial-file creation cleanup/retry, and stale embedded subtitles overriding saved reference files.

## Scope Kept

- No controls, editor context-menu operations, inline style tags, overlay movement/resize/style editing, tracks or information were removed.
- The timeline remains full-width. The ribbon does not gain height or fold controls into hidden menus.
- Help-modal and save-workflow redesign proposals (U04/U06) were not applied because they change the existing information/operation flow.
- Existing last-clip extension, overlap normalization and paragraph serialization semantics remain unchanged.

## Verification Boundaries

On 2026-09-05 the integrated Chromium suite passed 91 tests and the Vite production build passed. Layout viewports covered 1664x1000, 1426x1209, 1366x768, 1000x700 and 800x700; the ribbon remains below its 155px ceiling. Color-picker edge checks additionally cover 768x900 and 390x844.

The material follow-up uses borderless, background-matched relief for the ribbon, editor and playback panels. Small controls use flat shared tokens, including color-picker triggers and bold/italic toggles. Input boundaries and focus indicators remain visible. Color-picker mouse/keyboard opening, color changes and closing have browser regression coverage.

The local sample OPFS run loaded a 1050x840 image, 7602-second native audio and 381 normalized subtitle clips. Playback, seeking, subtitle save/re-read and project save/reopen passed. All five original source-file hashes were unchanged. Detailed local artifacts are under `output/playwright/` and are excluded from Git.

- Chromium regression tests cover real DOM interactions, playable generated WAV audio, persisted in-memory filesystem round trips and multiple viewport sizes.
- `scripts/verify-local-sample.mjs` verifies a browser OPFS copy of an explicitly supplied local sample. Original source hashes are compared before/after; native directory-picker UI is not automated.
- Native Windows IME, browser crash recovery and simultaneous writes by unrelated external processes are not guaranteed by these tests. File System Access does not offer atomic exclusive creation against external writers.
- Existing accessibility warnings remain; this change is not a complete accessibility audit. Web-font and icon-font availability still depends on their configured font sources.
