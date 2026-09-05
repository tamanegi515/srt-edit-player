import { expect, test } from "@playwright/test";

async function openFixture(page, count = 3) {
    await page.addInitScript((count) => {
        const time = (seconds) => `00:${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")},000`;
        const clips = (prefix) => Array.from({ length: count }, (_, i) => ({
            start: time(i * 10), end: time((i + 1) * 10), sentences: [`${prefix}${i}`],
        }));
        const files = {
            "fixture.vc_json": JSON.stringify({
                name: "fixture.vc_json", audioFilePath: "", imageFilePath: "",
                scriptFiles: [{ filePath: "a.json", name: "A" }, { filePath: "b.json", name: "B" }],
            }),
            "a.json": JSON.stringify(clips("Alpha")),
            "b.json": JSON.stringify(clips("Beta")),
        };
        const entry = (name) => ({
            kind: "file", name,
            getFile: async () => new File([files[name]], name),
            createWritable: async () => ({ write: async (text) => { files[name] = String(text); }, close: async () => {} }),
        });
        window.showDirectoryPicker = async () => ({
            name: "editor-review-fixture",
            requestPermission: async () => "granted",
            async *values() { for (const name of Object.keys(files)) yield entry(name); },
            async getFileHandle(name, options = {}) {
                if (!(name in files) && !options.create) throw new DOMException("Missing file", "NotFoundError");
                return entry(name);
            },
        });
    }, count);
    await page.goto("/");
    await page.locator("button").first().click();
    await expect(page.locator(".editor")).toHaveCount(count);
    await expect(page.locator(".editor").first()).toHaveText("Alpha0");
    await page.evaluate(async () => {
        const resource = performance.getEntriesByType("resource").find((entry) => entry.name.includes("/src/lib/store.svelte.js"));
        window.editorStore = await import(resource.name);
    });
}

const column = (page, index = 0) => page.locator(".srt-editor").nth(index);
const editor = (page, index = 0, col = 0) => column(page, col).locator(".editor").nth(index);

async function append(page, locator, text) {
    await locator.focus();
    await page.keyboard.press("Control+End");
    await page.keyboard.insertText(text);
}

async function selectRange(locator, start, end = start) {
    await locator.evaluate((element, [start, end]) => {
        element.focus();
        const range = document.createRange();
        range.setStart(element.firstChild, start);
        range.setEnd(element.firstChild, end);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
    }, [start, end]);
}

async function menu(locator) {
    await locator.dispatchEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 700, clientY: 240 });
}

test("first input commits immediately and undo/redo captures preinput, including Shift+Z", async ({ page }) => {
    await openFixture(page);
    await append(page, editor(page), "X");
    expect(await page.evaluate(() => window.editorStore.mediaState.media.srt_data[0].data[0].text)).toBe("Alpha0X");
    await page.keyboard.press("Control+z");
    await expect(editor(page)).toHaveText("Alpha0");
    await page.keyboard.press("Control+Shift+z");
    await expect(editor(page)).toHaveText("Alpha0X");
    await page.keyboard.insertText("Y");
    await page.keyboard.press("Control+z");
    await expect(editor(page)).toHaveText("Alpha0X");
    await page.keyboard.press("Control+z");
    await expect(editor(page)).toHaveText("Alpha0");
    await page.keyboard.press("Control+y");
    await expect(editor(page)).toHaveText("Alpha0X");
    await page.keyboard.insertText("Z");
    await page.keyboard.press("Control+y");
    await expect(editor(page)).toHaveText("Alpha0XZ");
});

test("columns share one track history, track switching and reused IDs never leak history", async ({ page }) => {
    await openFixture(page);
    await page.getByTitle("列を増やす").click();
    await append(page, editor(page), "X");
    await expect(editor(page, 0, 1)).toHaveText("Alpha0X");
    await append(page, editor(page, 0, 1), "Y");
    await editor(page).press("Control+z");
    await expect(editor(page, 0, 1)).toHaveText("Alpha0X");
    await editor(page, 0, 1).press("Control+z");
    await expect(editor(page)).toHaveText("Alpha0");
    await column(page).locator("select").selectOption("1");
    await editor(page).press("Control+z");
    await expect(editor(page)).toHaveText("Beta0");
    await append(page, editor(page), "B");
    await column(page).locator("select").selectOption("0");
    await editor(page).press("Control+y");
    await expect(editor(page)).toHaveText("Alpha0X");
    await page.evaluate(() => {
        const { mediaState } = window.editorStore;
        window.savedEditorTrack = mediaState.media.srt_data[0];
        const replacement = JSON.parse(JSON.stringify(window.savedEditorTrack));
        replacement.data[0].text = "Replacement";
        mediaState.media.srt_data[0] = replacement;
    });
    await expect(editor(page)).toHaveText("Replacement");
    await editor(page).press("Control+z");
    await expect(editor(page)).toHaveText("Replacement");
    await page.evaluate(() => { window.editorStore.mediaState.media.srt_data[0] = window.savedEditorTrack; });
    await editor(page).press("Control+z");
    await expect(editor(page)).toHaveText("Alpha0");
});

