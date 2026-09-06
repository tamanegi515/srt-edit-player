import { expect, test } from "@playwright/test";

for (const width of [1926, 1366, 1000, 390]) {
  test(`toolbar controls share rows, heights and spacing at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/srt-edit-player/");
    await expect(page.locator(".editor-toolbar")).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const issues = await page.evaluate(() => {
      const issues = [];
      for (const group of document.querySelectorAll(".app-toolbar .toolbar-group:not(.toggles), .toolbar-cluster")) {
        const controls = [...group.querySelectorAll("button, input, select")];
        const bounds = controls.map((control) => control.getBoundingClientRect());
        const parent = group.getBoundingClientRect();
        for (const [index, rect] of bounds.entries()) {
          if (Math.abs(rect.height - 32) > 0.5) issues.push(`height ${rect.height}`);
          if (Math.abs(rect.top - bounds[0].top) > 0.5) issues.push("unaligned row");
          if (rect.left < parent.left - 1 || rect.right > parent.right + 1) issues.push("group overflow");
          if (index && rect.left - bounds[index - 1].right < 5.5) issues.push("crowded controls");
        }
      }
      for (const field of document.querySelectorAll(".toggle-field")) {
        const text = field.querySelector(".head-text").getBoundingClientRect();
        const toggle = field.querySelector(".toggle_switch").getBoundingClientRect();
        if (Math.abs(text.top + text.height / 2 - toggle.top - toggle.height / 2) > 0.5) {
          issues.push("unaligned toggle label");
        }
      }
      return issues;
    });
    expect(issues).toEqual([]);
    const header = await page.locator(".app-toolbar").boundingBox();
    expect(header.x + header.width).toBeLessThanOrEqual(width);
  });
}

test("surface and panel buttons keep their geometry through pressed and focus states", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/srt-edit-player/");
  await page.evaluate(() => document.fonts.ready);
  for (const selector of [".track-controls .nmorph_button", ".editor-toolbar .nmorph_button"]) {
    await page.mouse.click(1, 1);
    const button = page.locator(selector).first();
    await expect(button).toBeVisible();
    const before = await button.boundingBox();
    await button.hover();
    await page.mouse.down();
    await expect(button).toHaveCSS("box-shadow", "rgba(0, 0, 0, 0.2) 1px 1px 2px 0px inset");
    expect(await button.boundingBox()).toEqual(before);
    await page.mouse.move(1, 1);
    await page.mouse.up();
    expect(await button.boundingBox()).toEqual(before);
    await button.focus();
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Tab");
    await expect(button).toBeFocused();
    await expect(button).toHaveCSS("outline-style", "solid");
    expect(await button.boundingBox()).toEqual(before);
  }
});
