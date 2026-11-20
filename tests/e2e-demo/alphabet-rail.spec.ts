import { expect, type Page, test } from "@playwright/test";

/** The rail's box and its slots (letters and dots), measured in the viewport. */
function measure(page: Page) {
  return page.locator("#rail").evaluate((rail) => {
    const box = rail.getBoundingClientRect();
    const slots = [...rail.children].map((slot) => {
      const { top, bottom, height } = slot.getBoundingClientRect();
      return {
        top,
        bottom,
        height,
        letter: slot instanceof HTMLElement ? (slot.dataset.letter ?? null) : null,
        font: Number.parseFloat(getComputedStyle(slot).fontSize),
      };
    });
    return { top: box.top, bottom: box.bottom, height: box.height, slots };
  });
}

async function openDemo(page: Page) {
  // Phones first: from lg the first contact opens, and on a phone it would then hide the list.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("./contacts/runeterra");
  await expect(page.locator("#rail a").first()).toBeVisible();
}

test("spreads the A–Z rail over its height, from a phone to a large screen", async ({ page }) => {
  await openDemo(page);
  for (const [width, height] of [
    [390, 844],
    [1920, 1080],
    [2560, 1440],
  ] as const) {
    await page.setViewportSize({ width, height });
    const at = `${width}×${height}`;
    // The header's height, which places the rail on phones, is measured after the resize.
    await expect(async () => {
      const rail = await measure(page);
      expect(rail.slots, at).toHaveLength(27);
      const first = rail.slots[0];
      const last = rail.slots.at(-1);
      if (!first || !last) throw new Error("no letters on the rail");

      // Up to 2rem a cell; beyond that the column stays centred in the rail.
      const cell = Math.min(32, rail.height / 27);
      for (const { height: h } of rail.slots) expect(Math.abs(h - cell), at).toBeLessThan(1);
      expect(Math.abs(first.top - rail.top - (rail.bottom - last.bottom)), at).toBeLessThan(1);
      expect(first.top, at).toBeGreaterThanOrEqual(rail.top - 0.5);
      expect(last.bottom, at).toBeLessThanOrEqual(rail.bottom + 0.5);
      // Letters fill most of their cell without overflowing it, up to 16px.
      for (const { font } of rail.slots) {
        expect(font, at).toBeLessThanOrEqual(Math.min(16, cell));
        expect(font, at).toBeGreaterThanOrEqual(Math.min(16, cell * 0.7));
      }
    }).toPass();
  }
});

test("collapses the A–Z rail on short screens, and a finger still reaches every letter", async ({
  page,
  isMobile,
}) => {
  await openDemo(page);
  for (const [width, height] of [
    [844, 390],
    [568, 320],
  ] as const) {
    await page.setViewportSize({ width, height });
    const at = `${width}×${height}`;
    await expect(async () => {
      const rail = await measure(page);
      expect(rail.slots.length, at).toBeLessThan(27);
      expect(rail.slots[0]?.letter, at).toBe("A");
      expect(rail.slots.at(-1)?.letter, at).toBe("#");
      for (const [i, slot] of rail.slots.entries()) {
        // A letter, then a dot, then a letter…
        expect(slot.letter === null, at).toBe(i % 2 === 1);
        if (slot.letter !== null) expect(slot.font, at).toBeGreaterThanOrEqual(11);
        expect(slot.top, at).toBeGreaterThanOrEqual(rail.top - 0.5);
        expect(slot.bottom, at).toBeLessThanOrEqual(rail.bottom + 0.5);
      }
    }).toPass();

    if (!isMobile) continue;
    const rail = await measure(page);
    const top = rail.slots[0]?.top ?? 0;
    const bottom = rail.slots.at(-1)?.bottom ?? 0;
    const x = (await page.locator("#rail").boundingBox())?.x ?? 0;
    const touch = await page.context().newCDPSession(page);
    const send = (type: "touchStart" | "touchMove" | "touchEnd", y?: number) =>
      touch.send("Input.dispatchTouchEvent", {
        type,
        touchPoints: y === undefined ? [] : [{ x: x + 10, y }],
      });
    const groups = await page
      .locator('[id^="g-"]')
      .evaluateAll((sections) => sections.map((section) => section.id.slice(2)));
    const headerBottom = () =>
      page.evaluate(() => document.querySelector("header")?.getBoundingClientRect().bottom ?? 0);
    const groupTop = (letter: string) =>
      page.evaluate((l) => document.getElementById(`g-${l}`)?.getBoundingClientRect().top, letter);

    // Mid-way down the column, on a letter the short rail hides.
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const shown = rail.slots.map((slot) => slot.letter);
    const index = [...letters.slice(10, 17)].findIndex((letter) => !shown.includes(letter)) + 10;
    const hiddenLetter = letters[index];
    if (index < 10 || !hiddenLetter) throw new Error(`no hidden letter mid-way at ${at}`);
    const target = groups.find((letter) => letter !== "#" && letter >= hiddenLetter);
    if (!target) throw new Error("no group after mid-way in the demo");
    await send("touchStart", top + 2);
    await send("touchMove", top + ((index + 0.5) * (bottom - top)) / 27);
    const under = await headerBottom();
    await expect.poll(() => groupTop(target), at).toBeGreaterThanOrEqual(under - 1);
    await expect.poll(() => groupTop(target), at).toBeLessThan(under + 8);

    // At the bottom, the last group comes into view.
    await send("touchMove", bottom - 1);
    await send("touchEnd");
    const lastGroup = groups.at(-1);
    if (!lastGroup) throw new Error("no group in the demo");
    await expect(page.locator(`[id="g-${lastGroup}"]`), at).toBeInViewport();
    await page.evaluate(() => window.scrollTo(0, 0));
  }
});
