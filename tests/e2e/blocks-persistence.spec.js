import { expect, test } from "@playwright/test";
import {
    createBlockLayout, getBlock, getClipBlocks, validateClipBlocks,
} from "../../src/lib/subtitle_blocks.js";
import {
    combineToSRT, createBlankSubtitleClip, createSubtitleFile, getCurrentText,
    getMedia, getSentenceJsonData, getVCJsonData, parseSrt, saveSrtFile, saveSubtitleFile,
    saveSubtitleTrack, syncJsonDataFromMedia,
} from "../../src/lib/data_process.js";
import { editClips, replayEditorEdit } from "../../src/lib/editor_history.js";

function memoryFs(initial = {}) {
    const files = new Map(Object.entries(initial));
    let opened = 0;
    const dir = {
        async getFileHandle(name, { create = false } = {}) {
            opened++;
            if (!files.has(name)) {
                if (!create) throw new DOMException("Missing", "NotFoundError");
                files.set(name, "");
            }
            return {
                async getFile() { return { name, text: async () => files.get(name) }; },
                async createWritable() {
                    let pending;
                    return {
                        async write(text) { pending = text; },
                        async close() { files.set(name, pending); },
                        async abort() {},
                    };
                },
            };
        },
    };
    return { dir, files, opened: () => opened };
}

function project(filePath, inlineData) {
    return {
        name: "blocks.vc_json", audioFilePath: "",
        scriptFiles: [{ filePath, ...(inlineData ? { inlineData } : {}) }],
    };
}

function jsonRow(extension = {}) {
    return { start: "00:00:00,000", end: "00:00:02,000", sentences: ["primary"], ...extension };
}

function extension() {
    return {
        layout: { x: 50, y: 100, maxWidth: 500, maxHeight: 100, defaultStyle: "main" },
        additionalBlocks: [
            { id: "extra-text", text: "  <voice>extra</>\nline\r\n  ", layout: { x: 600, textAlign: "right" } },
            { id: "extra-sentences", sentences: ["  first  ", "", "second\nline"], layout: { textRotate: "vertical-rl" } },
            { id: "both", text: "cached", sentences: ["authoritative"] },
            { id: "empty" },
        ],
    };
}

test("block helpers preserve identity and never materialize extensions", () => {
    const clip = createBlankSubtitleClip(2);
    expect(getClipBlocks(clip)).toEqual([{ id: null, body: clip }]);
    expect(getClipBlocks(clip)[0].body).toBe(clip);
    expect(getBlock(clip)).toBe(clip);
    expect(getBlock(clip, "missing")).toBeUndefined();
    expect(getClipBlocks(null)).toEqual([]);
    expect(getBlock(null)).toBeUndefined();
    expect(validateClipBlocks(clip)).toBeUndefined();
    expect(clip).not.toHaveProperty("layout");
    expect(clip).not.toHaveProperty("additionalBlocks");

    Object.assign(clip, extension());
    const blocks = getClipBlocks(clip);
    expect(blocks.map((block) => block.id)).toEqual([null, "extra-text", "extra-sentences", "both", "empty"]);
    expect(blocks[1].body).toBe(clip.additionalBlocks[0]);
    expect(getBlock(clip, "extra-sentences")).toBe(clip.additionalBlocks[1]);
    expect(getBlock(clip, 1)).toBeUndefined();
});

test("layout helper copies only layout fields, with explicit overrides", () => {
    const layout = {
        x: -10, y: 10, maxWidth: 300, maxHeight: 100, boxAlignX: 0, boxAlignY: 100,
        textAlign: "center", textRotate: "horizontal-tb", defaultStyle: "voice",
    };
    const track = { ...layout, filePath: "track.json", inlineData: [], id: 5, text: "ignore" };
    const copy = createBlockLayout(track, { x: 50, maxWidth: 0, additionalBlocks: [], text: "ignore" });
    expect(copy).toEqual({ ...layout, x: 50, maxWidth: 0 });
    copy.y = 30;
    expect(track.y).toBe(10);
    expect(createBlockLayout(undefined)).toEqual({});
    expect(() => createBlockLayout(track, { x: NaN })).toThrow(TypeError);
});

test("extension layout accepts supported keywords and inclusive alignment percentages", () => {
    for (const textAlign of ["left", "center", "right"]) {
        for (const textRotate of ["horizontal-tb", "vertical-rl"]) {
            for (const value of [0, 0.5, 50, 99.5, 100]) {
                const layout = { textAlign, textRotate, boxAlignX: value, boxAlignY: value };
                expect(() => validateClipBlocks({ layout, additionalBlocks: [{ id: "extra", layout }] })).not.toThrow();
                expect(createBlockLayout({}, layout)).toEqual(layout);
            }
        }
    }
    const defaultStyle = "custom style; still a lookup key";
    expect(createBlockLayout({}, { defaultStyle })).toEqual({ defaultStyle });
});

