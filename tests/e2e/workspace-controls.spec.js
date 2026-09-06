import { expect, test } from "@playwright/test";
import { getDefaultJsonData } from "../../src/lib/data_process.js";

async function openProject(page) {
  const project = getDefaultJsonData();
  project.name = "workspace.vc_json";
  project.audioFilePath = "";
  project.imageSrtPath = "images.srt";
  project.scriptFiles[0].filePath = "captions.srt";
  project.seekTime = 600;
  await page.addInitScript(project => {
    const png = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII="), c => c.charCodeAt(0));
    const files = new Map([
      [project.name, new File([JSON.stringify(project)], project.name)],
      ["captions.srt", new File(["1\n00:00:00,000 --> 00:20:00,000\nWorkspace fixture\n"], "captions.srt")],
      ["images.srt", new File(["1\n00:00:00,000 --> 00:05:00,000\na.png\n\n2\n00:05:00,000 --> 00:20:00,000\nb.png\n"], "images.srt")],
      ...["a.png", "b.png"].map(name => [name, new File([png], name, { type: "image/png" })]),
    ]);
    const entry = name => ({ kind: "file", name, async getFile() { return files.get(name); } });
    window.showDirectoryPicker = async () => ({
      kind: "directory", name: "workspace-fixture",
      async requestPermission() { return "granted"; },
      async queryPermission() { return "granted"; },
      async *values() { for (const name of files.keys()) yield entry(name); },
      async getFileHandle(name) {
        if (!files.has(name)) throw new DOMException("Missing fixture", "NotFoundError");
        return entry(name);
      },
    });
  }, project);
  await page.goto("/");
  await page.getByRole("button", { name: "フォルダを開く", exact: true }).click();
  await expect(page.locator(".editor")).toHaveCount(1);
  await page.evaluate(async () => {
    const source = performance.getEntriesByType("resource").find(entry => entry.name.includes("/src/lib/store.svelte.js"));
    window.workspaceStore = await import(source.name);
    await document.fonts.ready;
  });
}

for (const width of [1926, 1366, 800]) {
  test(`image and timeline controls share one row outside the stage at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await openProject(page);
    const metrics = await page.evaluate(() => {
      const rect = selector => document.querySelector(selector).getBoundingClientRect();
      const row = rect(".workspace-controls");
      const image = rect(".image-control-group");
      const track = rect(".track-controls");
      return { height: row.height, tops: [image.top, track.top], gap: track.left - image.right,
        belowStage: row.top >= rect(".media-stage").bottom,
        beforeTimeline: row.bottom <= rect(".track-view").top,
        contained: image.left >= row.left && track.right <= row.right };
    });
    expect(metrics.height).toBe(32);
    expect(metrics.tops[0]).toBe(metrics.tops[1]);
    expect(metrics.gap).toBeGreaterThanOrEqual(16);
    expect(metrics.belowStage && metrics.beforeTimeline && metrics.contained).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`workspace-controls-${width}.png`) });
  });
}

test("hiding the timeline leaves manual and automatic image navigation available", async ({ page }) => {
  await openProject(page);
  await page.locator(".toggle-field").filter({ hasText: "Timeline" }).click();
  await expect(page.locator(".track-view, .track-controls")).toHaveCount(0);
  await expect(page.locator(".image-control-group")).toBeVisible();
  await page.locator(".image-control-group button").last().click();
  await expect.poll(() => page.evaluate(() => window.workspaceStore.mediaState.media.image_data.currentImagePath)).toBe("b.png");
  await page.locator(".image-control-group button").first().click();
  await expect.poll(() => page.evaluate(() => window.workspaceStore.mediaState.media.image_data.currentImagePath)).toBe("a.png");
  await page.locator(".image-control-group .toggle_switch").click();
  await expect.poll(() => page.evaluate(() => window.workspaceStore.mediaState.media.image_data.currentImagePath)).toBe("b.png");
  await page.getByRole("slider", { name: "再生位置", exact: true }).fill("1");
  await expect.poll(() => page.evaluate(() => window.workspaceStore.mediaState.media.image_data.currentImagePath)).toBe("a.png");
});

test("timeline scroll command targets the remounted view and retains shared settings", async ({ page }) => {
  await openProject(page);
  const zoom = page.getByRole("slider", { name: "タイムライン拡大率", exact: true });
  const auto = page.getByRole("checkbox", { name: "トラックのオートスクロール", exact: true });
  await zoom.fill("20");
  if (await auto.isChecked()) await page.locator(".auto-scroll-control").click();
  for (let index = 0; index < 2; index++) {
    if (index) {
      const visibility = page.locator(".toggle-field").filter({ hasText: "Timeline" });
      await visibility.click();
      await visibility.click();
    }
    await expect(zoom).toHaveValue("20");
    await expect(auto).not.toBeChecked();
    await page.locator(".right-subpanel").evaluate(element => { element.scrollLeft = 0; });
    await page.getByRole("button", { name: "タイムラインを再生位置にスクロール", exact: true }).click();
    await expect.poll(() => page.locator(".right-subpanel").evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
  }
});
