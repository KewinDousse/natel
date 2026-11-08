import { expect, type Page, test } from "@playwright/test";

const mark = (page: Page) => page.getByText("Demo", { exact: true }).filter({ visible: true });
const notice = (page: Page) => page.getByText(/nothing is saved/i).filter({ visible: true });

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
    // The line's own mark, and none in a top bar.
    await expect(mark(page)).toHaveCount(1);
    await expect(page.locator("#app-header").getByText("Demo", { exact: true })).toBeVisible();
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
    await expect(notice(page)).toHaveCount(0);
  });
}

for (const colorScheme of ["light", "dark"] as const) {
  test(`draws the mark in the brand's red, ${colorScheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await page.setViewportSize({ width: 320, height: 700 });
    const token = (name: string) =>
      page.evaluate((variable) => {
        const probe = document.createElement("span");
        probe.style.color = `var(${variable})`;
        document.body.append(probe);
        const colour = getComputedStyle(probe).color;
        probe.remove();
        return colour;
      }, name);
    for (const path of ["./contacts/runeterra", "./contacts/runeterra/p01"]) {
      await page.goto(path);
      // The tokens are read from the page itself, so the theme must be the one asked for.
      await expect(page.locator("html")).toHaveAttribute("data-theme", colorScheme);
      await expect(mark(page)).toBeVisible();
      const { fill, text } = await mark(page).evaluate((element) => {
        const style = getComputedStyle(element);
        return { fill: style.backgroundColor, text: style.color };
      });
      expect(fill, path).toBe(await token("--brand-surface"));
      expect(text, path).toBe(await token("--brand-surface-foreground"));
    }
    // The line around the mark stays grey: a red band reads as an error.
    await page.goto("./contacts/runeterra");
    const line = page.locator("p[data-demo-reminder]");
    // The line's text, with the separator only screen readers get.
    await expect(line).toHaveText("Demo: Nothing is saved, change anything you like.");
    const band = await line.evaluate((element) => getComputedStyle(element).backgroundColor);
    expect(band).toBe(await token("--secondary"));
  });
}
