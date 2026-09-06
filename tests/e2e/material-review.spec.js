import { expect, test } from "@playwright/test";

test("short color popup scrolls without overlapping the eyedropper", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 320 });
  await page.goto("/srt-edit-player/");
  await page.evaluate(() => document.fonts.ready);
  await page.locator(".color_picker_button button").first().click();
  const popup = page.locator(".popup");
  await expect(popup).toBeVisible();
  const bounds = await popup.boundingBox();
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(320);
  const dropper = popup.getByRole("button", { name: "スポイト", exact: true });
  await dropper.scrollIntoViewIfNeeded();
  const button = await dropper.boundingBox();
  for (const control of await popup.locator('input[type="range"]:visible, input[type="number"]:visible').all()) {
    const rect = await control.boundingBox();
    expect(button.x < rect.x + rect.width && button.x + button.width > rect.x
      && button.y < rect.y + rect.height && button.y + button.height > rect.y).toBe(false);
  }
});

for (const viewport of [{ width: 1926, height: 1200 }, { width: 1426, height: 1209 }, { width: 1366, height: 768 }, { width: 768, height: 900 }, { width: 390, height: 844 }]) {
  test(`panel relief and contextual controls at ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/srt-edit-player/");
    await page.evaluate(() => document.fonts.ready);

    const panels = page.locator(".ribbon-area, .srt_area, .media-controls");
    await expect.poll(() => panels.count()).toBeGreaterThanOrEqual(7);
    for (const panel of await panels.all()) {
      await expect(panel).toHaveCSS("border-top-color", "rgba(0, 0, 0, 0)");
      const inRibbon = await panel.evaluate((el) => el.classList.contains("ribbon-area"));
      await expect(panel).toHaveCSS("box-shadow", inRibbon
        ? "rgba(0, 0, 0, 0.36) 3px 3px 6px 0px, rgba(255, 255, 255, 0.1) -2px -2px 5px 0px"
        : "rgba(0, 0, 0, 0.36) 5px 5px 10px 0px, rgba(255, 255, 255, 0.1) -4px -4px 8px 0px");
    }
    const gaps = await page.locator(".ribbon-area").evaluateAll((panels) => {
      const bounds = panels.map((panel) => panel.getBoundingClientRect());
      return bounds.slice(1).map((rect, index) => rect.left - bounds[index].right);
    });
    expect(gaps).toHaveLength(4);
    for (const gap of gaps) expect(gap).toBeGreaterThanOrEqual(14);
    for (const button of await page.locator(".nmorph_button").all()) {
      if (await button.isDisabled()) {
        await expect(button).toHaveCSS("box-shadow", "none");
      } else if (await button.evaluate((el) => !!el.closest(".surface-controls"))) {
        await expect(button).toHaveCSS("box-shadow", "rgba(0, 0, 0, 0.28) 2px 2px 4px 0px, rgba(255, 255, 255, 0.075) -2px -2px 4px 0px");
        await expect(button).toHaveCSS("border-top-color", "rgba(0, 0, 0, 0)");
      } else {
        await expect(button).toHaveCSS("box-shadow", "rgba(255, 255, 255, 0.09) 0px 1px 0px 0px inset, rgba(0, 0, 0, 0.28) 0px 1px 2px 0px");
      }
    }
    expect((await page.locator(".ribbonview").boundingBox()).height).toBeLessThanOrEqual(155);
    await page.screenshot({ path: testInfo.outputPath("panel-controls.png") });

    const picker = page.getByRole("button", { name: "色を選択", exact: true }).first();
    await picker.click();
    await expect(picker).toHaveAttribute("aria-expanded", "true");
    const popup = page.locator(".popup");
    await expect(popup).toBeVisible();
    const popupBounds = await popup.boundingBox();
    expect(popupBounds.x).toBeGreaterThanOrEqual(0);
    expect(popupBounds.x + popupBounds.width).toBeLessThanOrEqual(viewport.width);
    expect(popupBounds.y).toBeGreaterThanOrEqual(0);
    expect(popupBounds.y + popupBounds.height).toBeLessThanOrEqual(viewport.height);
    const dropper = await popup.getByRole("button", { name: "スポイト", exact: true }).boundingBox();
    for (const input of await popup.locator('input[type="number"]:visible').all()) {
      const bounds = await input.boundingBox();
      const overlaps = dropper.x < bounds.x + bounds.width && dropper.x + dropper.width > bounds.x
        && dropper.y < bounds.y + bounds.height && dropper.y + dropper.height > bounds.y;
      expect(overlaps).toBe(false);
    }
    const color = popup.locator('input[type="text"]');
    await color.fill("#22aaffff");
    await expect(picker.locator("span")).toHaveCSS("color", "rgb(34, 170, 255)");
    await picker.click();
    await expect(popup).toHaveCount(0);
    await picker.focus();
    await page.keyboard.press("Enter");
    await expect(popup).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("color-picker.png") });
    await page.locator(".area-title").first().click();
    await expect(popup).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}