test("extension validation does not validate or materialize legacy track layout", () => {
    const legacyLayout = { textAlign: "start", textRotate: "vertical-lr", boxAlignX: -10, boxAlignY: 110 };
    const raw = project("", [createBlankSubtitleClip(2)]);
    Object.assign(raw.scriptFiles[0], legacyLayout);
    const loaded = getVCJsonData(JSON.stringify(raw));
    expect(loaded.scriptFiles[0]).toMatchObject(legacyLayout);
    expect(loaded.scriptFiles[0].inlineData[0]).not.toHaveProperty("layout");
    expect(loaded.scriptFiles[0].inlineData[0]).not.toHaveProperty("additionalBlocks");
});

test("JSON roundtrips independent extra bodies exactly without changing primary behavior", async () => {
    const extras = extension();
    const fs = memoryFs({ "track.json": JSON.stringify([jsonRow(extras)]) });
    for (let round = 0; round < 3; round++) {
        const media = await getMedia(project("track.json"), fs.dir);
        const track = media.srt_data[0];
        expect(track.loadStatus).toBe("loaded");
        const clip = track.data[0];
        expect(clip.text).toBe("primary");
        expect(clip.sentences).toEqual(["primary"]);
        expect(clip.additionalBlocks).toEqual(extras.additionalBlocks);
        expect(clip.layout).toEqual(extras.layout);
        expect(await saveSubtitleTrack(fs.dir, track)).toBe(true);
        expect(JSON.parse(fs.files.get("track.json"))).toEqual([jsonRow(extras)]);
    }
});

test("legacy JSON and SRT stay extension-free, including paragraph semantics", async () => {
    const rows = [jsonRow({ sentences: ["first\nline", "second"] })];
    const fs = memoryFs({ "track.json": JSON.stringify(rows) });
    const track = (await getMedia(project("track.json"), fs.dir)).srt_data[0];
    expect(track.data[0].text).toBe("first\nline\r\nsecond");
    expect(track.data[0]).not.toHaveProperty("additionalBlocks");
    expect(track.data[0]).not.toHaveProperty("layout");
    expect(await saveSubtitleTrack(fs.dir, track)).toBe(true);
    expect(JSON.parse(fs.files.get("track.json"))).toEqual(rows);
    const reloaded = parseSrt(combineToSRT(track.data));
    expect(reloaded[0].sentences).toEqual(rows[0].sentences);
    expect(reloaded[0]).not.toHaveProperty("additionalBlocks");
    expect(reloaded[0]).not.toHaveProperty("layout");
});

test("inline JSON extension validation and snapshots do not alias source data", async () => {
    const clip = { ...createBlankSubtitleClip(2), text: "primary", ...extension() };
    const raw = project("", [clip]);
    const parsed = getVCJsonData(JSON.stringify(raw));
    const media = await getMedia(parsed, memoryFs().dir);
    const loaded = media.srt_data[0].data[0];
    const synced = syncJsonDataFromMedia(parsed, media).scriptFiles[0].inlineData[0];
    expect(synced.additionalBlocks).toEqual(clip.additionalBlocks);
    expect(synced.layout).toEqual(clip.layout);
    loaded.layout.x = 999;
    loaded.additionalBlocks[1].sentences[0] = "edited";
    loaded.additionalBlocks[0].layout.x = 999;
    expect(parsed.scriptFiles[0].inlineData[0].layout.x).toBe(50);
    expect(synced.layout.x).toBe(50);
    expect(synced.additionalBlocks[1].sentences[0]).toBe("  first  ");
    expect(synced.additionalBlocks[0].layout.x).toBe(600);
    expect(() => getVCJsonData(JSON.stringify(project("", [{ ...clip, additionalBlocks: null }])))).toThrow();
});

