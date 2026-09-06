import { expect, test } from "@playwright/test";
import { getDefaultJsonData } from "../../src/lib/data_process.js";

async function loadControlsFixture(page, { noImage = false, noAudio = false, tracks = 1 } = {}) {
  const project = getDefaultJsonData();
  project.name = "controls.vc_json";
  project.audioFilePath = noAudio ? "" : "controls.wav";
  project.imageSrtPath = noImage ? "" : "images.srt";
  project.scriptFiles[0].filePath = "captions.srt";
  project.scriptFiles = Array.from({ length: tracks }, () => structuredClone(project.scriptFiles[0]));
  await page.addInitScript((project) => {
    // A real 12-second PCM WAV, generated here so no local media is required.
    const rate = 8000;
    const samples = rate * 12;
    const wav = new ArrayBuffer(44 + samples * 2);
    const view = new DataView(wav);
    const ascii = (offset, text) => [...text].forEach((char, i) => view.setUint8(offset + i, char.charCodeAt(0)));
    ascii(0, "RIFF");
    view.setUint32(4, wav.byteLength - 8, true);
    ascii(8, "WAVE");
    ascii(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, rate, true);
    view.setUint32(28, rate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    ascii(36, "data");
    view.setUint32(40, samples * 2, true);
    for (let i = 0; i < samples; i++) view.setInt16(44 + i * 2, Math.sin(i * 2 * Math.PI * 440 / rate) * 1000, true);
    const png = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII="), char => char.charCodeAt(0));
    const files = new Map([
      [project.name, new File([JSON.stringify(project)], project.name, { type: "application/json" })],
      ["controls.wav", new File([wav], "controls.wav", { type: "audio/wav" })],
      ["captions.srt", new File(["1\n00:00:00,000 --> 00:00:12,000\nControls fixture\n"], "captions.srt")],
      ["images.srt", new File(["1\n00:00:00,000 --> 00:00:04,000\na.png\n\n2\n00:00:04,000 --> 00:00:08,000\nb.png\n\n3\n00:00:08,000 --> 00:00:12,000\nc.png\n"], "images.srt")],
      ...["a.png", "b.png", "c.png"].map(name => [name, new File([png], name, { type: "image/png" })]),
    ]);
    const gates = new Map();
    window.__imageReads = {};
    window.__holdImage = name => {
      let release;
      const promise = new Promise(resolve => { release = resolve; });
      gates.set(name, { promise, release });
    };
    window.__releaseImage = name => {
      gates.get(name)?.release();
      gates.delete(name);
    };
    const entry = name => ({
      kind: "file", name,
      async getFile() {
        window.__imageReads[name] = (window.__imageReads[name] ?? 0) + 1;
        await gates.get(name)?.promise;
        return files.get(name);
      },
      async createWritable() {
        let content;
        return {
          async write(value) { content = value; },
          async close() { files.set(name, new File([content], name)); },
        };
      },
    });
    window.showDirectoryPicker = async () => ({
      kind: "directory", name: "controls-fixture",
      async requestPermission() { return "granted"; },
      async queryPermission() { return "granted"; },
      async *values() { for (const name of files.keys()) yield entry(name); },
      async getFileHandle(name, options = {}) {
        if (!files.has(name)) {
          if (!options.create) throw new DOMException("Missing fixture file", "NotFoundError");
          files.set(name, new File([], name));
        }
        return entry(name);
      },
    });
    window.__readFixture = async name => files.get(name)?.text();
  }, project);
  await page.goto("/");
  await page.getByRole("button", { name: /フォルダを開く/ }).first().click();
  await page.evaluate(async () => {
    const resource = performance.getEntriesByType("resource").find(entry => entry.name.includes("/src/lib/store.svelte.js"));
    window.controlsStore = await import(resource.name);
  });
  if (!noAudio) await expect.poll(() => page.evaluate(async () => {
    const { useAudio } = window.controlsStore;
    return useAudio.audio?.duration;
  })).toBe(12);
  await expect(page.locator(".editor").first()).toBeVisible();
  if (!noImage) await expect(page.locator(".media-image")).toBeVisible();
}

async function audioValue(page, property) {
  return page.evaluate(async property => {
    const { useAudio } = window.controlsStore;
    return useAudio.audio[property];
  }, property);
}

async function expectAudioMatches(page, slider, property) {
  const value = Number(await slider.inputValue());
  await expect.poll(() => audioValue(page, property)).toBeCloseTo(value, 5);
  await expect.poll(() => page.evaluate(async property => {
    const { mediaState, projectState } = window.controlsStore;
    return property === "currentTime"
      ? projectState.jsonDataList[projectState.mediaIndex].seekTime
      : mediaState.media[property];
  }, property)).toBeCloseTo(value, 5);
}

for (const control of [
  { label: "再生位置", property: "currentTime", value: "3.2", wheel: 1, min: "0", max: "12" },
  { label: "音量", property: "volume", value: "0.35", wheel: -0.01, min: "0", max: "1" },
  { label: "倍速", property: "playbackRate", value: "1.35", wheel: -0.05, min: "0.5", max: "3" },
]) {
  test(`${control.property} uses the final input value for click, drag, keyboard and wheel`, async ({ page }) => {
    await loadControlsFixture(page);
    if (control.property === "playbackRate") await page.getByRole("button", { name: "倍速を調整", exact: true }).click();
    const slider = page.getByRole("slider", { name: control.label, exact: true });
    await slider.fill(control.value);
    await expectAudioMatches(page, slider, control.property);
    const box = await slider.boundingBox();
    await slider.click({ position: { x: box.width * 0.6, y: box.height / 2 } });
    await expectAudioMatches(page, slider, control.property);
    await page.mouse.move(box.x + box.width * 0.6, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.8, box.y + box.height / 2, { steps: 8 });
    await page.mouse.up();
    await expectAudioMatches(page, slider, control.property);
    await slider.press("ArrowLeft");
    await expectAudioMatches(page, slider, control.property);
    await slider.fill(control.value);
    await slider.evaluate(node => {
      window.__sliderInputs = 0;
      node.addEventListener("input", () => { window.__sliderInputs++; });
    });
    await slider.hover();
    await page.mouse.wheel(0, 100);
    await expect.poll(async () => Number(await slider.inputValue())).toBeCloseTo(Number(control.value) + control.wheel, 5);
    await expectAudioMatches(page, slider, control.property);
    expect(await page.evaluate(() => window.__sliderInputs)).toBe(1);
    await page.keyboard.down("Shift");
    await page.mouse.wheel(0, -100);
    await page.keyboard.up("Shift");
    const multiplier = control.property === "currentTime" ? 1 : 5;
    await expect.poll(async () => Number(await slider.inputValue())).toBeCloseTo(Number(control.value) + control.wheel - control.wheel * multiplier, 5);
    await expectAudioMatches(page, slider, control.property);
    for (const [boundary, delta] of [[control.min, -Math.sign(control.wheel) * 100], [control.max, Math.sign(control.wheel) * 100]]) {
      await slider.fill(boundary);
      await slider.hover();
      await page.mouse.wheel(0, delta);
      await expect(slider).toHaveValue(boundary);
      await expectAudioMatches(page, slider, control.property);
    }
  });
}

test("rate icon wheel updates audio and shared rate without seeking or scrolling", async ({ page }) => {
  await loadControlsFixture(page);
  const trigger = page.getByRole("button", { name: "倍速を調整", exact: true });
  const rate = page.getByRole("slider", { name: "倍速", exact: true });
  const seek = page.getByRole("slider", { name: "再生位置", exact: true });
  const position = await seek.inputValue();
  await trigger.hover();
  await page.mouse.wheel(0, -100);
  await expect(rate).toHaveValue("1.05");
  await expectAudioMatches(page, rate, "playbackRate");
  await page.keyboard.down("Shift");
  await page.mouse.wheel(0, 100);
  await page.keyboard.up("Shift");
  await expect(rate).toHaveValue("0.8");
  await expectAudioMatches(page, rate, "playbackRate");
  for (const [value, delta] of [["0.5", 100], ["3", -100]]) {
    await rate.fill(value);
    await trigger.hover();
    await page.mouse.wheel(0, delta);
    await expect(rate).toHaveValue(value);
    await expectAudioMatches(page, rate, "playbackRate");
  }
  await expect(seek).toHaveValue(position);
  expect(await page.evaluate(() => scrollY)).toBe(0);
});

test("the generated WAV really plays and stage wheel seeks it", async ({ page }) => {
  await loadControlsFixture(page);
  const seek = page.getByRole("slider", { name: "再生位置", exact: true });
  await seek.fill("2");
  await page.getByTestId("toggle-playback").click();
  await expect.poll(() => audioValue(page, "paused")).toBe(false);
  await expect.poll(() => audioValue(page, "currentTime")).toBeGreaterThan(2.05);
  await page.getByTestId("toggle-playback").click();
  await expect.poll(() => audioValue(page, "paused")).toBe(true);
  await seek.fill("4");
  await page.locator(".media-stage").hover();
  await page.mouse.wheel(0, 100);
  await expect(seek).toHaveValue("5");
  await expectAudioMatches(page, seek, "currentTime");
});

test("font wheel stays in the option list and serializes as a string", async ({ page }) => {
  await loadControlsFixture(page);
  const font = page.getByRole("combobox", { name: "フォント", exact: true });
  const options = await font.locator("option").evaluateAll(nodes => nodes.map(node => node.value));
  await font.selectOption(options[1]);
  await font.hover();
  await page.mouse.wheel(0, 100);
  await expect(font).toHaveValue(options[0]);
  await page.mouse.wheel(0, 100);
  await expect(font).toHaveValue(options[0]);
  await page.mouse.wheel(0, -100);
  await expect(font).toHaveValue(options[1]);
  await font.selectOption(options.at(-1));
  await page.mouse.wheel(0, -100);
  await expect(font).toHaveValue(options.at(-1));
  const styles = await page.evaluate(async () => {
    const { projectState } = window.controlsStore;
    return JSON.parse(JSON.stringify(projectState.jsonDataList[projectState.mediaIndex].styles));
  });
  for (const style of Object.values(styles)) {
    expect(typeof style.font).toBe("string");
    expect(options).toContain(style.font);
  }
});

async function currentImagePath(page) {
  return page.evaluate(() => window.controlsStore.mediaState.media.image_data.currentImagePath);
}

test("latest auto image wins when same-media requests finish in reverse order", async ({ page }) => {
  await loadControlsFixture(page);
  await page.getByTitle("画像自動切り替え").locator("input").check({ force: true });
  await page.evaluate(() => { window.__holdImage("b.png"); window.__holdImage("c.png"); });
  const seek = page.getByRole("slider", { name: "再生位置", exact: true });
  await seek.fill("5");
  await expect.poll(() => page.evaluate(() => window.__imageReads["b.png"])).toBeGreaterThan(0);
  await seek.fill("9");
  await expect.poll(() => page.evaluate(() => window.__imageReads["c.png"])).toBeGreaterThan(0);
  await page.evaluate(() => window.__releaseImage("c.png"));
  await expect.poll(() => currentImagePath(page)).toBe("c.png");
  const latestUrl = await page.locator(".media-image").getAttribute("src");
  await page.evaluate(() => window.__releaseImage("b.png"));
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  expect(await currentImagePath(page)).toBe("c.png");
  await expect(page.locator(".media-image")).toHaveAttribute("src", latestUrl);
});

test("returning to the displayed image cancels a pending auto image", async ({ page }) => {
  await loadControlsFixture(page);
  await page.getByTitle("画像自動切り替え").locator("input").check({ force: true });
  await page.evaluate(() => window.__holdImage("b.png"));
  const seek = page.getByRole("slider", { name: "再生位置", exact: true });
  await seek.fill("5");
  await expect.poll(() => page.evaluate(() => window.__imageReads["b.png"])).toBeGreaterThan(0);
  await seek.fill("1");
  await page.evaluate(() => window.__releaseImage("b.png"));
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  expect(await currentImagePath(page)).toBe("a.png");
});

test("manual image requests share the latest-request token", async ({ page }) => {
  await loadControlsFixture(page);
  await page.getByTitle("画像自動切り替え").locator("input").uncheck({ force: true });
  await page.evaluate(() => window.__holdImage("b.png"));
  const next = page.locator(".image-control-group button").last();
  await next.click();
  await expect.poll(() => page.evaluate(() => window.__imageReads["b.png"])).toBeGreaterThan(0);
  await next.click();
  await expect.poll(() => currentImagePath(page)).toBe("c.png");
  await page.evaluate(() => window.__releaseImage("b.png"));
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  expect(await currentImagePath(page)).toBe("c.png");
});

test("cancelled manual images keep the committed index and next navigation consistent", async ({ page }) => {
  await loadControlsFixture(page);
  const auto = page.getByTitle("画像自動切り替え").locator("input");
  const next = page.locator(".image-control-group button").last();
  const imageState = () => page.evaluate(() => {
    const image = window.controlsStore.mediaState.media.image_data;
    return { path: image.currentImagePath, index: image.currentId };
  });
  await auto.uncheck({ force: true });
  const initialUrl = await page.locator(".media-image").getAttribute("src");
  await page.evaluate(() => {
    window.__imageURLs = { created: [], revoked: [] };
    const create = URL.createObjectURL.bind(URL);
    const revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = blob => {
      const url = create(blob);
      window.__imageURLs.created.push(url);
      return url;
    };
    URL.revokeObjectURL = url => { window.__imageURLs.revoked.push(url); revoke(url); };
    window.__holdImage("b.png");
  });
  await next.click();
  await expect.poll(() => page.evaluate(() => window.__imageReads["b.png"])).toBeGreaterThan(0);
  expect(await imageState()).toEqual({ path: "a.png", index: 0 });
  await auto.check({ force: true });
  await page.evaluate(() => window.__releaseImage("b.png"));
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  expect(await imageState()).toEqual({ path: "a.png", index: 0 });
  await expect(page.locator(".image-control-group button").first()).toBeDisabled();
  await expect(page.locator(".media-image")).toHaveAttribute("src", initialUrl);
  expect(await page.evaluate(() => window.__imageURLs)).toEqual({ created: [], revoked: [] });
  await next.click();
  await expect.poll(imageState).toEqual({ path: "b.png", index: 1 });
  expect(await page.evaluate(() => window.__imageURLs.revoked)).toEqual([initialUrl]);
  expect(await page.evaluate(() => window.__imageURLs.created.length)).toBe(1);
});

test("seeking with image auto off does not cancel a manual image request", async ({ page }) => {
  await loadControlsFixture(page);
  await page.getByTitle("画像自動切り替え").locator("input").uncheck({ force: true });
  await page.evaluate(() => window.__holdImage("b.png"));
  await page.locator(".image-control-group button").last().click();
  await expect.poll(() => page.evaluate(() => window.__imageReads["b.png"])).toBeGreaterThan(0);
  await page.getByRole("slider", { name: "再生位置", exact: true }).fill("9");
  await page.evaluate(() => window.__releaseImage("b.png"));
  await expect.poll(() => currentImagePath(page)).toBe("b.png");
});

test("auto clips with the same image path advance the committed index without reloading", async ({ page }) => {
  await loadControlsFixture(page);
  await page.getByTitle("画像自動切り替え").locator("input").check({ force: true });
  const initialUrl = await page.locator(".media-image").getAttribute("src");
  const initialReads = await page.evaluate(() => window.__imageReads["a.png"]);
  await page.evaluate(() => {
    const clip = window.controlsStore.mediaState.media.srt_data.find(track => track.isImageTrack).data[1];
    clip.text = "a.png";
    clip.sentences = ["a.png"];
  });
  await page.getByRole("slider", { name: "再生位置", exact: true }).fill("5");
  await expect.poll(() => page.evaluate(() => window.controlsStore.mediaState.media.image_data.currentId)).toBe(1);
  expect(await currentImagePath(page)).toBe("a.png");
  await expect(page.locator(".media-image")).toHaveAttribute("src", initialUrl);
  expect(await page.evaluate(() => window.__imageReads["a.png"])).toBe(initialReads);
  await page.locator(".image-control-group button").last().click();
  await expect.poll(() => currentImagePath(page)).toBe("c.png");
});

test("splitter-consumed arrow keys resize without also seeking", async ({ page }) => {
  await loadControlsFixture(page);
  const seek = page.getByRole("slider", { name: "再生位置", exact: true });
  await seek.fill("5");
  const splitter = page.getByRole("separator", { name: "プレイヤーと編集エリアの境界", exact: true });
  const originalWidth = Number(await splitter.getAttribute("aria-valuenow"));
  await splitter.press("ArrowRight");
  await expect(splitter).toHaveAttribute("aria-valuenow", String(originalWidth - 10));
  await expect(seek).toHaveValue("5");
  await expectAudioMatches(page, seek, "currentTime");
  await splitter.press("Shift+ArrowLeft");
  await expect(splitter).toHaveAttribute("aria-valuenow", String(originalWidth + 30));
  await expect(seek).toHaveValue("5");
  await expectAudioMatches(page, seek, "currentTime");
  await splitter.evaluate(element => element.blur());
  await page.keyboard.press("ArrowRight");
  await expect(seek).toHaveValue("6");
  await expectAudioMatches(page, seek, "currentTime");
});

test("ruler redraws to the viewport and splitter width at every zoom", async ({ page }) => {
  await loadControlsFixture(page);
  const zoom = page.getByRole("slider", { name: "タイムライン拡大率", exact: true });
  const assertRulerWidth = async () => expect.poll(() => page.evaluate(() => {
    const canvas = document.querySelector(".tickmark");
    return canvas.width - document.querySelector(".right-subpanel").clientWidth;
  })).toBe(0);
  for (const width of [1366, 1600, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    await assertRulerWidth();
    for (const value of ["0.5", "2", "8", "20"]) {
      await zoom.fill(value);
      await assertRulerWidth();
      const pixels = await page.locator(".tickmark").evaluate(canvas => {
        const data = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
        let painted = 0;
        for (let i = 3; i < data.length; i += 4) if (data[i]) painted++;
        return painted;
      });
      expect(pixels).toBeGreaterThan(30);
    }
  }
  const before = await page.locator(".tickmark").evaluate(canvas => canvas.width);
  const splitter = await page.locator(".track_resizer").boundingBox();
  await page.mouse.move(splitter.x + splitter.width / 2, splitter.y + 10);
  await page.mouse.down();
  await page.mouse.move(splitter.x + 120, splitter.y + 10);
  await page.mouse.up();
  await assertRulerWidth();
  expect(await page.locator(".tickmark").evaluate(canvas => canvas.width)).toBeLessThan(before - 100);
});

test("shared sliders keep compact ribbon height and visible focus", async ({ page }, testInfo) => {
  await loadControlsFixture(page);
  for (const width of [1366, 1600, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    const ribbon = await page.locator(".ribbonview").boundingBox();
    expect(ribbon.height).toBeLessThanOrEqual(155);
    const controls = await page.locator(".ribbonview input[type=range]").evaluateAll(nodes => nodes.map(node => ({
      height: node.getBoundingClientRect().height,
      bottom: node.getBoundingClientRect().bottom,
      panelBottom: node.closest(".ribbon-area").getBoundingClientRect().bottom,
    })));
    for (const control of controls) {
      expect(control.height).toBe(28);
      expect(control.bottom).toBeLessThanOrEqual(control.panelBottom);
    }
  }
  const volume = page.getByRole("slider", { name: "音量", exact: true });
  await volume.focus();
  await volume.press("ArrowRight");
  await expect(volume).toHaveCSS("outline-style", "solid");
  const size = await volume.boundingBox();
  await volume.hover();
  expect((await volume.boundingBox()).height).toBe(size.height);
  await volume.evaluate(node => { node.disabled = true; });
  const before = await volume.inputValue();
  await page.mouse.wheel(0, 100);
  await expect(volume).toHaveValue(before);
  await expect(volume).toHaveCSS("cursor", "not-allowed");
  await page.screenshot({ path: testInfo.outputPath("controls-desktop.png"), fullPage: true });
});

test("short previews keep the full empty-state text and narrow player controls fit", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1000, height: 700 });
  await loadControlsFixture(page, { noImage: true, noAudio: true, tracks: 3 });
  const placeholder = page.locator(".media-placeholder");
  await expect(placeholder).toBeVisible();
  expect(await placeholder.evaluate(element => element.scrollHeight - element.clientHeight)).toBeLessThanOrEqual(1);
  const textBounds = await placeholder.locator("span").last().boundingBox();
  const stageBounds = await placeholder.boundingBox();
  expect(textBounds.y).toBeGreaterThanOrEqual(stageBounds.y);
  expect(textBounds.y + textBounds.height).toBeLessThanOrEqual(stageBounds.y + stageBounds.height);
  await page.screenshot({ path: testInfo.outputPath("controls-short-preview.png"), fullPage: true });
  await page.setViewportSize({ width: 752, height: 1000 });
  await page.locator(".media-player").evaluate(element => { element.style.width = "200px"; });
  const labels = page.locator(".volume-control");
  await expect(labels).toHaveCount(1);
  const violations = await labels.evaluateAll(labels => labels.flatMap(label => {
    const bounds = label.getBoundingClientRect();
    const panel = label.closest(".media-controls").getBoundingClientRect();
    return [
      ...(getComputedStyle(label).whiteSpace !== "nowrap" ? ["label wraps"] : []),
      ...(bounds.right > panel.right ? ["label overflows"] : []),
      ...[...label.children].flatMap(child => child.getBoundingClientRect().right > bounds.right + 1 ? ["control overflows"] : []),
    ];
  }));
  expect(violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("controls-narrow.png"), fullPage: true });
});