test("Enter and Shift+Enter keep one trailing newline each, the caret and shared undo", async ({ page }) => {
    await openFixture(page);
    await page.getByTitle("列を増やす").click();
    await editor(page).focus();
    await page.keyboard.press("Control+End");
    await page.keyboard.press("Enter");
    expect(await page.evaluate(() => window.editorStore.mediaState.media.srt_data[0].data[0].text)).toBe("Alpha0\n");
    await page.keyboard.press("Shift+Enter");
    expect(await page.evaluate(() => window.editorStore.mediaState.media.srt_data[0].data[0].text)).toBe("Alpha0\n\n");
    await page.keyboard.insertText("next");
    await expect(editor(page)).toHaveText("Alpha0\n\nnext", { useInnerText: true });
    await expect(editor(page, 0, 1)).toHaveText("Alpha0\n\nnext", { useInnerText: true });
    await page.keyboard.press("Control+z");
    expect(await page.evaluate(() => window.editorStore.mediaState.media.srt_data[0].data[0].text)).toBe("Alpha0\n\n");
    await page.keyboard.press("Control+z");
    expect(await page.evaluate(() => window.editorStore.mediaState.media.srt_data[0].data[0].text)).toBe("Alpha0\n");
    await page.keyboard.press("Control+z");
    await expect(editor(page)).toHaveText("Alpha0");
    await page.keyboard.press("Control+y");
    await page.keyboard.insertText("tail");
    await expect(editor(page)).toHaveText("Alpha0\ntail", { useInnerText: true });
});

test("physical source aliases share history and keep the source array through split/merge replay", async ({ page }) => {
    await openFixture(page);
    await page.getByTitle("列を増やす").click();
    await page.evaluate(() => {
        const tracks = window.editorStore.mediaState.media.srt_data;
        window.sharedSource = tracks[0].data;
        tracks[1].data = window.sharedSource;
    });
    await column(page, 1).locator("select").selectOption("1");
    await append(page, editor(page), "X");
    await expect(editor(page, 0, 1)).toHaveText("Alpha0X");
    await editor(page, 0, 1).press("Control+z");
    await expect(editor(page)).toHaveText("Alpha0");
    await editor(page).press("Control+y");
    await selectRange(editor(page, 0, 1), 3);
    await menu(editor(page, 0, 1));
    await page.getByText("カーソル位置で分割", { exact: true }).click();
    await expect(column(page).locator(".editor")).toHaveCount(4);
    await editor(page).press("Control+z");
    await expect(column(page, 1).locator(".editor")).toHaveCount(3);
    await editor(page, 0, 1).press("Control+y");
    await menu(editor(page));
    await page.getByText("下と結合する", { exact: true }).click();
    await expect(column(page, 1).locator(".editor")).toHaveCount(3);
    await editor(page, 0, 1).press("Control+z");
    await expect(column(page).locator(".editor")).toHaveCount(4);
    await editor(page).press("Control+y");
    expect(await page.evaluate(() => window.editorStore.mediaState.media.srt_data.every((track) => track.data === window.sharedSource))).toBe(true);
    await expect(editor(page, 0, 1)).toHaveText("Alp\n\nha0X", { useInnerText: true });
});

