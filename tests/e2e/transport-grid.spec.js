import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 1664, height: 1000 } });

async function expectContainedControls(surface) {
  const issues = await surface.evaluate(element => {
    return [...element.querySelectorAll("button, input[type=range], label, .control-value")].flatMap(control => {
      const bounds = (control.closest(".rate-options") ?? element).getBoundingClientRect();
      const rect = control.getBoundingClientRect();
      const failures = [];
      if (rect.left < bounds.left - 1 || rect.right > bounds.right + 1) failures.push("horizontal overflow");
      if (rect.top < bounds.top - 1 || rect.bottom > bounds.bottom + 1) failures.push("vertical overflow");
      if (control.matches("button, input[type=range]") && rect.height !== 32) failures.push(`height ${rect.height}`);
      if (control.matches("input[type=range]") && rect.width < 24) failures.push(`slider width ${rect.width}`);
      const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
      if (control.matches("button, input[type=range]") && hit !== control && !control.contains(hit)) failures.push("occluded control");
      return failures.map(failure => `${control.tagName}: ${failure}`);
    });
  });
  expect(issues).toEqual([]);
}

for (const width of [220, 500, 800]) {
  test(`player groups align at ${width}px without overflowing`, async ({ page }, testInfo) => {
    await page.goto("/");
    await page.locator(".player-pane").evaluate((element, width) => {
      element.style.flex = `0 0 ${width}px`;
    }, width);
    await page.evaluate(() => document.fonts.ready);
    const player = page.locator(".media-player");
    await expect.poll(async () => (await player.boundingBox()).width).toBe(width);
    const controls = player.locator(".media-controls");
    await expectContainedControls(controls);
    const play = await page.getByTestId("toggle-playback").boundingBox();
    const seek = await player.getByRole("slider", { name: "再生位置", exact: true }).boundingBox();
    expect(seek.y + seek.height / 2).toBe(play.y + play.height / 2);
    expect(seek.x).toBeGreaterThanOrEqual(play.x + play.width + 5);
    expect(seek.width).toBeGreaterThanOrEqual(24);
    if (width === 800) {
      expect((await player.locator(".control-row").boundingBox()).height).toBe(32);
      expect((await controls.boundingBox()).height).toBeLessThanOrEqual(60);
    }
    const volume = player.getByRole("slider", { name: "音量", exact: true });
    expect((await volume.boundingBox()).width).toBeLessThanOrEqual(80);
    await volume.fill("0.5");
    await volume.press("ArrowRight");
    await expect(volume).toHaveValue("0.51");
    await expect(player.locator(".control-value").first()).toHaveText("0.51");
    const rateTrigger = player.getByRole("button", { name: "倍速を調整", exact: true });
    await expect(rateTrigger).toHaveAttribute("aria-expanded", "false");
    await rateTrigger.click();
    const rate = player.getByRole("slider", { name: "倍速", exact: true });
    await expect(rate).toBeVisible();
    expect((await rate.boundingBox()).width).toBeLessThanOrEqual(80);
    await expectContainedControls(controls);
    await rate.fill("1");
    await rate.press("ArrowRight");
    await expect(rate).toHaveValue("1.05");
    await expect(player.locator(".rate-options .control-value")).toHaveText("1.05");
    await rate.press("Escape");
    await expect(rateTrigger).toBeFocused();
    await expect(rate).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath(`player-${width}.png`) });
  });
}

test("timeline controls share 32px rows and only wrap when necessary", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  const controls = page.locator(".track-controls.surface-controls");
  expect((await controls.boundingBox()).height).toBe(32);
  await expectContainedControls(controls);
  const minimumWidth = await controls.evaluate(element => [...element.children].reduce((sum, child) => sum + child.getBoundingClientRect().width, 0) + 16);
  await controls.evaluate((element, width) => { element.style.width = `${width}px`; }, minimumWidth + 1);
  expect((await controls.boundingBox()).height).toBe(32);
  await controls.evaluate((element, width) => { element.style.width = `${width}px`; }, minimumWidth - 1);
  expect((await controls.boundingBox()).height).toBe(72);
  await controls.evaluate(element => { element.style.width = "220px"; });
  await expectContainedControls(controls);
  const zoom = controls.locator("input[type=range]");
  await zoom.fill("2");
  await zoom.press("ArrowRight");
  await expect(zoom).toHaveValue("2.1");
  const auto = controls.locator("input[type=checkbox]");
  const checked = await auto.isChecked();
  await controls.locator(".auto-scroll-control").click();
  expect(await auto.isChecked()).toBe(!checked);
  await page.screenshot({ path: testInfo.outputPath("timeline-wrapped.png") });
});

test("floating rate control supports hover, keyboard and click above the icon", async ({ page }) => {
  await page.goto("/");
  const trigger = page.getByRole("button", { name: "倍速を調整", exact: true });
  const rate = page.getByRole("slider", { name: "倍速", exact: true });
  await expect(rate).toHaveCount(0);
  await trigger.hover();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await rate.hover();
  await expect(rate).toBeVisible();
  const popup = await page.locator(".rate-options").boundingBox();
  expect(popup.y + popup.height).toBeLessThanOrEqual((await trigger.boundingBox()).y - 8);
  await page.mouse.move(1, 1);
  await expect(rate).toHaveCount(0);
  await trigger.focus();
  await page.keyboard.press("Tab");
  await expect(rate).toBeFocused();
  await rate.press("ArrowRight");
  await expect(rate).toHaveValue("1.05");
  await rate.press("Escape");
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await trigger.press("Enter");
  await expect(rate).toBeVisible();
  await page.locator("div.folder-path").click();
  await expect(rate).toHaveCount(0);
});
