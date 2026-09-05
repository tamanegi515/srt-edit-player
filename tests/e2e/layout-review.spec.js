import { expect, test } from "@playwright/test";

const viewports = [
  { width: 1664, height: 1000 },
  { width: 1366, height: 768 },
  { width: 1000, height: 700 },
  { width: 800, height: 700 },
];

// Pre-review ribbon measured 154.1875px including its horizontal scrollbar.
const ribbonHeightCeiling = 155;
const trackCount = 3;
const clipCount = 24;

async function installLayoutFixture(page) {
  const timestamp = (seconds) => `00:${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")},000`;
  const project = {
    name: "layout.vc_json",
    scriptFiles: Array.from({ length: trackCount }, (_, track) => ({
      name: `Track ${track + 1}`,
      filePath: `captions-${track + 1}.json`,
      inlineData: Array.from({ length: clipCount }, (_, clip) => ({
        startTime: clip * 4,
        endTime: clip * 4 + 4,
        startTimeStr: timestamp(clip * 4),
        endTimeStr: timestamp(clip * 4 + 4),
        text: `Track ${track + 1}, caption ${clip + 1}.\nSecond line for editor scrolling.`,
      })),
    })),
  };
  await page.addInitScript((project) => {
    const entry = {
      kind: "file",
      name: project.name,
      async getFile() {
        return new File([JSON.stringify(project)], project.name, { type: "application/json" });
      },
    };
    window.showDirectoryPicker = async () => ({
      name: "layout-fixture",
      async requestPermission() { return "granted"; },
      async *values() { yield entry; },
      async getFileHandle(name) {
        if (name === entry.name) return entry;
        throw new DOMException(`Missing fixture file: ${name}`, "NotFoundError");
      },
    });
  }, project);
}

async function settled(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}

