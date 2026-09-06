import { expect, test } from "@playwright/test";
import { installFolder } from "../helpers/browser-fs.js";

const text = "First line\nSecond line\nThird line\nFourth line\nFifth line\nSixth line\nSeventh line\nEighth line\nNinth line\nTenth line";
const prefix = text.slice(0, text.indexOf("Seventh"));
const config = (path) => JSON.stringify({
  name: "boxes.vc_json",
  scriptFiles: [{ name: path, filePath: path, defaultStyle: "normal", x: 12, y: 12, maxWidth: 270, maxHeight: 260, boxAlignX: 0, boxAlignY: 0 }],
  styles: { normal: {
    font: "sans-serif", fontSize: 22, textColor: "#ffffffff", fontWeight: "normal", fontStyle: "normal", letterSpace: 0, lineSpace: 4,
    outline1: { enable: false, size: 0, color: "#000000ff" },
    outline2: { enable: false, size: 0, x: 0, y: 0, color: "#000000ff" },
    shadow: { enable: false, size: 0, x: 0, y: 0, blur: 0, steps: 1, color: "#000000ff" },
  } },
});
const rows = () => [
  { start: "00:00:00,000", end: "00:00:10,000", sentences: [text] },
  { start: "00:00:10,000", end: "00:00:20,000", sentences: ["Following clip"] },
];

async function open(page, files) {
  await installFolder(page, files);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/srt-edit-player/");
  await page.getByRole("button", { name: "フォルダを開く", exact: true }).click();
  await expect(page.locator(".editor").first()).toBeVisible();
}

async function splitAt(page, editor, offset) {
  // Set a precise caret; the command itself is a real pointer interaction.
  await editor.evaluate((el, offset) => {
    el.focus();
    const range = document.createRange();
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    let remaining = offset;
    let placed = false;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node.nodeType === Node.TEXT_NODE) {
        if (remaining <= node.textContent.length) {
          range.setStart(node, remaining);
          placed = true;
          break;
        }
        remaining -= node.textContent.length;
      } else if (node.nodeName === "BR" || node.nodeName === "DIV") {
        if (remaining === 0) { range.setStartBefore(node); placed = true; break; }
        remaining--;
      }
    }
    if (!placed) { range.selectNodeContents(el); range.collapse(false); }
    range.collapse(true);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }, offset);
  await editor.locator("xpath=ancestor::div[contains(@class,'clip-row')]")
    .getByRole("button", { name: "表示ボックスを分割", exact: true }).click();
}

