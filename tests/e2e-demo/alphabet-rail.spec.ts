import { expect, type Page, test } from "@playwright/test";

/** The rail's box and its letter cells, measured in the viewport. */
function measure(page: Page) {
  return page.locator("#rail").evaluate((rail) => {
    const box = rail.getBoundingClientRect();
    const cells = [...rail.querySelectorAll<HTMLElement>("[data-letter]")].map((cell) => {
      const { top, bottom, height } = cell.getBoundingClientRect();
      return { top, bottom, height, font: Number.parseFloat(getComputedStyle(cell).fontSize) };
    });
    return { top: box.top, bottom: box.bottom, height: box.height, cells };
  });
}

test("spreads the A–Z rail over its height, from a landscape phone to a large screen", async ({
  page,
}) => {
  // Phones first: from lg the first contact opens, and on a phone it would then hide the list.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("./contacts/runeterra");
  await expect(page.locator("#rail a").first()).toBeVisible();
  for (const [width, height] of [
    [390, 844],
    [844, 390],
    [1920, 1080],
    [2560, 1440],
  ] as const) {
    await page.setViewportSize({ width, height });
    const at = `${width}×${height}`;
    // The header's height, which places the rail on phones, is measured after the resize.
    await expect(async () => {
      const rail = await measure(page);
      expect(rail.cells, at).toHaveLength(27);
      const first = rail.cells[0];
      const last = rail.cells.at(-1);
      if (!first || !last) throw new Error("no letters on the rail");

      // Up to 2rem a cell; beyond that the column stays centred in the rail.
      const cell = Math.min(32, rail.height / 27);
      for (const { height: h } of rail.cells) expect(Math.abs(h - cell), at).toBeLessThan(1);
      expect(Math.abs(first.top - rail.top - (rail.bottom - last.bottom)), at).toBeLessThan(1);
      expect(first.top, at).toBeGreaterThanOrEqual(rail.top - 0.5);
      expect(last.bottom, at).toBeLessThanOrEqual(rail.bottom + 0.5);
      // Letters fill most of their cell without overflowing it, up to 16px.
      for (const { font } of rail.cells) {
        expect(font, at).toBeLessThanOrEqual(Math.min(16, cell));
        expect(font, at).toBeGreaterThanOrEqual(Math.min(16, cell * 0.7));
      }
    }).toPass();
  }
});