test("menu split/merge undo restores original clip identities and edits after reindexing", async ({ page }) => {
    await openFixture(page);
    await page.getByTitle("列を増やす").click();
    await append(page, editor(page, 1), "X");
    await page.evaluate(() => { window.originalClips = [...window.editorStore.mediaState.media.srt_data[0].data]; });
    await selectRange(editor(page), 3);
    await menu(editor(page));
    await page.getByText("カーソル位置で分割", { exact: true }).click();
    await expect(column(page).locator(".editor")).toHaveCount(4);
    await expect(editor(page)).toHaveText("Alp");
    await expect(editor(page, 1)).toHaveText("ha0");
    await expect(editor(page, 2)).toHaveText("Alpha1X");
    await editor(page, 2, 1).press("Control+z");
    await expect(column(page).locator(".editor")).toHaveCount(3);
    await expect(editor(page)).toHaveText("Alpha0");
    expect(await page.evaluate(() => window.originalClips.every((clip, i) => clip === window.editorStore.mediaState.media.srt_data[0].data[i]))).toBe(true);
    await editor(page, 1).press("Control+z");
    await expect(editor(page, 1)).toHaveText("Alpha1");
    await editor(page, 1).press("Control+y");
    await editor(page, 1).press("Control+y");
    await expect(column(page).locator(".editor")).toHaveCount(4);
    await menu(editor(page));
    await page.getByText("下と結合する", { exact: true }).click();
    await expect(column(page).locator(".editor")).toHaveCount(3);
    await editor(page, 0, 1).press("Control+z");
    await expect(column(page).locator(".editor")).toHaveCount(4);
    await expect(editor(page)).toHaveText("Alp");
    await editor(page).press("Control+y");
    await expect(column(page).locator(".editor")).toHaveCount(3);
    await expect(editor(page)).toHaveText("Alp\n\nha0", { useInnerText: true });
});

test("tag coloring, tag removal, menu undo and line breaks survive model history", async ({ page }) => {
    await openFixture(page);
    await selectRange(editor(page), 0, 5);
    await menu(editor(page));
    await page.getByText("タグを付ける").hover();
    await page.locator(".submenu-panel .menu-item").first().click();
    const tag = editor(page).locator("span[data-tag]");
    await expect(tag).toHaveCSS("color", "rgb(17, 168, 160)");
    await editor(page).press("Control+z");
    await expect(tag).toHaveCount(0);
    await editor(page).press("Control+y");
    await expect(tag).toHaveCSS("color", "rgb(17, 168, 160)");
    await menu(tag);
    await page.getByText("タグを外す", { exact: true }).click();
    await expect(tag).toHaveCount(0);
    await menu(editor(page));
    await page.getByText("元に戻す（Ctrl+Z）", { exact: true }).click();
    await expect(tag).toHaveCount(1);
    await editor(page).focus();
    await page.keyboard.press("Control+End");
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("Enter");
    await page.keyboard.insertText("next");
    await expect(editor(page)).toContainText("next");
    await page.keyboard.press("Control+z");
    await page.keyboard.press("Control+z");
    await expect(tag).toHaveCount(1);
    await expect(editor(page)).toHaveText("Alpha0");
});

test("Chromium IME composition is one undo step and synchronous flush captures pending text", async ({ page, context }) => {
    await openFixture(page);
    await page.getByTitle("列を増やす").click();
    const cdp = await context.newCDPSession(page);
    await editor(page).focus();
    await page.keyboard.press("Control+End");
    await cdp.send("Input.imeSetComposition", { text: "に", selectionStart: 1, selectionEnd: 1 });
    await cdp.send("Input.imeSetComposition", { text: "日本語", selectionStart: 3, selectionEnd: 3 });
    await expect(editor(page, 0, 1)).toHaveText("Alpha0");
    await cdp.send("Input.insertText", { text: "日本語" });
    await expect(editor(page, 0, 1)).toHaveText("Alpha0日本語");
    await page.keyboard.press("Control+z");
    await expect(editor(page)).toHaveText("Alpha0");
    await page.keyboard.press("Control+y");
    await expect(editor(page)).toHaveText("Alpha0日本語");
    await cdp.send("Input.imeSetComposition", { text: "未確定", selectionStart: 3, selectionEnd: 3 });
    expect(await page.evaluate(() => {
        window.dispatchEvent(new Event("srt-editor-flush"));
        return window.editorStore.mediaState.media.srt_data[0].data[0].text;
    })).toBe("Alpha0日本語未確定");
    await cdp.send("Input.insertText", { text: "未確定" });
    await page.keyboard.press("Control+z");
    await expect(editor(page)).toHaveText("Alpha0日本語");
    await cdp.detach();
});

