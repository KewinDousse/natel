import { expect, type Locator, test } from "@playwright/test";
import { putCard, resetBook, vcard } from "./dav";
import { PASSWORD, USER } from "./env";

test.skip(({ isMobile }) => isMobile, "the palette doesn't depend on the viewport");

/** An element's background as #rrggbb, whatever colour syntax the CSS uses. */
const backgroundOf = (locator: Locator) =>
  locator.evaluate((el) => {
    const context = document.createElement("canvas").getContext("2d");
    if (!context) return "";
    context.fillStyle = getComputedStyle(el).backgroundColor;
    context.fillRect(0, 0, 1, 1);
    const [r = 0, g = 0, b = 0] = context.getImageData(0, 0, 1, 1).data;
    return `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
  });

test.beforeEach(async () => {
  await resetBook();
  await putCard("ada", vcard(["UID:ada", "FN:Ada Lovelace", "N:Lovelace;Ada;;;"]));
});

test("follows the system's dark setting", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  expect(await backgroundOf(page.locator("body"))).toBe("#121316");
  // The sign-in panel's large red area turns darker so it doesn't glare.
  expect(await backgroundOf(page.locator("aside"))).toBe("#a11f18");

  await page.getByLabel("Username").fill(USER);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByRole("link", { name: /Lovelace/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: /Lovelace/ })).toBeVisible();
  // Native controls and scrollbars follow too.
  expect(await page.locator("body").evaluate((el) => getComputedStyle(el).colorScheme)).toBe(
    "dark",
  );

  // The page follows the system when it changes, while nothing is chosen.
  await page.emulateMedia({ colorScheme: "light" });
  await expect.poll(() => backgroundOf(page.locator("body"))).toBe("#ffffff");
});

test("gives the browser bar a colour for each scheme", async ({ page }) => {
  await page.goto("/");
  const metas = await page
    .locator('meta[name="theme-color"]')
    .evaluateAll((els) => els.map((el) => [el.getAttribute("media"), el.getAttribute("content")]));
  expect(metas).toEqual([
    ["(prefers-color-scheme: light)", "#D8261D"],
    ["(prefers-color-scheme: dark)", "#121316"],
  ]);
});
