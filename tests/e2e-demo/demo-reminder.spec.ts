import { expect, type Page, test } from "@playwright/test";

const mark = (page: Page) => page.getByText("Demo", { exact: true }).filter({ visible: true });

for (const width of [320, 360, 1280]) {
  test(`leaves the header's reminder to the notice at ${width}px, with the whole book name`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 700 });
    await page.goto("./contacts/runeterra");
    await page.evaluate(() => document.fonts.ready);
    const name = page.getByRole("button", { name: /Runeterra/ }).locator("span");
    await expect(name).toHaveText("Runeterra");
    const { client, scroll } = await name.evaluate((element) => ({
      client: element.clientWidth,
      scroll: element.scrollWidth,
    }));
    expect(scroll).toBeLessThanOrEqual(client);
    await expect(mark(page)).toHaveCount(0);
    await expect(page.locator("#app-header").getByText(/nothing is saved/i)).toBeVisible();
  });
}

for (const path of [
  "./contacts/runeterra/p01",
  "./contacts/runeterra/p01?edit=true",
  "./contacts/runeterra/new",
  "./settings",
  "./settings/help",
]) {
  test(`shows the mark in the top bar of ${path} at 320px`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeAttached();
    await expect(mark(page)).toBeVisible();
    await expect(page.getByText(/nothing is saved/i).filter({ visible: true })).toHaveCount(0);
  });
}
