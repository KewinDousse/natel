import { expect, test } from "@playwright/test";

// A white or transparent background has no edge on a light page and makes a
// white disc on a dark one.
test("gives every demo photo an opaque background, not near-white", async ({ page }) => {
  // A photo that fails to decode rejects decode() or falls back to initials.
  for (const [book, count] of [
    ["runeterra", 4],
    ["expedition-33", 1],
  ] as const) {
    await page.goto(`./contacts/${book}`);
    const rows = page.locator("#list a[data-contact-id]:has(img)");
    await expect(rows).toHaveCount(count);
    for (const row of await rows.all()) {
      // A lazy image off screen never decodes.
      await row.scrollIntoViewIfNeeded();
      const corners = await row.locator("img").evaluate(async (element) => {
        const image = element as HTMLImageElement;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext("2d");
        if (!context) return [];
        context.drawImage(image, 0, 0);
        const right = canvas.width - 1;
        const bottom = canvas.height - 1;
        const points: [number, number][] = [
          [0, 0],
          [right, 0],
          [0, bottom],
          [right, bottom],
        ];
        return points.map(([x, y]) => {
          const [r = 0, g = 0, b = 0, a = 0] = context.getImageData(x, y, 1, 1).data;
          return a === 255 && (r + g + b) / 3 < 225;
        });
      });
      const id = (await row.getAttribute("data-contact-id")) ?? "";
      expect(corners, id).toEqual([true, true, true, true]);
    }
  }
});
