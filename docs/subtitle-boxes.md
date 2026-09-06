# Subtitle Boxes

## Editing

Put the caret at the boundary and use the split-box button beside the clip time, or the editor context menu's separate-box command. Each box gets its own rich-text editor. Blank lines still separate sentences within that box.

All boxes share the parent clip's start/end times and occupy one timeline clip. Move or resize each box on the preview. The position ribbon targets the selected box, including rotation and alignment inside its frame. Inline style tags can continue across boxes in reading order, as they do across sentences. Shared style keys retain their existing shared behavior.

An extra box can be merged into the preceding box without deleting its text. Splitting, merging, text edits and box layout gestures support the track's shared Undo/Redo history. The existing temporal clip split/merge commands remain separate operations.

## Additive Data

Existing `text` and `sentences` remain the primary body. No migration or new required field is introduced. Only clips that need extra boxes gain `additionalBlocks`; each entry owns its own text, not a duplicated aggregate. The primary clip and each extra block can have an optional `layout` override. Missing layout fields use the track defaults.

```json
[
  {
    "start": "00:00:10,000",
    "end": "00:00:20,000",
    "sentences": ["The first part of the dialogue."],
    "layout": { "x": 900, "y": 100, "maxWidth": 400, "maxHeight": 600 },
    "additionalBlocks": [
      {
        "id": "second-box",
        "sentences": ["The rest of the dialogue."],
        "layout": { "x": 100, "y": 100, "maxWidth": 400, "maxHeight": 600 }
      }
    ]
  }
]
```

Layout fields are `x`, `y`, `maxWidth`, `maxHeight`, `boxAlignX`, `boxAlignY`, `textAlign`, `textRotate`, and `defaultStyle`. Block IDs are stable and unique within a clip. Box entries do not contain separate times or nested boxes.

Ordinary files remain extension-free when loaded and saved without using this feature. The project still references an external subtitle source and does not embed the added text.

## SRT Sources

The first box split on an SRT track creates a sibling `name.boxes.json` (or a numbered unused name). It preserves the original SRT bytes and saves the new reference in the current `.vc_json`. Other references to the original SRT keep their original source. Existing files are never overwritten by this conversion.

The new JSON and project reference are saved before the in-memory source changes. A failure keeps the original source and attempts to remove only the file created by that operation. File System Access provides no cross-file transaction against browser crashes or external writers; recovery may require removing an orphan JSON file after such an interruption.

Subsequent edits use normal subtitle saving. Box extensions are rejected by direct SRT export rather than silently discarding text or geometry.
