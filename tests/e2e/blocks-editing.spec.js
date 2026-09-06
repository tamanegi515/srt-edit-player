import { expect, test } from "@playwright/test";
import { appendClipBlocks, mergeSubtitleBlock, partitionClipBlocks, splitSubtitleBlock } from "../../src/lib/block_editing.js";
import { getClipBlocks } from "../../src/lib/subtitle_blocks.js";
import { editClips, forkEditorHistory, replayEditorEdit } from "../../src/lib/editor_history.js";

const layout = { x: 10, y: 20, maxWidth: 250, maxHeight: 200, boxAlignX: 0, boxAlignY: 0, textAlign: "left", textRotate: "horizontal-tb" };
const bodyText = (body) => body.sentences?.join("\n\n") ?? body.text;
const contents = (clip) => getClipBlocks(clip).map(({ body }) => bodyText(body));

test("multiple box splits insert in reading order and merging preserves paragraph boundaries", () => {
  const clip = { text: "AlphaBetaGamma", startTime: 0, endTime: 10 };
  const beta = splitSubtitleBlock(clip, null, "Alpha", "BetaGamma", layout);
  const gamma = splitSubtitleBlock(clip, beta, "Beta", "Gamma", layout);
  expect(contents(clip)).toEqual(["Alpha", "Beta", "Gamma"]);
  expect(clip.startTime).toBe(0);
  expect(clip.endTime).toBe(10);
  expect(clip.additionalBlocks[1].layout.x).toBe(74);
  expect(layout.x).toBe(10);
  mergeSubtitleBlock(clip, gamma);
  mergeSubtitleBlock(clip, beta);
  expect(clip.sentences).toEqual(["Alpha", "Beta", "Gamma"]);
  expect(clip).not.toHaveProperty("additionalBlocks");
});

test("temporal split moves following boxes without losing text or sharing mutable layouts", () => {
  const clip = { text: "First", layout: { ...layout }, additionalBlocks: [
    { id: "second", sentences: ["AlphaBeta"], layout: { ...layout, x: 300 } },
    { id: "third", text: "Last", layout: { ...layout, x: 600 } },
  ] };
  const next = { startTime: 5, endTime: 10 };
  partitionClipBlocks(clip, "second", "Alpha", "Beta", next);
  expect(contents(clip)).toEqual(["First", "Alpha"]);
  expect(contents(next)).toEqual(["Beta", "Last"]);
  expect(next.layout.x).toBe(300);
  next.layout.x = 500;
  expect(clip.additionalBlocks[0].layout.x).toBe(300);
  appendClipBlocks(clip, next, layout);
  expect(contents(clip)).toEqual(["First", "Alpha", "Beta", "Last"]);
  expect(new Set(clip.additionalBlocks.map((block) => block.id)).size).toBe(3);
});

test("ordinary temporal merging keeps existing sentences as paragraphs", () => {
  const clip = { sentences: ["First", "Second"], text: "First\r\nSecond" };
  appendClipBlocks(clip, { text: "Last" }, layout);
  expect(clip.sentences).toEqual(["First", "Second", "Last"]);
  expect(clip).not.toHaveProperty("layout");
  expect(clip).not.toHaveProperty("additionalBlocks");
});

test("a rejected box split leaves the original body and layout untouched", () => {
  const clip = { text: "AlphaBeta", additionalBlocks: Array.from({ length: 256 }, (_, i) => ({ id: `box-${i}`, text: "Other" })) };
  const before = JSON.stringify(clip);
  expect(() => splitSubtitleBlock(clip, null, "Alpha", "Beta", layout)).toThrow();
  expect(JSON.stringify(clip)).toBe(before);
});

test("temporal merging retains explicit singleton layouts as independent boxes", () => {
  const clip = { text: "First", layout: { ...layout } };
  appendClipBlocks(clip, { text: "Second", layout: { ...layout, x: 500 } }, layout);
  expect(contents(clip)).toEqual(["First", "Second"]);
  expect(clip.layout.x).toBe(10);
  expect(clip.additionalBlocks[0].layout.x).toBe(500);
});

test("forked history restores removed clips without mutating the original source", () => {
  const a = { text: "A" }, b = { text: "B" };
  const source = { data: [a, b] };
  editClips(source, [a], () => { a.text = "Edited"; });
  editClips(source, [a], () => { source.data.splice(1, 1); }, true);
  const target = { data: JSON.parse(JSON.stringify(source.data)) };
  forkEditorHistory(source.data, target.data);
  replayEditorEdit(target);
  expect(target.data.map((clip) => clip.text)).toEqual(["Edited", "B"]);
  replayEditorEdit(target);
  expect(target.data.map((clip) => clip.text)).toEqual(["A", "B"]);
  expect(source.data.map((clip) => clip.text)).toEqual(["Edited"]);
  replayEditorEdit(target, true);
  replayEditorEdit(target, true);
  expect(target.data.map((clip) => clip.text)).toEqual(["Edited"]);
});
