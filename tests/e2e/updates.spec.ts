import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { putCard, resetBook, vcard } from "./dav";
import { signIn } from "./session";

const releaseUrl = (version: string) =>
  `https://github.com/KewinDousse/natel/releases/tag/v${version}`;

test.beforeEach(async () => {
  await resetBook();
  await putCard("ada", vcard(["UID:ada", "FN:Ada Lovelace", "N:Lovelace;Ada;;;"]));
});

test("update metadata requires a session", async ({ request }) => {
  const response = await request.get("/updates");
  expect(response.status()).toBe(401);
  await signIn(request);
  const enabled = await request.get("/updates");
  expect(enabled.status()).toBe(200);
  expect(enabled.headers()["cache-control"]).toBe("no-store");
  const data: unknown = await enabled.json();
  expect(data).toHaveProperty("enabled");
  if (process.env.E2E_EXTERNAL_APP !== "1") expect(data).toEqual({ enabled: false });
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`announces and dismisses releases without an external browser request, ${colorScheme}`, async ({
    page,
    isMobile,
  }) => {
    await page.emulateMedia({ colorScheme });
    let version = "999.0.0";
    const external: string[] = [];
    page.on("request", (request) => {
      if (new URL(request.url()).hostname !== "127.0.0.1") external.push(request.url());
    });
    await page.route("**/updates", (route) =>
      route.fulfill({ json: { enabled: true, version, releaseUrl: releaseUrl(version) } }),
    );
    await signIn(page.request);
    await page.goto("/contacts");
    const notes = page.getByRole("link", { name: "See what’s new", exact: true });
    await expect(notes).toBeVisible();
    await expect(notes).toHaveAttribute("href", releaseUrl(version));
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    const header = page.locator("#app-header");
    if (isMobile) {
      const offset = await page.evaluate(() =>
        parseFloat(document.documentElement.style.getPropertyValue("--header-h")),
      );
      expect(offset).toBeCloseTo((await header.boundingBox())?.height ?? 0, 0);
    }
    const { violations } = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .exclude("[data-logotype]")
      .analyze();
    expect(violations.map((item) => item.id)).toEqual([]);
    await page.getByRole("button", { name: "Ignore this version" }).click();
    await expect(notes).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Settings", exact: true })).toBeFocused();
    await page.reload();
    await expect(page.getByRole("link", { name: /Ada Lovelace/ })).toBeVisible();
    await expect(notes).toHaveCount(0);
    await page.getByRole("link", { name: "Settings", exact: true }).click();
    await expect(page.getByRole("link", { name: "Latest release: 999.0.0" })).toHaveAttribute(
      "href",
      releaseUrl(version),
    );
    version = "999.1.0";
    await page.goto("/contacts");
    await page.reload();
    await expect(notes).toBeVisible();
    await expect(notes).toHaveAttribute("href", releaseUrl(version));
    expect(external).toEqual([]);
  });
}
