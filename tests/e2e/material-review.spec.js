import { expect, test } from "@playwright/test";

for (const viewport of [{ width: 1426, height: 1209 }, { width: 1366, height: 768 }, { width: 768, height: 900 }, { width: 390, height: 844 }]) {
  test(`panel relief and flat controls at ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/srt-edit-player/");
    await page.evaluate(() => document.fonts.ready);

    const panels = page.locator(".ribbon-area, .srt_area, .media-controls");
    expect(await panels.count()).toBeGreaterThanOrEqual(7);
    for (const panel of await panels.all()) {
      await expect(panel).toHaveCSS("border-top-color", "rgba(0, 0, 0, 0)");
      expect(await panel.evaluate((el) => getComputedStyle(el).boxShadow)).not.toBe("none");
    }
    for (const button of await page.locator(".nmorph_button, .CheckButtonArea label").all()) {
      await expect(button).toHaveCSS("box-shadow", "none");
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
