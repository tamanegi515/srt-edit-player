import { expect, test } from "@playwright/test";
import { installFolder, project, subtitles } from "../helpers/browser-fs.js";

const labels = {
  open: "\u30d5\u30a9\u30eb\u30c0\u3092\u958b\u304f",
  media: "\u30e1\u30c7\u30a3\u30a2\u9078\u629e",
  saveProject: "vc_json\u3092\u4fdd\u5b58",
  saveSubtitles: "\u5b57\u5e55\u3092\u4fdd\u5b58",
};

function button(page, name) {
  return page.getByRole("button", { name, exact: true });
}

async function openFolder(page) {
  await button(page, labels.open).click();
  await expect(page.locator(".editor").first()).toBeVisible();
  await expect(page.getByLabel(labels.media, { exact: true })).toBeEnabled();
}

async function switchMedia(page, index) {
  const select = page.getByLabel(labels.media, { exact: true });
  await select.selectOption(String(index));
  await expect(select).toBeEnabled();
  await expect(select).toHaveValue(String(index));
}

async function warnsBeforeUnload(page) {
  return page.evaluate(() => {
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  });
}

async function readSubtitle(page, path) {
  return page.evaluate((path) => JSON.parse(window.__files[path])[0].sentences[0], path);
}

test("failed media switching restores the loaded project before saving", async ({ page }) => {
  const invalidProject = JSON.stringify({
    ...JSON.parse(project("b.vc_json", "b.json")),
    imageFilePath: 123,
  });
  const beta = subtitles("Beta");
  await installFolder(page, {
    "a.vc_json": project("a.vc_json", "a.json"),
    "b.vc_json": invalidProject,
    "a.json": subtitles("Alpha"),
    "b.json": beta,
  });
  await page.goto("/");
  await openFolder(page);
  await page.locator(".editor").first().fill("Kept Alpha draft");

  const select = page.getByLabel(labels.media, { exact: true });
  await select.selectOption("1");
  await expect(page.locator(".toast-error")).toBeVisible();
  await expect(select).toHaveValue("0");
  await expect(select).toBeEnabled();
  await expect(page.locator(".editor").first()).toHaveText("Kept Alpha draft");

  await button(page, labels.saveProject).click();
  await expect(button(page, labels.saveProject)).toBeEnabled();
  const savedProject = await page.evaluate(() => JSON.parse(window.__files["a.vc_json"]));
  expect(savedProject.name).toBe("a.vc_json");
  expect(savedProject.scriptFiles[0].filePath).toBe("a.json");
  expect(savedProject.imageFilePath).not.toBe(123);

  await button(page, labels.saveSubtitles).click();
  await expect.poll(() => readSubtitle(page, "a.json")).toBe("Kept Alpha draft");
  expect(await page.evaluate(() => window.__files["b.vc_json"])).toBe(invalidProject);
  expect(await page.evaluate(() => window.__files["b.json"])).toBe(beta);
  expect(await page.evaluate(() => Object.keys(window.__writes).sort())).toEqual(["a.json", "a.vc_json"]);
});

test("shared subtitle drafts and saved baselines follow the normalized source path", async ({ page }) => {
  await installFolder(page, {
    "a.vc_json": project("a.vc_json", "captions/shared.json"),
    "b.vc_json": project("b.vc_json", "captions\\shared.json"),
    "captions/shared.json": subtitles("Original"),
  });
  await page.goto("/");
  await openFolder(page);
  await switchMedia(page, 1);
  await switchMedia(page, 0);
  await page.locator(".editor").first().fill("Saved A change");
  await expect.poll(() => warnsBeforeUnload(page)).toBe(true);
  await button(page, labels.saveSubtitles).click();
  await expect.poll(() => readSubtitle(page, "captions/shared.json")).toBe("Saved A change");
  await expect(button(page, labels.saveSubtitles)).toBeEnabled();
  await expect.poll(() => warnsBeforeUnload(page)).toBe(false);

  await switchMedia(page, 1);
  await expect(page.locator(".editor").first()).toHaveText("Saved A change");
  await expect.poll(() => warnsBeforeUnload(page)).toBe(false);
  await button(page, labels.saveSubtitles).click();
  await expect(button(page, labels.saveSubtitles)).toBeEnabled();
  expect(await readSubtitle(page, "captions/shared.json")).toBe("Saved A change");

  await page.locator(".editor").first().fill("Unsaved B change");
  await switchMedia(page, 0);
  await expect(page.locator(".editor").first()).toHaveText("Unsaved B change");
  await expect.poll(() => warnsBeforeUnload(page)).toBe(true);
  await button(page, labels.saveSubtitles).click();
  await expect.poll(() => readSubtitle(page, "captions/shared.json")).toBe("Unsaved B change");
  await expect(button(page, labels.saveSubtitles)).toBeEnabled();
  await expect.poll(() => warnsBeforeUnload(page)).toBe(false);
});

test("project save payload and dirty baseline use the same immutable snapshot", async ({ page }) => {
  await installFolder(page, {
    "a.vc_json": project("a.vc_json", "a.json"),
    "a.json": subtitles("Alpha"),
  });
  await page.goto("/");
  // Gate the real save call at both await boundaries without elapsed-time sleeps.
  await page.evaluate(() => {
    window.__integrationSave = { armed: false, stage: "idle", release: null };
    const picker = window.showDirectoryPicker;
    window.showDirectoryPicker = async () => {
      const directory = await picker();
      const getFileHandle = directory.getFileHandle.bind(directory);
      directory.getFileHandle = async (name, options) => {
        const handle = await getFileHandle(name, options);
        if (name !== "a.vc_json") return handle;
        const createWritable = handle.createWritable.bind(handle);
        handle.createWritable = async () => {
          const gate = window.__integrationSave;
          if (gate.armed) {
            await new Promise((resolve) => {
              gate.stage = "create";
              gate.release = resolve;
            });
          }
          const writer = await createWritable();
          const close = writer.close.bind(writer);
          writer.close = async () => {
            if (gate.armed) {
              await new Promise((resolve) => {
                gate.stage = "close";
                gate.release = resolve;
              });
            }
            await close();
            gate.stage = "done";
          };
          return writer;
        };
        return handle;
      };
      return directory;
    };
  });
  await openFolder(page);
  const fontSize = page.getByTestId("style-font-size");
  await fontSize.fill("40");
  await page.evaluate(() => { window.__integrationSave.armed = true; });
  await button(page, labels.saveProject).click();
  await page.waitForFunction(() => window.__integrationSave.stage === "create");
  await fontSize.fill("60");
  await page.evaluate(() => window.__integrationSave.release());
  await page.waitForFunction(() => window.__integrationSave.stage === "close");
  await fontSize.fill("40");
  await page.evaluate(() => window.__integrationSave.release());
  await expect(button(page, labels.saveProject)).toBeEnabled();

  expect(await page.evaluate(() => Object.values(JSON.parse(window.__files["a.vc_json"]).styles)[0].fontSize)).toBe(40);
  await expect(fontSize).toHaveValue("40");
  await expect.poll(() => warnsBeforeUnload(page)).toBe(false);
  await fontSize.fill("60");
  await expect.poll(() => warnsBeforeUnload(page)).toBe(true);
  await fontSize.fill("40");
  await expect.poll(() => warnsBeforeUnload(page)).toBe(false);
});