test("overflowing empty media scrolls without seeking but normal stage wheel still seeks", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 700 });
  await loadControlsFixture(page, { noImage: true, noAudio: true, tracks: 3 });
  const placeholder = page.locator(".media-placeholder");
  const seek = page.getByRole("slider", { name: "再生位置", exact: true });
  // Keep this an actual overflow scenario even when compact controls free more preview space.
  await page.locator(".media-stage").evaluate(element => { element.style.flex = "0 0 60px"; });
  await expect.poll(() => placeholder.evaluate(element => element.scrollHeight - element.clientHeight)).toBeGreaterThan(0);
  await placeholder.hover();
  await page.mouse.wheel(0, 100);
  await expect.poll(() => placeholder.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
  await expect(seek).toHaveValue("0");
  await page.mouse.wheel(0, 100);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await expect(seek).toHaveValue("0");
  await page.mouse.wheel(0, -100);
  await expect.poll(() => placeholder.evaluate(element => element.scrollTop)).toBe(0);
  await expect(seek).toHaveValue("0");

  await page.locator(".media-stage").hover({ position: { x: 2, y: 2 } });
  await page.mouse.wheel(0, 100);
  await expect(seek).toHaveValue("1");
  await page.locator(".media-stage").evaluate(element => { element.style.removeProperty("flex"); });
  await page.setViewportSize({ width: 1000, height: 1000 });
  await expect.poll(() => placeholder.evaluate(element => element.scrollHeight - element.clientHeight)).toBe(0);
  await placeholder.hover({ position: { x: 8, y: 8 } });
  await page.mouse.wheel(0, 100);
  await expect(seek).toHaveValue("2");
});
