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
  if (process.env.E2E_EXTERNAL_APP !== "1") {
    expect(data).toEqual({ enabled: false });
    const manual = await request.post("/updates", { headers: { "Sec-Fetch-Site": "same-origin" } });
    expect(manual.status()).toBe(200);
    expect(await manual.json()).toEqual({ enabled: false });
    expect(
      (await request.post("/updates", { headers: { "Sec-Fetch-Site": "cross-site" } })).status(),
    ).toBe(403);
  }
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

test("checks immediately from settings and reports unavailable checks without external requests", async ({
  page,
}) => {
  let manual = 0;
  const external: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).hostname !== "127.0.0.1") external.push(request.url());
  });
  await page.route("**/updates", (route) => {
    if (route.request().method() === "POST") {
      manual++;
      if (manual === 2) return route.fulfill({ json: { enabled: true } });
      if (manual === 3) return route.fulfill({ status: 429 });
      return route.fulfill({
        json: { enabled: true, version: "999.0.0", releaseUrl: releaseUrl("999.0.0") },
      });
    }
    return route.fulfill({
      json: { enabled: true, version: "0.0.1", releaseUrl: releaseUrl("0.0.1") },
    });
  });
  await signIn(page.request);
  await page.goto("/settings");
  const button = page.getByRole("button", { name: "Check for updates", exact: true });
  const status = page
    .getByRole("status")
    .filter({ hasText: /Natel 999|Could not check|Please wait/ });
  await button.click();
  await expect(status).toHaveText("Natel 999.0.0 is available.");
  await expect(button).toBeFocused();
  await expect(page.getByRole("link", { name: "See what’s new" })).toHaveAttribute(
    "href",
    releaseUrl("999.0.0"),
  );
  await button.click();
  await expect(status).toHaveText("Could not check for updates. Try again later.");
  await button.click();
  await expect(status).toHaveText("Please wait a minute before checking again.");
  expect(manual).toBe(3);
  expect(external).toEqual([]);
});
