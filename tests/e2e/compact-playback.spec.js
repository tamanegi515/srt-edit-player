import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 1664, height: 1000 } });

async function openPlayer(page, width) {
    await page.goto("/");
    await page.locator(".media-controls").waitFor();
    await page.evaluate(async () => {
        await document.fonts.ready;
        const resource = performance.getEntriesByType("resource").find(entry => entry.name.includes("/src/lib/store.svelte.js"));
        const store = await import(resource.name);
        store.mediaState.media.isAudio = true;
        store.mediaState.media.duration = 3600;
    });
    if (width) await page.locator(".player-pane").evaluate((node, width) => { node.style.flex = `0 0 ${width}px`; }, width);
}

async function expectContained(page) {
    const issues = await page.locator(".media-controls").evaluate(node => {
        const bounds = node.getBoundingClientRect();
        return [...node.querySelectorAll("button, input[type=range], .control-value, .setRight")].flatMap(control => {
            const r = control.getBoundingClientRect();
            const issues = [];
            if (r.left < bounds.left || r.right > bounds.right || r.top < bounds.top || r.bottom > bounds.bottom) issues.push("outside");
            if (control.matches("button, input[type=range]") && r.height !== 32) issues.push("height");
            if (control.matches("input[type=range]") && r.width < 24) issues.push("slider too short");
            const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
            if (control.matches("button, input[type=range]") && hit !== control && !control.contains(hit)) issues.push("occluded");
            return issues.map(issue => `${control.getAttribute("aria-label")}: ${issue}`);
        });
    });
    expect(issues).toEqual([]);
}

for (const width of [220, 500, 800]) {
    test(`compact player remains usable at ${width}px`, async ({ page }, testInfo) => {
        await openPlayer(page, width);
        const controls = page.locator(".media-controls");
        await expectContained(page);
        const play = await page.getByTestId("toggle-playback").boundingBox();
        const seek = await page.getByRole("slider", { name: "再生位置", exact: true }).boundingBox();
        expect(play.y).toBe(seek.y);
        expect(seek.x).toBeGreaterThan(play.x + play.width);
        expect((await page.getByRole("slider", { name: "音量", exact: true }).boundingBox()).width).toBe(72);
        const collapsed = await controls.boundingBox();
        if (width >= 800) expect(collapsed.height).toBeLessThanOrEqual(48);
        await page.getByRole("button", { name: "倍速を調整" }).click();
        await expect(page.getByRole("slider", { name: "倍速", exact: true })).toBeVisible();
        await expectContained(page);
        if (width >= 370) expect((await controls.boundingBox()).height).toBe(collapsed.height);
        const stage = await page.locator(".media-stage").boundingBox();
        const rate = await page.locator(".rate-options").boundingBox();
        expect(rate.y).toBeGreaterThanOrEqual(stage.y + stage.height);
        await page.screenshot({ path: testInfo.outputPath(`compact-player-${width}.png`) });
    });
}

test("rate hover reveals a usable inline slider without moving the trigger", async ({ page }) => {
    await openPlayer(page, 800);
    const trigger = page.getByRole("button", { name: "倍速を調整" });
    const before = await trigger.boundingBox();
    await trigger.hover();
    const slider = page.getByRole("slider", { name: "倍速", exact: true });
    await expect(slider).toBeVisible();
    expect(await trigger.boundingBox()).toEqual(before);
    await slider.hover();
    await expect(slider).toBeVisible();
    await page.mouse.move(1, 1);
    await expect(slider).toHaveCount(0);
});

test("rate supports keyboard, pinned pointer interaction, Escape and outside dismissal", async ({ page }) => {
    await openPlayer(page, 800);
    const trigger = page.getByRole("button", { name: "倍速を調整" });
    const slider = page.getByRole("slider", { name: "倍速", exact: true });
    await trigger.focus();
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("Tab");
    await expect(slider).toBeFocused();
    await slider.fill("1.25");
    await slider.press("ArrowRight");
    await expect(slider).toHaveValue("1.3");
    await expect(page.locator(".rate-options .control-value")).toHaveText("1.30");
    await slider.press("Escape");
    await expect(trigger).toBeFocused();
    await expect(slider).toHaveCount(0);
    await trigger.press("Enter");
    await page.getByTestId("toggle-playback").focus();
    await expect(slider).toBeVisible();
    await expect(slider).toHaveValue("1.3");
    await page.locator(".app-toolbar").click({ position: { x: 2, y: 2 } });
    await expect(slider).toHaveCount(0);
    await trigger.click();
    await expect(slider).toHaveValue("1.3");
    const r = await slider.boundingBox();
    await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
    await page.mouse.down();
    await page.mouse.move(r.x + r.width + 50, r.y + r.height + 50);
    await expect(slider).toBeVisible();
    await page.mouse.up();
    await trigger.click();
    await expect(slider).toHaveCount(0);
});

test("no-audio status remains visible in the compact bar", async ({ page }) => {
    await openPlayer(page);
    await page.evaluate(async () => {
        const resource = performance.getEntriesByType("resource").find(entry => entry.name.includes("/src/lib/store.svelte.js"));
        const { mediaState } = await import(resource.name);
        mediaState.media.isAudio = false;
    });
    await expect(page.locator(".no-audio-note")).toHaveText("音声ファイルがありません（字幕の時間のみ表示）");
});

test("extracted image auto toggle remains keyboard operable", async ({ page }) => {
    await page.goto("/");
    const auto = page.getByRole("checkbox", { name: "画像自動切り替え", exact: true });
    const checked = await auto.isChecked();
    await auto.focus();
    await expect(auto).toBeFocused();
    await auto.press("Space");
    expect(await auto.isChecked()).toBe(!checked);
    await expect(page.locator(".image-control-group .toggle-slider")).toHaveCSS("outline-style", "solid");
});