test("text-only JSON primary bodies load with or without extensions", async () => {
    for (const extra of [{}, extension()]) {
        const row = { start: "00:00:00,000", end: "00:00:02,000", text: "primary\nline", ...extra };
        const source = JSON.stringify([row]);
        const fs = memoryFs({ "track.json": source });
        expect(getSentenceJsonData("track.json", source)).not.toBeNull();
        const track = (await getMedia(project("track.json"), fs.dir)).srt_data[0];
        expect(track.loadStatus).toBe("loaded");
        expect(track.data[0].text).toBe(row.text);
        expect(track.data[0]).not.toHaveProperty("sentences");
        expect(track.data[0].additionalBlocks).toEqual(extra.additionalBlocks);
        expect(await saveSubtitleTrack(fs.dir, track)).toBe(true);
        const reloaded = (await getMedia(project("track.json"), fs.dir)).srt_data[0].data[0];
        expect(reloaded.text).toBe(row.text);
        expect(reloaded.additionalBlocks).toEqual(extra.additionalBlocks);
    }
});

const invalidExtensions = [
    { layout: null }, { layout: [] }, { layout: { x: "10" } },
    { layout: { x: Infinity } }, { layout: { maxWidth: -1 } },
    { layout: { defaultStyle: {} } }, { layout: { startTime: 1 } },
    { layout: { additionalBlocks: [] } }, { additionalBlocks: null },
    { additionalBlocks: {} }, { additionalBlocks: [null] },
    { additionalBlocks: [{}] }, { additionalBlocks: [{ id: "" }] },
    { additionalBlocks: [{ id: "  " }] }, { additionalBlocks: [{ id: 1 }] },
    { additionalBlocks: [{ id: "bad\nID" }] },
    { additionalBlocks: [{ id: "same" }, { id: "same" }] },
    { additionalBlocks: [{ id: "extra", text: 1 }] },
    { additionalBlocks: [{ id: "extra", sentences: "text" }] },
    { additionalBlocks: [{ id: "extra", sentences: [null] }] },
    { additionalBlocks: [{ id: "extra", layout: { y: {} } }] },
    { additionalBlocks: [{ id: "extra", start: "00:00:00,000" }] },
    { additionalBlocks: [{ id: "extra", end: "00:00:01,000" }] },
    { additionalBlocks: [{ id: "extra", startTime: 0 }] },
    { additionalBlocks: [{ id: "extra", endTimeStr: "00:00:01,000" }] },
    { additionalBlocks: [{ id: "extra", additionalBlocks: [] }] },
    { additionalBlocks: [{ id: "extra", layout: { nested: { startTime: 0 } } }] },
];

const invalidLayouts = [
    ...["textAlign", "textRotate"].flatMap((key) => [
        "", "inherit", "var(--injected)", "left; position:fixed; inset:0",
        "horizontal-tb; display:none", "right !important", "center/*comment*/",
        "left\n; color:red", "\\6c eft", "url(https://example.invalid/style)",
    ].map((value) => ({ [key]: value }))),
    ...["boxAlignX", "boxAlignY"].flatMap((key) => [-0.001, 100.001, -1, 101, "50"].map((value) => ({ [key]: value }))),
];
for (const layout of invalidLayouts) {
    invalidExtensions.push({ layout }, { additionalBlocks: [{ id: "extra", layout }] });
}

test("layout copying rejects CSS expressions and invalid alignment percentages", () => {
    for (const layout of invalidLayouts) {
        expect(() => createBlockLayout(layout)).toThrow(TypeError);
        expect(() => createBlockLayout({}, layout)).toThrow(TypeError);
    }
});

test("invalid extensions fail validation, JSON loading, and saving without writes", async () => {
    for (const invalid of invalidExtensions) {
        expect(() => validateClipBlocks({ ...createBlankSubtitleClip(2), ...invalid })).toThrow(TypeError);
        const fs = memoryFs({ "track.json": JSON.stringify([jsonRow(invalid)]) });
        const track = (await getMedia(project("track.json"), fs.dir)).srt_data[0];
        expect(track.loadStatus).toBe("error");
        expect(track.data).toEqual([]);
        const before = fs.opened();
        expect(await saveSubtitleFile(fs.dir, "track.json", [{ ...createBlankSubtitleClip(2), ...invalid }])).toBe(false);
        expect(fs.opened()).toBe(before);
    }
});

test("validation rejects excessive complexity and sparse sentence/block arrays", () => {
    expect(() => validateClipBlocks({ additionalBlocks: Array.from({ length: 257 }, (_, i) => ({ id: String(i) })) })).toThrow();
    expect(() => validateClipBlocks({ additionalBlocks: [{ id: "x".repeat(257) }] })).toThrow();
    expect(() => validateClipBlocks({ additionalBlocks: [{ id: "extra", sentences: Array(10001).fill("") }] })).toThrow();
    expect(() => validateClipBlocks({ additionalBlocks: Array(1) })).toThrow();
    expect(() => validateClipBlocks({ additionalBlocks: [{ id: "extra", sentences: Array(1) }] })).toThrow();
});