async function layoutViolations(page) {
  return page.evaluate(({ ribbonHeightCeiling }) => {
    const failures = [];
    const tolerance = 1;
    const rect = (element) => element.getBoundingClientRect();
    const inside = (name, inner, outer, axes = "xy") => {
      if (axes.includes("x") && (inner.left < outer.left - tolerance || inner.right > outer.right + tolerance)) {
        failures.push(`${name}: horizontal bounds ${inner.left}..${inner.right} outside ${outer.left}..${outer.right}`);
      }
      if (axes.includes("y") && (inner.top < outer.top - tolerance || inner.bottom > outer.bottom + tolerance)) {
        failures.push(`${name}: vertical bounds ${inner.top}..${inner.bottom} outside ${outer.top}..${outer.bottom}`);
      }
    };
    const clientRect = (element) => {
      const bounds = rect(element);
      const left = bounds.left + element.clientLeft;
      const top = bounds.top + element.clientTop;
      return { left, top, right: left + element.clientWidth, bottom: top + element.clientHeight };
    };
    const main = document.querySelector("main");
    const mainStyle = getComputedStyle(main);
    const mainBounds = rect(main);
    const content = {
      left: mainBounds.left + parseFloat(mainStyle.paddingLeft),
      right: mainBounds.right - parseFloat(mainStyle.paddingRight),
      top: mainBounds.top + parseFloat(mainStyle.paddingTop),
      bottom: mainBounds.bottom - parseFloat(mainStyle.paddingBottom),
    };
    const root = document.scrollingElement;
    if (root.scrollWidth > root.clientWidth || root.scrollHeight > root.clientHeight) {
      failures.push(`document overflow: ${root.scrollWidth}x${root.scrollHeight} > ${root.clientWidth}x${root.clientHeight}`);
    }
    for (const selector of [".app-toolbar", ".workspace-table", ".srt_area", ".track-shell", ".track-view"]) {
      const element = document.querySelector(selector);
      if (!element) {
        failures.push(`missing ${selector}`);
        continue;
      }
      inside(selector, rect(element), content);
      if (rect(element).height <= 0) failures.push(`${selector} collapsed`);
    }
    const editor = document.querySelector(".srt_area");
    const player = document.querySelector(".player-pane");
    const workspace = document.querySelector(".workspace-table");
    const timeline = document.querySelector(".track-shell");
    if (Math.abs(rect(editor).bottom - rect(player).bottom) > tolerance) {
      failures.push(`editor bottom ${rect(editor).bottom} does not align with player bottom ${rect(player).bottom}`);
    }
    if (Math.abs(rect(editor).bottom - rect(workspace).bottom) > tolerance) failures.push("unused space below editor in workspace");
    const mainGap = parseFloat(mainStyle.rowGap);
    if (Math.abs(rect(timeline).top - rect(workspace).bottom - mainGap) > tolerance) failures.push("unexpected gap before full-width timeline");
    if (Math.abs(rect(timeline).left - content.left) > tolerance || Math.abs(rect(timeline).right - content.right) > tolerance) failures.push("timeline is not full-width");
    if (Math.abs(rect(timeline).bottom - content.bottom) > tolerance) failures.push("unused space below timeline");
    const ribbon = document.querySelector(".ribbonview");
    if (ribbon) {
      if (rect(ribbon).height > ribbonHeightCeiling) failures.push(`ribbon height ${rect(ribbon).height} exceeds ${ribbonHeightCeiling}`);
      if (ribbon.scrollHeight > ribbon.clientHeight + tolerance) failures.push("ribbon content overflows vertically");
      const ribbonClient = clientRect(ribbon);
      for (const [index, panel] of [...ribbon.querySelectorAll(".ribbon-area")].entries()) {
        inside(`ribbon panel ${index} including scrollbar clearance`, rect(panel), ribbonClient, "y");
        for (const control of panel.querySelectorAll("input, select, button, .slider-container, .area-title, label")) {
          if (!control.getClientRects().length || getComputedStyle(control).visibility === "hidden") continue;
          inside(`ribbon ${index} ${control.tagName}.${control.className}`, rect(control), ribbonClient, "y");
          inside(`ribbon ${index} control inside panel`, rect(control), rect(panel));
        }
      }
    }
    const trackView = document.querySelector(".track-view");
    const trackScroll = document.querySelector(".right-subpanel");
    inside("timeline scroll surface", rect(trackScroll), clientRect(trackView));
    // Horizontal scrolling is intentional; every track must clear the scrollbar vertically.
    for (const [index, row] of [...trackScroll.querySelectorAll(":scope > .track")].entries()) {
      inside(`timeline row ${index}`, rect(row), clientRect(trackScroll), "y");
    }
    for (const [index, column] of [...document.querySelectorAll(".editor-column")].entries()) {
      const surface = column.querySelector(".box, .empty-editor-state");
      if (!surface) {
        failures.push(`editor column ${index} missing surface`);
        continue;
      }
      inside(`editor surface ${index}`, rect(surface), clientRect(column), "y");
      if (Math.abs(rect(surface).bottom - clientRect(column).bottom) > tolerance) {
        failures.push(`editor surface ${index} does not fill column bottom`);
      }
    }
    for (const control of document.querySelectorAll(".app-toolbar button, .editor-toolbar button, .media-controls button, .track-controls button")) {
      const bounds = rect(control);
      inside(`button ${control.title || control.textContent.trim()}`, bounds, content);
      const hit = document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
      if (!hit || (hit !== control && !control.contains(hit))) {
        failures.push(`button ${control.title || control.textContent.trim()} is occluded`);
      }
    }
    return failures;
  }, { ribbonHeightCeiling });
}

async function capture(page, testInfo, name) {
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path });
  await testInfo.attach(name, { path, contentType: "image/png" });
}

