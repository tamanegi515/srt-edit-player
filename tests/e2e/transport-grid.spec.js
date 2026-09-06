import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 1664, height: 1000 } });

async function expectContainedControls(surface) {
  const issues = await surface.evaluate(element => {
    const bounds = element.getBoundingClientRect();
    return [...element.querySelectorAll("button, input[type=range], label, .control-value")].flatMap(control => {
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
    const labels = player.locator(".control-row > label");
    const groups = await labels.evaluateAll(nodes => nodes.map(node => {
      const rect = node.getBoundingClientRect();
      const children = [...node.children].map(child => {
        const childRect = child.getBoundingClientRect();
        return { x: childRect.x - rect.x, center: childRect.y + childRect.height / 2 - rect.y };
      });
      return { height: rect.height, children };
    }));
    expect(groups).toHaveLength(2);
    expect(groups[0]).toEqual(groups[1]);
    expect(groups[0].height).toBe(32);
    for (const child of groups[0].children) expect(child.center).toBe(16);
    if (width === 800) expect((await player.locator(".control-row").boundingBox()).height).toBe(32);
    const volume = player.locator(".control-row > label input[type=range]").first();
    await volume.fill("0.5");
    await volume.press("ArrowRight");
    await expect(volume).toHaveValue("0.51");
    await expect(player.locator(".control-value").first()).toHaveText("0.51");
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