test("one timed clip splits into separately editable boxes and round-trips without duplicated text", async ({ page }, testInfo) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await open(page, { "boxes.vc_json": config("dialog.json"), "dialog.json": JSON.stringify(rows()) });
  const row = page.locator(".clip-row").first();
  await row.locator(".editor").fill(text);
  await splitAt(page, row.locator(".editor"), prefix.length);
  await expect(row.locator(".editor")).toHaveCount(2);
  await expect(row.locator(".editor").nth(1)).toBeFocused();
  await expect(page.locator(".clip-row")).toHaveCount(2);
  await expect(row.locator(".editor").first()).toHaveText(prefix.trim(), { useInnerText: true });
  await expect(row.locator(".editor").nth(1)).toHaveText(text.slice(prefix.length), { useInnerText: true });
  await row.locator(".editor").nth(1).fill("Edited second box\n\nA new paragraph");
  const primaryBox = page.locator('.srt_box[data-block-id="primary"]');
  const extraBox = page.locator('.srt_box:not([data-block-id="primary"])');
  const primaryBefore = await primaryBox.boundingBox();
  const extraBefore = await extraBox.boundingBox();
  await page.mouse.move(extraBefore.x + 180, extraBefore.y + 220);
  await page.mouse.down();
  await page.mouse.move(extraBefore.x + 480, extraBefore.y + 220, { steps: 6 });
  await page.mouse.up();
  await expect.poll(async () => (await extraBox.boundingBox()).x).toBeCloseTo(extraBefore.x + 300, 0);
  expect((await primaryBox.boundingBox()).x).toBe(primaryBefore.x);
  const handle = await extraBox.locator(".resize-handle.right").boundingBox();
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2 + 30, handle.y + handle.height / 2, { steps: 3 });
  await page.mouse.up();
  await expect.poll(async () => (await extraBox.boundingBox()).width).toBeCloseTo(extraBefore.width + 30, 0);
  await page.getByRole("button", { name: "字幕を保存", exact: true }).click();
  await expect(page.locator(".toast")).toContainText("保存完了");
  const saved = await page.evaluate(() => JSON.parse(window.__files["dialog.json"]));
  expect(saved).toHaveLength(2);
  expect(saved[0].start).toBe("00:00:00,000");
  expect(saved[0].end).toBe("00:00:10,000");
  expect(saved[0].sentences).toEqual([prefix.trim()]);
  expect(saved[0].additionalBlocks).toHaveLength(1);
  expect(saved[0].additionalBlocks[0].sentences).toEqual(["Edited second box", "A new paragraph"]);
  expect(saved[0].additionalBlocks[0].layout.x).toBe(344);
  expect(saved[0].additionalBlocks[0].layout.maxWidth).toBe(300);
  expect(saved[0].layout.x).toBe(12);
  expect(saved[1]).not.toHaveProperty("layout");
  expect(saved[1]).not.toHaveProperty("additionalBlocks");
  await page.getByRole("button", { name: "vc_jsonを保存", exact: true }).click();
  const project = await page.evaluate(() => JSON.parse(window.__files["boxes.vc_json"]));
  expect(project.scriptFiles[0]).not.toHaveProperty("inlineData");
  await page.getByRole("button", { name: "フォルダを開く", exact: true }).click();
  await expect(row.locator(".editor")).toHaveCount(2);
  await expect(page.locator(".srt_box")).toHaveCount(2);
  await page.screenshot({ path: testInfo.outputPath("two-boxes.png") });
  expect(errors).toEqual([]);
});

test("box split and merge are undoable without changing timeline clip count", async ({ page }) => {
  await open(page, { "boxes.vc_json": config("dialog.json"), "dialog.json": JSON.stringify(rows()) });
  const row = page.locator(".clip-row").first();
  await row.locator(".editor").fill("AlphaBeta");
  await splitAt(page, row.locator(".editor"), 5);
  await expect(row.locator(".editor")).toHaveCount(2);
  await row.locator(".editor").nth(1).press("Control+z");
  await expect(row.locator(".editor")).toHaveCount(1);
  await expect(row.locator(".editor")).toHaveText("AlphaBeta");
  await row.locator(".editor").press("Control+y");
  await expect(row.locator(".editor")).toHaveCount(2);
  await row.getByRole("button", { name: "前の箱と結合", exact: true }).click();
  await expect(row.locator(".editor")).toHaveCount(1);
  await expect(row.locator(".editor")).toContainText("Alpha");
  await expect(row.locator(".editor")).toContainText("Beta");
  await row.locator(".editor").press("Control+z");
  await expect(row.locator(".editor")).toHaveCount(2);
  await expect(page.locator(".clip-row")).toHaveCount(2);
});

test("SRT box split creates JSON, keeps original bytes and persists the new project reference", async ({ page }) => {
  const original = "1\r\n00:00:00,000 --> 00:00:10,000\r\nAlphaBeta\r\n\r\n";
  await open(page, { "boxes.vc_json": config("dialog.srt"), "dialog.srt": original, "dialog.boxes.json": "existing unrelated file" });
  const editor = page.locator(".editor").first();
  await editor.fill("AlphaBeta");
  await splitAt(page, editor, 5);
  await expect(page.locator(".editor")).toHaveCount(2);
  const files = await page.evaluate(() => window.__files);
  expect(files["dialog.srt"]).toBe(original);
  expect(files["dialog.boxes.json"]).toBe("existing unrelated file");
  const project = JSON.parse(files["boxes.vc_json"]);
  expect(project.scriptFiles[0].filePath).toBe("dialog.boxes-2.json");
  const saved = JSON.parse(files["dialog.boxes-2.json"]);
  expect(saved[0].sentences).toEqual(["Alpha"]);
  expect(saved[0].additionalBlocks[0].text).toBe("Beta");
  await page.getByRole("button", { name: "フォルダを開く", exact: true }).click();
  await expect(page.locator(".editor")).toHaveCount(2);
});

