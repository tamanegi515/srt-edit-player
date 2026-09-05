import { expect, test } from "@playwright/test";
import { installFolder, project, subtitles } from "../helpers/browser-fs.js";

test.beforeEach(async ({ page }) => {
  await installFolder(page, {
    "a.vc_json": project("a.vc_json", "a.json"),
    "b.vc_json": project("b.vc_json", "b.json"),
    "a.json": subtitles("Alpha"), "b.json": subtitles("Beta"),
    "unreferenced.json": "DO NOT OVERWRITE",
  });
  await page.goto("/");
  await page.getByRole("button", { name: "フォルダを開く", exact: true }).click();
  await expect(page.locator(".editor").first()).toContainText("Alpha");
});

test("retains unsaved text across media switches and persists on save", async ({ page }) => {
  await page.locator(".editor").first().fill("Edited Alpha");
  await page.getByLabel("メディア選択", { exact: true }).selectOption("1");
  await expect(page.locator(".editor").first()).toContainText("Beta");
  await page.getByLabel("メディア選択", { exact: true }).selectOption("0");
  await expect(page.locator(".editor").first()).toContainText("Edited Alpha");
  await page.getByRole("button", { name: "字幕を保存", exact: true }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(window.__files["a.json"])[0].sentences[0])).toBe("Edited Alpha");
  await page.getByRole("button", { name: "フォルダを開く", exact: true }).click();
  await expect(page.locator(".editor").first()).toContainText("Edited Alpha");
});

for (const mode of ["cancel", "denied", "invalid"]) {
  test(`folder ${mode} leaves the current project intact`, async ({ page }) => {
    await page.locator(".editor").first().fill("Kept draft");
    await page.evaluate((mode) => { window.__pickerMode = mode; }, mode);
    await page.getByRole("button", { name: "フォルダを開く", exact: true }).click();
    await expect(page.getByRole("button", { name: "フォルダを開く", exact: true })).toBeEnabled();
    await expect(page.locator(".editor").first()).toContainText("Kept draft");
    await page.getByRole("button", { name: "字幕を保存", exact: true }).click();
    await expect.poll(() => page.evaluate(() => JSON.parse(window.__files["a.json"])[0].sentences[0])).toBe("Kept draft");
  });
}

test("refuses to overwrite an unreferenced existing file when creating a track", async ({ page }) => {
  await page.getByTestId("new-subtitle-track-name").fill("unreferenced");
  await page.getByTestId("create-subtitle-track").click();
  await expect(page.locator(".toast-error")).toBeVisible();
  expect(await page.evaluate(() => window.__files["unreferenced.json"])).toBe("DO NOT OVERWRITE");
});

test("canceling discard keeps dirty drafts from other media too", async ({ page }) => {
  await page.locator(".editor").first().fill("Unsaved Alpha");
  await page.getByLabel("メディア選択", { exact: true }).selectOption("1");
  await expect(page.locator(".editor").first()).toContainText("Beta");
  let confirmations = 0;
  page.on("dialog", async (dialog) => { confirmations++; await dialog.dismiss(); });
  await page.getByRole("button", { name: "フォルダを開く", exact: true }).click();
  await expect.poll(() => confirmations).toBe(1);
  await page.getByLabel("メディア選択", { exact: true }).selectOption("0");
  await expect(page.locator(".editor").first()).toContainText("Unsaved Alpha");
});

test("one outer splitter remains focused and resizes with arrow keys", async ({ page }) => {
  const splitter = page.getByRole("separator", { name: "プレイヤーと編集エリアの境界" });
  await expect(page.locator(".resize-bar")).toHaveCount(0);
  await splitter.click();
  await expect(splitter).toBeFocused();
  const width = Number(await splitter.getAttribute("aria-valuenow"));
  const seek = page.getByLabel("再生位置", { exact: true });
  await seek.press("End");
  await splitter.click();
  await page.keyboard.press("ArrowLeft");
  await expect(splitter).toHaveAttribute("aria-valuenow", String(width + 10));
  await expect(seek).toHaveValue("2");
  await page.keyboard.press("ArrowRight");
  await expect(splitter).toHaveAttribute("aria-valuenow", String(width));
  await expect(seek).toHaveValue("2");
});

test("duplicate references in one project share edits and cannot overwrite one another", async ({ page }) => {
  await page.evaluate(() => {
    const data = JSON.parse(window.__files["a.vc_json"]);
    data.scriptFiles.push({ filePath: "a.json", name: "Alias" });
    window.__files["a.vc_json"] = JSON.stringify(data);
  });
  await page.getByRole("button", { name: "フォルダを開く", exact: true }).click();
  await expect(page.locator(".srt_select option")).toHaveCount(2);
  await expect(page.getByRole("button", { name: "字幕を保存", exact: true })).toBeEnabled();
  await expect(page.locator(".editor").first()).toContainText("Alpha");
  await page.locator(".editor").first().fill("Shared draft");
  expect(await page.evaluate(async () => {
    const resource = performance.getEntriesByType("resource").find((entry) => entry.name.includes("/src/lib/store.svelte.js"));
    const { mediaState } = await import(resource.name);
    const [first, second] = mediaState.media.srt_data;
    return { sameSource: first.data === second.data, texts: [first.data[0].text, second.data[0].text] };
  })).toEqual({ sameSource: true, texts: ["Shared draft", "Shared draft"] });
  await page.locator(".srt_select").selectOption("1");
  await expect(page.locator(".editor").first()).toContainText("Shared draft");
  await page.getByRole("button", { name: "字幕を保存", exact: true }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(window.__files["a.json"])[0].sentences[0])).toBe("Shared draft");
});