for (const viewport of viewports) {
  test.describe(`${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport });

    test("empty layout keeps ribbon, timeline and editor within the viewport", async ({ page }, testInfo) => {
      await page.goto("/");
      await expect(page.locator(".empty-editor-state")).toBeVisible();
      await settled(page);
      await capture(page, testInfo, "empty-layout");
      expect(await layoutViolations(page)).toEqual([]);
    });

    test("loaded tracks, multiple columns and scrollbars remain reachable", async ({ page }, testInfo) => {
      await installLayoutFixture(page);
      await page.goto("/");
      await page.getByRole("button", { name: "フォルダを開く", exact: true }).click();
      await expect(page.locator(".editor")).toHaveCount(clipCount);
      await expect(page.locator(".right-subpanel > .track")).toHaveCount(trackCount + 1);
      const zoom = page.locator(".track-controls input[type='range']");
      await zoom.focus();
      await zoom.press("End");
      await settled(page);
      await capture(page, testInfo, "loaded-layout");
      expect.soft(await layoutViolations(page)).toEqual([]);

      const trackScroll = page.locator(".right-subpanel");
      expect(await trackScroll.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
      await trackScroll.evaluate((el) => { el.scrollLeft = el.scrollWidth; });
      await expect.poll(() => trackScroll.evaluate((el) => Math.abs(el.scrollWidth - el.clientWidth - el.scrollLeft))).toBeLessThanOrEqual(1);
      const lastClip = page.locator(".timeline").last().locator(".clip").last();
      const clipBounds = await lastClip.boundingBox();
      const scrollBounds = await trackScroll.boundingBox();
      expect(clipBounds.x + clipBounds.width).toBeLessThanOrEqual(scrollBounds.x + scrollBounds.width + 1);
      expect(clipBounds.x + clipBounds.width).toBeGreaterThan(scrollBounds.x);

      const ribbon = page.locator(".ribbonview");
      await ribbon.evaluate((el) => { el.scrollLeft = el.scrollWidth; });
      await expect.poll(() => ribbon.evaluate((el) => Math.abs(el.scrollWidth - el.clientWidth - el.scrollLeft))).toBeLessThanOrEqual(1);
      const lastPanel = await page.locator(".ribbon-area").last().boundingBox();
      expect(lastPanel.x + lastPanel.width).toBeLessThanOrEqual(viewport.width);
      expect(lastPanel.x + lastPanel.width).toBeGreaterThan(0);

      await page.getByRole("button", { name: "列を増やす", exact: true }).click();
      await expect(page.locator(".editor-column")).toHaveCount(2);
      await settled(page);
      expect.soft(await layoutViolations(page)).toEqual([]);
      const columns = page.locator(".editor-columns");
      await columns.evaluate((el) => { el.scrollLeft = el.scrollWidth; });
      await page.locator(".box").last().evaluate((el) => { el.scrollTop = el.scrollHeight; });
      await expect(page.locator(".editor-column").last().locator(".editor").last()).toBeInViewport({ ratio: 1 });
      await capture(page, testInfo, "scrolled-multiple-columns");
    });

    test("shared buttons retain dimensions and own no external margins", async ({ page }) => {
      await page.goto("/");
      await settled(page);
      const violations = await page.locator(".nmorph_button").evaluateAll((buttons) => buttons.flatMap((button) => {
        const style = getComputedStyle(button);
        const bounds = button.getBoundingClientRect();
        const issues = [];
        if ([style.marginTop, style.marginRight, style.marginBottom, style.marginLeft].some((value) => parseFloat(value) !== 0)) {
          issues.push(`${button.title || button.textContent.trim()}: margin ${style.margin}`);
        }
        if (![28, 32].some((height) => Math.abs(bounds.height - height) < 1)) {
          issues.push(`${button.title || button.textContent.trim()}: height ${bounds.height}`);
        }
        if (button.matches(":has(> .material-symbols-outlined:only-child)") && Math.abs(bounds.width - bounds.height) > 1) {
          issues.push(`${button.title || button.textContent.trim()}: icon button is ${bounds.width}x${bounds.height}`);
        }
        return issues;
      }));
      expect.soft(violations).toEqual([]);
      const fieldViolations = await page.locator([
        ".app-toolbar select",
        ".editor-toolbar input",
        ".editor-toolbar select",
        ".ribbonview input[type='text']",
        ".ribbonview input[type='number']",
        ".ribbonview select",
      ].join(", ")).evaluateAll((fields) => fields.flatMap((field) => {
        const style = getComputedStyle(field);
        const bounds = field.getBoundingClientRect();
        const issues = [];
        if ([style.marginTop, style.marginRight, style.marginBottom, style.marginLeft].some((value) => parseFloat(value) !== 0)) {
          issues.push(`${field.tagName}.${field.className}: margin ${style.margin}`);
        }
        if (![28, 32].some((height) => Math.abs(bounds.height - height) < 1)) {
          issues.push(`${field.tagName}.${field.className}: height ${bounds.height}`);
        }
        return issues;
      }));
      expect.soft(fieldViolations).toEqual([]);
      const open = page.getByRole("button", { name: "フォルダを開く", exact: true });
      const initial = await open.boundingBox();
      await open.hover();
      expect(await open.boundingBox()).toEqual(initial);
      await open.focus();
      expect(await open.boundingBox()).toEqual(initial);
      await expect(open).toHaveCSS("outline-style", "solid");
    });
  });
}