test("failed project reference save rolls back the new JSON and keeps the SRT editor intact", async ({ page }) => {
  const original = "1\r\n00:00:00,000 --> 00:00:10,000\r\nAlphaBeta\r\n\r\n";
  await installFolder(page, { "boxes.vc_json": config("dialog.srt"), "dialog.srt": original });
  await page.addInitScript(() => {
    const picker = window.showDirectoryPicker;
    window.showDirectoryPicker = async () => {
      const dir = await picker();
      const get = dir.getFileHandle.bind(dir);
      dir.removeEntry = async (name) => { delete window.__files[name]; };
      dir.getFileHandle = async (name, options) => {
        const file = await get(name, options);
        if (name === "boxes.vc_json") file.createWritable = async () => { throw new Error("Write denied"); };
        return file;
      };
      return dir;
    };
  });
  await page.goto("/srt-edit-player/");
  await page.getByRole("button", { name: "フォルダを開く", exact: true }).click();
  const editor = page.locator(".editor").first();
  await editor.fill("AlphaBeta");
  await splitAt(page, editor, 5);
  await expect(page.locator(".toast-error")).toBeVisible();
  await expect(page.locator(".editor")).toHaveCount(1);
  await expect(editor).toHaveText("AlphaBeta");
  const files = await page.evaluate(() => window.__files);
  expect(files["dialog.srt"]).toBe(original);
  expect(files).not.toHaveProperty("dialog.boxes.json");
  expect(JSON.parse(files["boxes.vc_json"]).scriptFiles[0].filePath).toBe("dialog.srt");
});

test("converting one SRT reference leaves another reference attached to the original source", async ({ page }) => {
  const project = JSON.parse(config("dialog.srt"));
  project.scriptFiles.push({ ...project.scriptFiles[0], name: "Other view" });
  await open(page, {
    "boxes.vc_json": JSON.stringify(project),
    "dialog.srt": "1\r\n00:00:00,000 --> 00:00:10,000\r\nAlphaBeta\r\n\r\n",
  });
  const editor = page.locator(".editor").first();
  await editor.fill("AlphaBeta");
  await splitAt(page, editor, 5);
  await expect(page.locator(".editor")).toHaveCount(2);
  await page.locator(".srt_select").selectOption("1");
  await expect(page.locator(".editor")).toHaveCount(1);
  await expect(page.locator(".editor")).toHaveText("AlphaBeta");
  const projectSaved = await page.evaluate(() => JSON.parse(window.__files["boxes.vc_json"]));
  expect(projectSaved.scriptFiles[0].filePath).toBe("dialog.boxes.json");
  expect(projectSaved.scriptFiles[1].filePath).toBe("dialog.srt");
});

test("SRT conversion avoids missing referenced paths and carries earlier text undo history", async ({ page }) => {
  const project = JSON.parse(config("dialog.srt"));
  project.scriptFiles.push({ ...project.scriptFiles[0], name: "Missing", filePath: "dialog.boxes.json" });
  await open(page, {
    "boxes.vc_json": JSON.stringify(project),
    "dialog.srt": "1\r\n00:00:00,000 --> 00:00:10,000\r\nOriginal\r\n\r\n",
  });
  const editor = page.locator(".editor").first();
  await editor.fill("AlphaBeta");
  await splitAt(page, editor, 5);
  await expect(page.locator(".editor")).toHaveCount(2);
  const projectSaved = await page.evaluate(() => JSON.parse(window.__files["boxes.vc_json"]));
  expect(projectSaved.scriptFiles[0].filePath).toBe("dialog.boxes-2.json");
  expect(projectSaved.scriptFiles[1].filePath).toBe("dialog.boxes.json");
  await page.locator(".editor").nth(1).press("Control+z");
  await expect(page.locator(".editor")).toHaveCount(1);
  await expect(editor).toHaveText("AlphaBeta");
  await editor.press("Control+z");
  await expect(editor).toHaveText("Original");
});