test("audio-less time buttons use canonical seekTime and undo both adjacent boundaries", async ({ page }) => {
    await openFixture(page);
    await page.locator(".bar-container input[type='range']").fill("15");
    expect(await page.evaluate(() => window.editorStore.useAudio.audio)).toBeNull();
    await column(page).locator(".clip-row").nth(1).locator(".time-button").first().click();
    expect(await page.evaluate(() => window.editorStore.mediaState.media.srt_data[0].data.slice(0, 2).map((clip) => [clip.startTime, clip.endTime]))).toEqual([[0, 15], [15, 20]]);
    await editor(page, 1).press("Control+z");
    expect(await page.evaluate(() => window.editorStore.mediaState.media.srt_data[0].data[0].endTime)).toBe(10);
    await column(page).locator(".clip-row").nth(1).locator(".time-button").last().click();
    expect(await page.evaluate(() => window.editorStore.mediaState.media.srt_data[0].data.slice(1).map((clip) => [clip.startTime, clip.endTime]))).toEqual([[10, 15], [15, 30]]);
    await editor(page, 1).press("Control+z");
    expect(await page.evaluate(() => window.editorStore.mediaState.media.srt_data[0].data[2].startTime)).toBe(20);
});

test("timeline drag is one history step after an earlier editor boundary command", async ({ page }) => {
    await openFixture(page);
    const boundaries = () => page.evaluate(() => window.editorStore.mediaState.media.srt_data[0].data
        .map((clip) => [clip.startTime, clip.endTime, clip.startTimeStr, clip.endTimeStr]));
    const expected = (time) => [
        [0, time, "00:00:00,000", `00:00:${time},000`],
        [time, 20, `00:00:${time},000`, "00:00:20,000"],
        [20, 30, "00:00:20,000", "00:00:30,000"],
    ];
    await page.locator(".bar-container input[type='range']").fill("15");
    await column(page).locator(".clip-row").nth(1).locator(".time-button").first().click();
    expect(await boundaries()).toEqual(expected(15));

    const edge = page.locator(".timeline .edge").first();
    await edge.scrollIntoViewIfNeeded();
    const bounds = await edge.boundingBox();
    const delta = await page.evaluate(() => 2 * window.editorStore.uiState.timeLineRatio ** 2);
    const x = bounds.x + bounds.width / 2;
    const y = bounds.y + bounds.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + delta, y, { steps: 4 });
    await page.mouse.up();
    expect(await boundaries()).toEqual(expected(17));

    await editor(page, 1).press("Control+z");
    expect(await boundaries()).toEqual(expected(15));
    await editor(page, 1).press("Control+z");
    expect(await boundaries()).toEqual(expected(10));
    await editor(page, 1).press("Control+y");
    expect(await boundaries()).toEqual(expected(15));
    await editor(page, 1).press("Control+y");
    expect(await boundaries()).toEqual(expected(17));
});

test("auto-scroll follows clip changes once per column and manual wheel interrupts smooth scrolling", async ({ page }) => {
    await openFixture(page, 100);
    await page.getByTitle("列を増やす").click();
    await page.evaluate(() => {
        window.scrollCalls = 0;
        window.rectCalls = 0;
        for (const box of document.querySelectorAll('[data-testid="editor-scroll"]')) {
            const scrollTo = box.scrollTo.bind(box);
            box.scrollTo = (...args) => { window.scrollCalls++; return scrollTo(...args); };
            for (const element of [box, ...box.querySelectorAll(".editor")]) {
                const rect = element.getBoundingClientRect.bind(element);
                element.getBoundingClientRect = () => { window.rectCalls++; return rect(); };
            }
        }
        window.editorStore.uiState.autoScroll = true;
        window.editorStore.useAudio.seek(505);
    });
    await expect.poll(() => page.evaluate(() => window.scrollCalls)).toBe(2);
    const counts = await page.evaluate(() => [window.scrollCalls, window.rectCalls]);
    await page.evaluate(async () => {
        for (let i = 0; i < 30; i++) {
            window.editorStore.useAudio.seek(505 + i / 100);
            await new Promise(requestAnimationFrame);
        }
    });
    expect(await page.evaluate(() => [window.scrollCalls, window.rectCalls])).toEqual(counts);
    await page.evaluate(() => window.editorStore.useAudio.seek(905));
    await expect.poll(() => page.evaluate(() => window.scrollCalls)).toBe(4);
    await column(page).getByTestId("editor-scroll").hover();
    await page.mouse.wheel(0, -300);
    await expect.poll(() => page.evaluate(() => window.editorStore.uiState.autoScroll)).toBe(false);
    await page.screenshot({ path: "test-results/editor-review-scroll.png" });
});
