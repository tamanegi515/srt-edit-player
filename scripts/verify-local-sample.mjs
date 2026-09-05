import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, open, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.resolve(process.argv[2] || path.join(repo, "\u3044\u3048\u30ab\u30ce"));
const baseUrl = "http://127.0.0.1:4173";
const runId = `local-sample-${new Date().toISOString().replace(/[:.]/g, "-")}`;
const output = path.join(repo, "output", "playwright", runId);
const opfsName = `verification-${runId}`;
const files = [];

async function enumerate(directory, relative = "") {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relativePath = relative ? `${relative}/${entry.name}` : entry.name;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) await enumerate(absolute, relativePath);
    else if (entry.isFile()) files.push({ relativePath, absolute, size: (await stat(absolute)).size });
  }
}

async function hashes() {
  const result = {};
  for (const file of files) {
    const hash = createHash("sha256");
    for await (const chunk of createReadStream(file.absolute)) hash.update(chunk);
    result[file.relativePath] = hash.digest("hex");
  }
  return result;
}

await enumerate(source);
assert(files.some((file) => file.relativePath.endsWith(".vc_json")), "Sample project is missing");
await mkdir(output, { recursive: true });
const beforeHashes = await hashes();
const report = {
  source,
  sourceFileCount: files.length,
  sourceBytes: files.reduce((total, file) => total + file.size, 0),
  fileSystem: "Real Chromium OPFS FileSystemDirectoryHandle/FileSystemFileHandle",
  picker: "showDirectoryPicker substituted with OPFS handle; native picker not tested",
  network: "Source bytes stay on loopback (large files via 8MB ranges); only static Google font GETs allowed externally",
  beforeHashes,
  fontRequests: [],
  screenshots: [],
  pageErrors: [],
};
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
let storeModuleUrl;
context.setDefaultTimeout(30000);
await context.route("**/*", async (route) => {
  const url = new URL(route.request().url());
  if (url.pathname.endsWith("/src/lib/store.svelte.js")) storeModuleUrl = url.href;
  if (url.origin !== baseUrl) {
    if (["fonts.googleapis.com", "fonts.gstatic.com"].includes(url.hostname) && route.request().method() === "GET") {
      report.fontRequests.push({ origin: url.origin, method: "GET" });
      return route.continue();
    }
    return route.abort();
  }
  if (url.pathname.startsWith("/__local_sample__/")) {
    const index = Number(url.pathname.slice("/__local_sample__/".length));
    const file = Number.isInteger(index) ? files[index] : null;
    if (!file) return route.fulfill({ status: 404, body: "" });
    const range = route.request().headers().range?.match(/^bytes=(\d+)-(\d+)$/);
    if (range) {
      const start = Number(range[1]);
      const end = Math.min(Number(range[2]), file.size - 1);
      if (start > end || end - start >= 8 * 1024 * 1024) return route.fulfill({ status: 416, body: "" });
      const handle = await open(file.absolute, "r");
      try {
        const body = Buffer.alloc(end - start + 1);
        const { bytesRead } = await handle.read(body, 0, body.length, start);
        assert.equal(bytesRead, body.length);
        return await route.fulfill({ status: 206, body, contentType: "application/octet-stream", headers: {
          "Content-Range": `bytes ${start}-${end}/${file.size}`,
        } });
      } finally { await handle.close(); }
    }
    return route.fulfill({ path: file.absolute, contentType: "application/octet-stream" });
  }
  return route.continue();
});
await context.addInitScript((name) => {
  window.showDirectoryPicker = async () => (await navigator.storage.getDirectory()).getDirectoryHandle(name);
}, opfsName);
const page = await context.newPage();
page.on("pageerror", (error) => report.pageErrors.push(error.name));
async function pollInPage(predicate, argument, { timeout = 30000 } = {}) {
  const deadline = Date.now() + timeout;
  while (!await page.evaluate(predicate, argument)) {
    if (Date.now() >= deadline) throw new Error("Browser verification condition timed out");
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

try {
  await page.goto(baseUrl);
  await page.evaluate(async (url) => { window.__sampleStore = await import(url); }, storeModuleUrl);
  console.log(`Copying ${files.length} files (${report.sourceBytes} bytes) into ephemeral OPFS`);
  const copied = await page.evaluate(async ({ entries, name }) => {
    const root = await navigator.storage.getDirectory();
    const directory = await root.getDirectoryHandle(name, { create: true });
    const result = [];
    for (const [index, entry] of entries.entries()) {
      let target = directory;
      const parts = entry.relativePath.split("/");
      const filename = parts.pop();
      for (const part of parts) target = await target.getDirectoryHandle(part, { create: true });
      const handle = await target.getFileHandle(filename, { create: true });
      if (entry.size > 8 * 1024 * 1024) {
        const writable = await handle.createWritable();
        const chunkSize = 8 * 1024 * 1024;
        for (let start = 0; start < entry.size; start += chunkSize) {
          const end = Math.min(start + chunkSize - 1, entry.size - 1);
          const response = await fetch(`/__local_sample__/${index}`, { headers: { Range: `bytes=${start}-${end}` } });
          if (response.status !== 206) throw new Error("Loopback range copy failed");
          await writable.write(await response.arrayBuffer());
        }
        await writable.close();
      } else {
        const response = await fetch(`/__local_sample__/${index}`);
        if (!response.ok || !response.body) throw new Error("Loopback sample copy failed");
        await response.body.pipeTo(await handle.createWritable());
      }
      const file = await handle.getFile();
      result.push({ path: entry.relativePath, size: file.size, nativeHandle: handle instanceof FileSystemFileHandle });
    }
    return result;
  }, { entries: files.map(({ relativePath, size }) => ({ relativePath, size })), name: opfsName });
  for (const [index, file] of copied.entries()) {
    assert.equal(file.size, files[index].size);
    assert.equal(file.nativeHandle, true);
  }
  report.copied = copied;
  console.log("OPFS copy complete; opening project through app");
  await page.getByRole("button", { name: "\u30d5\u30a9\u30eb\u30c0\u3092\u958b\u304f", exact: true }).click();
  await pollInPage(async () => {
    const { mediaState, useAudio } = window.__sampleStore;
    return mediaState.media.srt_data.some((track) => track.data.length > 0) && useAudio.audio?.readyState >= 1;
  }, null, { timeout: 120000 });
  await page.waitForFunction(() => {
    const image = document.querySelector("img.media-image");
    return image?.complete && image.naturalWidth > 0;
  });
  report.loaded = await page.evaluate(async () => {
    const { mediaState, useAudio } = window.__sampleStore;
    const image = document.querySelector("img.media-image");
    return {
      image: { naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight },
      audio: { duration: useAudio.audio.duration, readyState: useAudio.audio.readyState, nativeElement: useAudio.audio instanceof HTMLAudioElement },
      tracks: mediaState.media.srt_data.map((track) => ({ path: track.file_path, loadStatus: track.loadStatus, clips: track.data.length })),
      editors: document.querySelectorAll(".editor").length,
    };
  });
  assert(report.loaded.audio.duration > 0);
  assert(report.loaded.audio.nativeElement);
  assert(report.loaded.tracks.every((track) => track.loadStatus === "loaded"));
  assert(report.loaded.editors > 0);

  const playback = page.locator(".media-controls .control-row button").first();
  await page.getByRole("slider", { name: "\u518d\u751f\u4f4d\u7f6e", exact: true }).fill("5");
  await pollInPage(async () => {
    const { useAudio } = window.__sampleStore;
    return Math.abs(useAudio.audio.currentTime - 5) < 0.15;
  });
  await playback.click();
  await pollInPage(async () => {
    const { useAudio } = window.__sampleStore;
    return !useAudio.audio.paused && useAudio.audio.currentTime > 5.2;
  });
  await playback.click();
  report.playback = await page.evaluate(async () => {
    const { useAudio } = window.__sampleStore;
    return { advancedPastSeek: useAudio.audio.currentTime > 5.2, paused: useAudio.audio.paused, currentTime: useAudio.audio.currentTime };
  });
  assert(report.playback.paused);
  assert(report.playback.advancedPastSeek);
  const loadedScreenshot = path.join(output, "sample-loaded.png");
  await page.screenshot({ path: loadedScreenshot, fullPage: true });
  report.screenshots.push(loadedScreenshot);

  const marker = "OPFS persistence verification";
  const editor = page.locator(".editor").first();
  await editor.fill(marker);
  await page.getByRole("button", { name: "\u5b57\u5e55\u3092\u4fdd\u5b58", exact: true }).click();
  await pollInPage(async (marker) => {
    const { projectState, mediaState } = window.__sampleStore;
    const { getFileFromPath } = await import("/srt-edit-player/src/lib/util.js");
    const track = mediaState.media.srt_data.find((track) => !track.isImageTrack);
    return (await (await getFileFromPath(projectState.dirHandle, track.file_path)).text()).includes(marker);
  }, marker);
  report.persistence = await page.evaluate(async (marker) => {
    const { projectState, mediaState } = window.__sampleStore;
    const { getFileFromPath } = await import("/srt-edit-player/src/lib/util.js");
    const { getJsonDataList, getMedia } = await import("/srt-edit-player/src/lib/data_process.js");
    const track = mediaState.media.srt_data.find((track) => !track.isImageTrack);
    const raw = await (await getFileFromPath(projectState.dirHandle, track.file_path)).text();
    const [project] = await getJsonDataList(projectState.dirHandle);
    const loaded = await getMedia(project, projectState.dirHandle);
    const result = {
      savedPath: track.file_path,
      nativeFileContainsEdit: raw.includes(marker),
      reloadedProjectContainsEdit: loaded.srt_data.some((track) => track.data.some((clip) => clip.text.includes(marker))),
      hasInlineDataInProject: project.scriptFiles.some((script) => Array.isArray(script.inlineData)),
    };
    loaded.audio?.pause();
    if (loaded.audioUrl) URL.revokeObjectURL(loaded.audioUrl);
    if (loaded.image_data.currentImage) URL.revokeObjectURL(loaded.image_data.currentImage);
    return result;
  }, marker);
  assert(report.persistence.nativeFileContainsEdit);
  assert(report.persistence.reloadedProjectContainsEdit, "Referenced subtitle edits must outrank stale inlineData");
  const savedScreenshot = path.join(output, "sample-saved.png");
  await page.screenshot({ path: savedScreenshot, fullPage: true });
  report.screenshots.push(savedScreenshot);
  // Save project metadata to strip source inlineData, then reload the application from OPFS.
  await page.getByRole("button", { name: "vc_json\u3092\u4fdd\u5b58", exact: true }).click();
  await pollInPage(() => !document.querySelector('button[aria-label="vc_json\u3092\u4fdd\u5b58"]')?.disabled);
  await pollInPage(async () => {
    const { projectState } = window.__sampleStore;
    const { getJsonDataList } = await import("/srt-edit-player/src/lib/data_process.js");
    const [project] = await getJsonDataList(projectState.dirHandle);
    return project.scriptFiles.every((script) => !Array.isArray(script.inlineData));
  });
  await page.reload();
  await page.evaluate(async (url) => { window.__sampleStore = await import(url); }, storeModuleUrl);
  await page.getByRole("button", { name: "\u30d5\u30a9\u30eb\u30c0\u3092\u958b\u304f", exact: true }).click();
  await page.waitForFunction((marker) => document.querySelector(".editor")?.textContent.includes(marker), marker, { timeout: 120000 });
  report.persistence.afterMetadataSaveAndAppReload = true;
  const reloadScreenshot = path.join(output, "sample-reloaded.png");
  await page.screenshot({ path: reloadScreenshot, fullPage: true });
  report.screenshots.push(reloadScreenshot);
  assert.deepEqual(report.pageErrors, []);
  report.passed = true;
} catch (error) {
  report.passed = false;
  report.failure = { name: error.name, message: error.message, stack: error.stack };
  const failureScreenshot = path.join(output, "sample-failure.png");
  await page.screenshot({ path: failureScreenshot, fullPage: true }).catch(() => {});
  report.screenshots.push(failureScreenshot);
  process.exitCode = 1;
} finally {
  await context.close().catch(() => {});
  await browser.close().catch(() => {});
  report.afterHashes = await hashes();
  report.originalHashesUnchanged = JSON.stringify(beforeHashes) === JSON.stringify(report.afterHashes);
  if (!report.originalHashesUnchanged) process.exitCode = 1;
  await writeFile(path.join(output, "report.json"), JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify({
    passed: report.passed, originalHashesUnchanged: report.originalHashesUnchanged,
    loaded: report.loaded, playback: report.playback, persistence: report.persistence,
    failure: report.failure, report: path.join(output, "report.json"), screenshots: report.screenshots,
  }, null, 2));
}
