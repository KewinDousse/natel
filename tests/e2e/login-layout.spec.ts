import { expect, type Page, test } from "@playwright/test";

test.skip(({ isMobile }) => !isMobile, "phone layout only");

/** `locale` stored as an explicit choice; none leaves the browser language. */
async function openLogin(page: Page, locale?: string) {
  if (locale) {
    await page.addInitScript((language) => {
      localStorage.setItem("natel.preferences", JSON.stringify({ locale: language }));
    }, locale);
  }
  await page.goto("/login");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

for (const [width, height, locale] of [
  [320, 568, "fr"],
  [375, 667, "en"],
] as const) {
  test(`keeps sign-in in view at ${width} × ${height} in ${locale}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await openLogin(page, locale);

    await expect(page.getByRole("button", { name: /^(Se connecter|Sign in)$/ })).toBeInViewport({
      ratio: 1,
    });
  });
}

test.describe("with the browser language in French", () => {
  test.use({ locale: "fr-FR" });

  test("fits the wordmark and the whole language choice on one row at 375 px", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await openLogin(page);
    const language = page.getByRole("combobox", { name: "Langue" });
    await expect(language).toHaveValue("browser");

    const header = await page.getByRole("complementary").boundingBox();
    // A second row would take the header past 100 px.
    expect(header?.height).toBeLessThan(100);
    // As wide as without any cap, so no option is cut off.
    const widths = await language.evaluate((select: HTMLSelectElement) => {
      const shown = select.offsetWidth;
      select.style.maxWidth = "none";
      return { shown, natural: select.offsetWidth };
    });
    expect(widths.shown).toBe(widths.natural);
  });

  test("keeps language selection inside a narrow screen with large text", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    // The browser-language default, the longest value.
    await openLogin(page);
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "200%";
    });
    const language = page.getByRole("combobox", { name: "Langue" });
    const box = await language.boundingBox();
    if (!box) throw new Error("language select is not laid out");
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(320);
    await language.selectOption("en");
    await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
  });
});

test("shows the first field in landscape", async ({ page }) => {
  await page.setViewportSize({ width: 667, height: 375 });
  await openLogin(page, "fr");
  await expect(page.getByLabel("Nom d’utilisateur")).toBeInViewport({ ratio: 1 });
});
