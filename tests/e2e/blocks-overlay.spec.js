import { expect, test } from "@playwright/test";
import { installFolder } from "../helpers/browser-fs.js";
import { formatClipBlocks } from "../../src/lib/subtitle_block_render.js";

test("ordinary LF lines stay inline; only CRLF paragraph boundaries add sentence gaps", () => {
    const text = Array.from({ length: 10 }, (_, index) => `Line ${index + 1}`).join("\n");
    const clip = { text, additionalBlocks: [{ id: "extra", text }] };
    const before = JSON.stringify(clip);
    for (const block of formatClipBlocks(clip, "normal", { normal: {} })) {
        expect(block.sentences).toEqual([{ gap: false, parts: [{ tag: "normal", text }] }]);
    }
    expect(JSON.stringify(clip)).toBe(before);
    expect(formatClipBlocks({ text: "First\nline\r\nSecond\nline" }, "normal", { normal: {} })[0].sentences)
        .toEqual([
            { gap: false, parts: [{ tag: "normal", text: "First\nline" }] },
            { gap: true, parts: [{ tag: "normal", text: "Second\nline" }] },
        ]);
});

async function openBoxes(page, omitLayouts = false) {
    const layout = { x: 20, y: 20, maxWidth: 200, maxHeight: 140, boxAlignX: 0, boxAlignY: 0, textAlign: "left", textRotate: "horizontal-tb", defaultStyle: "normal" };
    await installFolder(page, {
        "boxes.vc_json": JSON.stringify({ name: "boxes.vc_json", scriptFiles: [{ ...layout, filePath: "boxes.json", name: "Boxes" }] }),
        "boxes.json": JSON.stringify([
            { start: "00:00:00,000", end: "00:00:10,000", sentences: ["<voice>Alpha", "Beta"], ...(omitLayouts ? {} : { layout }),
                additionalBlocks: [{ id: "extra", sentences: ["Gamma</>Delta", "Epsilon"], ...(omitLayouts ? {} : { layout: { ...layout, x: 260 } }) }] },
            { start: "00:00:10,000", end: "00:00:20,000", sentences: ["Next"] },
        ]),
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/srt-edit-player/");
    await page.getByRole("button", { name: "フォルダを開く", exact: true }).click();
    await expect(page.locator(".srt_box")).toHaveCount(2);
    await page.evaluate(async () => {
        const resource = (name) => performance.getEntriesByType("resource").find(entry => entry.name.includes(`/src/lib/${name}`)).name;
        window.boxStore = await import(resource("store.svelte.js"));
        window.boxHistory = await import(resource("editor_history.js"));
        const json = window.boxStore.getActiveJsonData();
        json.styles.normal = { ...Object.values(json.styles)[0], fontSize: 20 };
        json.styles.voice = { ...json.styles.normal, textColor: "#ff4455" };
        window.boxStore.mediaState.imageBaseScale = { w: 1, h: 1 };
    });
}

const box = (page, id = "primary") => page.locator(`.srt_box[data-block-id="${id}"]`);
const state = (page) => page.evaluate(() => ({
    clip: JSON.parse(JSON.stringify(window.boxStore.mediaState.media.srt_data[0].data[0])),
    track: JSON.parse(JSON.stringify(window.boxStore.getActiveJsonData().scriptFiles[0])),
    styles: JSON.parse(JSON.stringify(window.boxStore.getActiveJsonData().styles)),
}));
const undo = (page) => page.evaluate(() => window.boxHistory.replayEditorEdit(window.boxStore.mediaState.media.srt_data[0]));

test("omitted layouts stay absent until an extra is moved or resized, and undo removes the override", async ({ page }) => {
    await openBoxes(page, true);
    const before = await state(page);
    expect(before.clip).not.toHaveProperty("layout");
    expect(before.clip.additionalBlocks[0]).not.toHaveProperty("layout");
    await box(page, "extra").dispatchEvent("mousedown", { button: 0, clientX: 30, clientY: 30 });
    await page.locator("body").dispatchEvent("mousemove", { clientX: 30, clientY: 30 });
    await page.locator("body").dispatchEvent("mouseup");
    expect(await state(page)).toEqual(before);
    expect(await undo(page)).toBeNull();
    for (const resize of [false, true]) {
        const handle = resize ? box(page, "extra").locator(".resize-handle.right") : box(page, "extra");
        await handle.dispatchEvent("mousedown", { button: 0, clientX: 30, clientY: 30 });
        for (const offset of [10, 20, 40]) {
            await page.locator("body").dispatchEvent("mousemove", { clientX: 30 + offset, clientY: 30 });
        }
        await page.locator("body").dispatchEvent("mouseup");
        const after = await state(page);
        expect(after.track).toEqual(before.track);
        expect(after.clip).not.toHaveProperty("layout");
        expect(after.clip.sentences).toEqual(before.clip.sentences);
        expect(after.clip.additionalBlocks[0].layout[resize ? "maxWidth" : "x"]).toBe(resize ? 240 : 60);
        expect(after.clip.additionalBlocks[0].layout).not.toHaveProperty("filePath");
        await undo(page);
        expect(await state(page)).toEqual(before);
        expect(await undo(page)).toBeNull();
    }
});

test("ribbon materializes only the selected omitted layout and preserves its canonical gesture target", async ({ page }) => {
    await openBoxes(page, true);
    const before = await state(page);
    const slider = page.locator(".ribbon-area").first().locator('input[type="range"]').first();
    for (const id of ["extra", null]) {
        await page.evaluate((id) => window.boxStore.selectEditorClip(0, 0, id), id);
        await slider.dispatchEvent("pointerdown");
        await page.locator("body").dispatchEvent("pointerup");
        expect(await state(page)).toEqual(before);
        await page.locator(".ribbon-area").first().locator("select").selectOption("center");
        let after = await state(page);
        expect(after.track).toEqual(before.track);
        expect((id === null ? after.clip : after.clip.additionalBlocks[0]).layout.textAlign).toBe("center");
        expect(id === null ? after.clip.additionalBlocks[0] : after.clip).not.toHaveProperty("layout");
        await undo(page);
        expect(await state(page)).toEqual(before);
        await slider.dispatchEvent("pointerdown");
        for (const value of [10, 20, 30]) await slider.evaluate((el, value) => {
            el.value = value;
            el.dispatchEvent(new Event("input", { bubbles: true }));
        }, value);
        await page.locator("body").dispatchEvent("pointerup");
        after = await state(page);
        expect(after.track).toEqual(before.track);
        expect((id === null ? after.clip : after.clip.additionalBlocks[0]).layout.boxAlignX).toBe(30);
        expect(id === null ? after.clip.additionalBlocks[0] : after.clip).not.toHaveProperty("layout");
        await undo(page);
        expect(await state(page)).toEqual(before);
        expect(await undo(page)).toBeNull();
    }
    await page.evaluate(() => {
        window.boxStore.getActiveJsonData().seekTime = 15;
        window.boxStore.selectEditorClip(0, 1);
    });
    await page.locator(".ribbon-area").first().locator("select").selectOption("right");
    expect((await state(page)).track.textAlign).toBe("right");
    expect(await page.evaluate(() => Object.hasOwn(window.boxStore.mediaState.media.srt_data[0].data[1], "layout"))).toBe(false);
});

test("a partial box layout inherits the track default style without inserting fields", async ({ page }) => {
    await openBoxes(page);
    const selected = await page.evaluate(() => {
        const store = window.boxStore;
        const clip = store.mediaState.media.srt_data[0].data[0];
        clip.additionalBlocks[0].layout = { x: 260 };
        store.selectEditorClip(0, 0, "extra");
        store.selectionState.styleKey = null;
        return { style: store.activeStyleKey(), layout: { ...clip.additionalBlocks[0].layout } };
    });
    expect(selected).toEqual({ style: "normal", layout: { x: 260 } });
});

test("boxes render simultaneous, carry inline tags, and do not materialize layouts on view", async ({ page }, testInfo) => {
    await openBoxes(page);
    await expect(box(page, "extra").locator('.srt_text[data-tag="voice"]')).toHaveAttribute("data-text", "Gamma");
    await expect(box(page, "extra").locator(".srt_sentence").first()).not.toHaveClass(/sentence_gap/);
    await expect(box(page, "extra").locator(".srt_sentence").nth(1)).toHaveClass(/sentence_gap/);
    await expect(box(page, "extra").locator('.srt_text[data-tag="normal"]').first()).toHaveAttribute("data-text", "Delta");
    await page.screenshot({ path: testInfo.outputPath("multi-box.png") });
    await page.evaluate(() => { window.boxStore.getActiveJsonData().seekTime = 15; });
    await expect(page.locator(".srt_box")).toHaveCount(1);
    expect(await page.evaluate(() => Object.hasOwn(window.boxStore.mediaState.media.srt_data[0].data[1], "layout"))).toBe(false);
});

test("move and resize affect only the selected extra and record one undo per gesture", async ({ page }) => {
    await openBoxes(page);
    const before = await state(page);
    await box(page, "extra").dispatchEvent("mousedown", { button: 0, clientX: 280, clientY: 100 });
    for (let i = 1; i <= 8; i++) await page.locator("body").dispatchEvent("mousemove", { clientX: 280 + i * 5, clientY: 100 + i * 2 });
    await page.locator("body").dispatchEvent("mouseup");
    const moved = await state(page);
    expect(moved.clip.layout).toEqual(before.clip.layout);
    expect(moved.track).toEqual(before.track);
    expect(moved.clip.additionalBlocks[0].layout.x).toBe(300);
    expect(moved.clip.additionalBlocks[0].layout.y).toBe(36);
    await undo(page);
    expect((await state(page)).clip).toEqual(before.clip);
    expect(await undo(page)).toBeNull();
    await box(page, "extra").locator(".resize-handle.right").dispatchEvent("mousedown", { button: 0, clientX: 460, clientY: 100 });
    await page.locator("body").dispatchEvent("mousemove", { clientX: 510, clientY: 100 });
    await page.locator("body").dispatchEvent("mouseup");
    expect((await state(page)).clip.additionalBlocks[0].layout.maxWidth).toBe(250);
    await undo(page);
    expect((await state(page)).clip).toEqual(before.clip);
});

test("ribbon edits canonical box after editor focus and outline clear without changing shared styles", async ({ page }) => {
    await openBoxes(page);
    const before = await state(page);
    await page.evaluate(() => {
        window.boxStore.selectEditorClip(0, 0, "extra");
        window.boxStore.selectOverlayTrack(0, null, 0, "extra");
        window.boxStore.clearOverlaySelection();
    });
    await expect(page.locator(".box_selected")).toHaveCount(0);
    await page.locator(".ribbon-area").first().locator("select").selectOption("center");
    expect((await state(page)).clip.additionalBlocks[0].layout.textAlign).toBe("center");
    await undo(page);
    await page.locator('label[for="tile2"]').click();
    expect((await state(page)).clip.additionalBlocks[0].layout.textRotate).toBe("vertical-rl");
    expect((await state(page)).clip.layout.textRotate).toBe("horizontal-tb");
    await undo(page);
    const slider = page.locator(".ribbon-area").first().locator('input[type="range"]').first();
    await slider.dispatchEvent("pointerdown");
    for (const value of [10, 20, 30]) await slider.evaluate((el, value) => {
        el.value = value;
        el.dispatchEvent(new Event("input", { bubbles: true }));
    }, value);
    await page.locator("body").dispatchEvent("pointerup");
    expect((await state(page)).clip.additionalBlocks[0].layout.boxAlignX).toBe(30);
    await undo(page);
    expect(await state(page)).toEqual(before);
    expect(await undo(page)).toBeNull();
});

test("box clicks stop at the overlay and inner alignment moves independently", async ({ page }) => {
    await openBoxes(page);
    const before = await state(page);
    await page.evaluate(() => {
        window.playCalls = 0;
        const audio = new Audio();
        audio.play = () => { window.playCalls++; return Promise.resolve(); };
        window.boxStore.useAudio.set(audio);
    });
    await box(page, "extra").locator(".srt_text").first().click();
    expect(await page.evaluate(() => window.playCalls)).toBe(0);
    await expect(box(page, "extra")).toHaveClass(/box_selected/);
    await expect(box(page)).not.toHaveClass(/box_selected/);
    await box(page, "extra").locator(".srt_inbox").dispatchEvent("mousedown", { button: 0, clientX: 270, clientY: 30 });
    await page.locator("body").dispatchEvent("mousemove", { clientX: 300, clientY: 60 });
    await page.locator("body").dispatchEvent("mouseup");
    const after = await state(page);
    expect(after.clip.additionalBlocks[0].layout.boxAlignX).toBeGreaterThan(0);
    expect(after.clip.additionalBlocks[0].layout.boxAlignY).toBeGreaterThan(0);
    expect(after.clip.layout).toEqual(before.clip.layout);
    expect(after.track).toEqual(before.track);
    await undo(page);
    expect((await state(page)).clip).toEqual(before.clip);
});

test("time changes end old drag and stale structural indexes cannot target another clip", async ({ page }) => {
    await openBoxes(page);
    const before = await state(page);
    await box(page, "extra").dispatchEvent("mousedown", { button: 0, clientX: 280, clientY: 100 });
    await page.evaluate(() => { window.boxStore.getActiveJsonData().seekTime = 15; });
    await expect(page.locator(".srt_box")).toHaveCount(1);
    await page.locator("body").dispatchEvent("mousemove", { clientX: 380, clientY: 200 });
    await page.locator("body").dispatchEvent("mouseup");
    expect(await state(page)).toEqual(before);
    expect(await page.evaluate(() => window.boxStore.selectionState.overlayBlockId)).toBeNull();
    expect(await page.evaluate(() => {
        const store = window.boxStore;
        store.selectEditorClip(0, 0, "extra");
        store.mediaState.media.srt_data[0].data.reverse();
        return store.activeBlockLayout() === store.getActiveJsonData().scriptFiles[0];
    })).toBe(true);
});