test("all SRT persistence paths reject extensions before opening any file", async () => {
    for (const extra of [extension(), { layout: {} }, { additionalBlocks: [] }]) {
        const data = [{ ...createBlankSubtitleClip(2), ...extra }];
        const fs = memoryFs({ "existing.srt": "untouched" });
        expect(() => combineToSRT(data)).toThrow(/SRT cannot preserve/);
        expect(await saveSubtitleFile(fs.dir, "existing.srt", data)).toBe(false);
        expect(await saveSubtitleFile(fs.dir, "new.srt", data)).toBe(false);
        expect(await createSubtitleFile(fs.dir, "new.srt", data)).toBe(false);
        expect(await saveSrtFile(fs.dir, "existing.srt", data)).toBe(false);
        expect(fs.opened()).toBe(0);
        expect(Object.fromEntries(fs.files)).toEqual({ "existing.srt": "untouched" });
    }
});

test("extra text makes a blank primary visible without aggregation or mutation", () => {
    const clip = { ...createBlankSubtitleClip(2), text: "\u3000", additionalBlocks: [
        { id: "empty", text: "" }, { id: "visible", sentences: ["extra", "second"] }, { id: "last", text: "last" },
    ] };
    const before = JSON.stringify(clip);
    const current = getCurrentText([clip], 1);
    expect(current.text).toBe("extra\r\nsecond");
    expect(current.entry).toBe(clip);
    expect(current.index).toBe(0);
    expect(JSON.stringify(clip)).toBe(before);
    clip.text = "primary";
    expect(getCurrentText([clip], 1).text).toBe("primary");
    expect(getCurrentText([clip], 3)).toEqual({ text: "", entry: null, index: -1 });
});

test("whitespace normalization never merges away an extended clip or its timing", async () => {
    const clips = [0, 1, 2].map((startTime) => ({
        ...createBlankSubtitleClip(1), startTime, endTime: startTime + 1, text: "\u3000",
        ...(startTime === 1 ? { additionalBlocks: [{ id: "extra", text: "visible" }] } : {}),
    }));
    const media = await getMedia(project("", clips), memoryFs().dir);
    const data = media.srt_data[0].data;
    expect(data).toHaveLength(3);
    expect(data.map(({ startTime, endTime }) => [startTime, endTime])).toEqual([[0, 1], [1, 2], [2, 3]]);
    expect(getCurrentText(data, 1.5).text).toBe("visible");
});

test("history snapshots deep-copy extensions on capture and every replay", () => {
    const clip = { ...createBlankSubtitleClip(2), ...extension() };
    const ref = clip.ref = {};
    const data = [clip];
    const track = { data };
    const initial = JSON.parse(JSON.stringify(clip));
    editClips(track, [clip], () => {
        clip.layout.x = 70;
        clip.additionalBlocks[0].layout.x = 700;
        clip.additionalBlocks[1].sentences[0] = "changed";
        clip.additionalBlocks[0].text = "changed text";
    });
    const changed = JSON.parse(JSON.stringify(clip));
    expect(replayEditorEdit(track)).toBe(clip);
    expect(clip).toEqual(initial);
    clip.additionalBlocks[0].layout.x = 999;
    clip.additionalBlocks[1].sentences[0] = "contamination";
    expect(replayEditorEdit(track, true)).toBe(clip);
    expect(clip).toEqual(changed);
    clip.layout.x = 999;
    clip.additionalBlocks[0].text = "contamination";
    replayEditorEdit(track);
    expect(clip).toEqual(initial);
    replayEditorEdit(track, true);
    expect(clip).toEqual(changed);
    expect(track.data).toBe(data);
    expect(track.data[0]).toBe(clip);
    expect(clip.ref).toBe(ref);
});

test("undo split removes optional fields and redo restores them without altering legacy identities", () => {
    const clip = createBlankSubtitleClip(2);
    const track = { data: [clip] };
    const data = track.data;
    editClips(track, [clip], () => Object.assign(clip, extension()));
    replayEditorEdit(track);
    expect(clip).not.toHaveProperty("layout");
    expect(clip).not.toHaveProperty("additionalBlocks");
    replayEditorEdit(track, true);
    expect(clip.additionalBlocks).toEqual(extension().additionalBlocks);
    expect(track.data).toBe(data);
    editClips(track, [clip], () => { clip.additionalBlocks.splice(1, 1); });
    replayEditorEdit(track);
    expect(clip.additionalBlocks).toHaveLength(4);
    replayEditorEdit(track, true);
    expect(clip.additionalBlocks).toHaveLength(3);
});
