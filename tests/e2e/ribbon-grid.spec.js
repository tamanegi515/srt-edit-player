import { expect, test } from "@playwright/test";

async function openRibbon(page) {
  await page.goto("/srt-edit-player/");
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator(".ribbon-area")).toHaveCount(5);
}

async function geometry(page) {
  return page.locator(".ribbonview").evaluate(ribbon => {
    const panels = [...ribbon.querySelectorAll(".ribbon-area")];
    const bounds = panels.map(panel => panel.getBoundingClientRect());
    const failures = [];
    panels.forEach((panel, index) => {
      const box = bounds[index];
      for (const control of panel.querySelectorAll('select, input[type="text"], input[type="number"], input[type="range"], button, .CheckButtonArea label, .radio-tile')) {
        const rect = control.getBoundingClientRect();
        if (rect.height !== 28) failures.push(`${index}: ${control.tagName} height ${rect.height}`);
        if (control.matches('input[type="number"]') && rect.width !== 50) failures.push(`${index}: numeric field width ${rect.width}`);
        if (rect.left < box.left || rect.right > box.right || rect.top < box.top || rect.bottom > box.bottom) {
          failures.push(`${index}: ${control.tagName} outside panel`);
        }
      }
      for (const row of panel.querySelectorAll(".ribbon-row")) {
        const rowBox = row.getBoundingClientRect();
        const children = [...row.children].map(child => child.getBoundingClientRect());
        children.forEach((child, childIndex) => {
          if (child.top < rowBox.top || child.bottom > rowBox.bottom) failures.push(`${index}: child outside row`);
          if (childIndex && Math.abs(child.left - children[childIndex - 1].right - 6) > 1) {
            failures.push(`${index}: inconsistent field gap`);
          }
        });
        const walker = document.createTreeWalker(row, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) {
          const node = walker.currentNode;
          if (!node.textContent.trim() || node.parentElement.closest("select")) continue;
          const range = document.createRange();
          range.selectNodeContents(node);
          const text = range.getBoundingClientRect();
          const parent = node.parentElement.getBoundingClientRect();
          if (text.right > parent.right + 1) failures.push(`${index}: text exceeds field: ${node.textContent.trim()}`);
          if (node.nextSibling instanceof HTMLElement && node.nextSibling.matches("input, select")) {
            if (node.nextSibling.getBoundingClientRect().left - text.right < 5) failures.push(`${index}: text touches control`);
          }
        }
      }
    });
    return {
      height: ribbon.getBoundingClientRect().height,
      verticalOverflow: ribbon.scrollHeight - ribbon.clientHeight,
      widths: bounds.map(box => box.width),
      gaps: bounds.slice(1).map((box, index) => box.left - bounds[index].right),
      titleTops: panels.map(panel => panel.querySelector(".area-title").getBoundingClientRect().top),
      rowTops: panels.map(panel => [...panel.querySelectorAll(".ribbon-row")].map(row => row.getBoundingClientRect().top)),
      failures,
    };
  });
}

for (const width of [1920, 1366, 768, 390]) {
  test(`ribbon grid stays aligned and scrollable at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await openRibbon(page);
    await expect(page.locator(".ribbonview table, .ribbonview br")).toHaveCount(0);
    await expect(page.locator(".area-title")).toHaveText([
      "- position -", "- style -", "- font -", "- outline -", "- shadow -",
    ]);
    const metrics = await geometry(page);
    expect(metrics.height).toBeLessThanOrEqual(145);
    expect(metrics.verticalOverflow).toBe(0);
    expect(metrics.widths).toEqual([300, 260, 304, 362, 368]);
    expect(metrics.gaps).toEqual([14, 14, 14, 14]);
    expect(new Set(metrics.titleTops).size).toBe(1);
    expect(new Set(metrics.rowTops.map(rows => rows[0])).size).toBe(1);
    expect(metrics.rowTops.map(rows => rows.length)).toEqual([3, 2, 2, 2, 3]);
    for (const rows of metrics.rowTops) {
      rows.slice(1).forEach((top, index) => expect(top - rows[index]).toBe(32));
    }
    expect(metrics.failures).toEqual([]);
    await testInfo.attach("geometry", { body: JSON.stringify(metrics, null, 2), contentType: "application/json" });
    await page.screenshot({ path: testInfo.outputPath("ribbon-left.png") });
    const ribbon = page.locator(".ribbonview");
    await ribbon.evaluate(node => { node.scrollLeft = node.scrollWidth; });
    expect(await ribbon.evaluate(node => node.scrollWidth - node.clientWidth - node.scrollLeft)).toBeLessThanOrEqual(1);
    const last = await page.locator(".ribbon-area").last().boundingBox();
    expect(last.x + last.width).toBeLessThanOrEqual(width);
    await page.screenshot({ path: testInfo.outputPath("ribbon-right.png") });
  });
}

test("long selections and validation errors do not resize the grid", async ({ page }) => {
  await openRibbon(page);
  const before = await geometry(page);
  await page.evaluate(async () => {
    const resource = performance.getEntriesByType("resource").find(entry => entry.name.includes("/src/lib/store.svelte.js"));
    const store = await import(resource.name);
    const project = store.getActiveJsonData();
    project.scriptFiles[0].name = "Long track name ".repeat(40);
  });
  const font = page.getByRole("combobox", { name: "フォント", exact: true });
  const longest = await font.locator("option").evaluateAll(options => options.reduce((a, b) => a.length > b.value.length ? a : b.value, ""));
  await font.selectOption(longest);
  for (const slider of await page.locator('.ribbonview input[type="range"]').all()) await slider.fill("100");
  await page.getByTestId("new-style-key").fill("long_style_".repeat(20));
  await page.getByTestId("add-style-key").click();
  await expect(page.locator(".style-panel select").last()).toHaveValue("long_style_".repeat(20));
  await page.getByTestId("new-style-key").fill("invalid key!");
  await page.getByTestId("add-style-key").click();
  await expect(page.locator(".style-create-error")).toBeVisible();
  const after = await geometry(page);
  expect(after).toEqual(before);
  for (const select of await page.locator(".ribbonview select").all()) {
    await expect(select).toHaveCSS("text-overflow", "ellipsis");
  }
  const error = page.locator(".style-create-error");
  expect(await error.evaluate(node => node.getBoundingClientRect().bottom <= node.closest(".ribbon-area").getBoundingClientRect().bottom)).toBe(true);
});

test("emphasis controls keep bindings and use inherited pressed material", async ({ page }) => {
  await openRibbon(page);
  for (const id of ["StyleBoldButton", "StyleItalicButton"]) {
    const input = page.locator(`#${id}`);
    const label = page.locator(`label[for="${id}"]`);
    const initial = await input.isChecked();
    const before = await label.boundingBox();
    await label.click();
    await expect(input).toBeChecked({ checked: !initial });
    await label.click();
    await expect(input).toBeChecked({ checked: initial });
    await input.check({ force: true });
    await expect.poll(() => label.evaluate(node => {
      const probe = document.createElement("span");
      probe.style.boxShadow = "var(--input-shadow)";
      node.append(probe);
      const matches = getComputedStyle(node).boxShadow === getComputedStyle(probe).boxShadow;
      probe.remove();
      return matches;
    })).toBe(true);
    await expect(label).not.toHaveCSS("background-image", "none");
    expect((await label.boundingBox()).height).toBe(before.height);
  }
});
