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
  test(`badges, highlights and ignores releases without an external browser request, ${colorScheme}`, async ({
    page,
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
    const badged = page.getByRole("link", { name: "Settings, new version available" });
    const settings = page.getByRole("link", { name: "Settings", exact: true });
    const notes = page.getByRole("link", { name: "See what’s new", exact: true });
    await expect(badged).toBeVisible();
    await expect(notes).toHaveCount(0);
    const axe = () =>
      new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .exclude("[data-logotype]")
        .analyze();
    expect((await axe()).violations.map((item) => item.id)).toEqual([]);

    await badged.click();
    await expect(notes).toHaveAttribute("href", releaseUrl(version));
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    expect((await axe()).violations.map((item) => item.id)).toEqual([]);
    await page.goto("/contacts");
    await expect(page.getByRole("link", { name: /Ada Lovelace/ })).toBeVisible();
    await expect(settings).toBeVisible();

    await settings.click();
    await page.getByRole("button", { name: "Ignore this version" }).click();
    await expect(notes).toHaveCount(0);
    const latest = page.getByRole("link", { name: "Latest release: 999.0.0" });
    await expect(latest).toHaveAttribute("href", releaseUrl(version));
    await expect(latest).toBeFocused();
    await page.reload();
    await expect(latest).toBeVisible();
    await expect(notes).toHaveCount(0);

    version = "999.1.0";
    await page.goto("/contacts");
    await page.reload();
    await expect(badged).toBeVisible();
    expect(external).toEqual([]);
  });
}
