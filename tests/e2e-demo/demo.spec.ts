import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

async function signIn(page: Page): Promise<void> {
  await expect(page.getByText("Demo: any username and password work.")).toBeVisible();
  await expect(page.getByText("In this demo, nothing you type leaves your browser.")).toBeVisible();
  await page.getByLabel("Username").fill("visitor");
  await page.getByLabel("Password", { exact: true }).fill("anything");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("link", { name: /Luxanna Crownguard/ })).toBeVisible();
}

test("signs in with any credentials, and says on every screen that it is a demo", async ({
  page,
}) => {
  await page.goto("./");
  await signIn(page);
  await expect(page.getByText("Demo: nothing is saved, change anything you like.")).toBeVisible();
  await page.getByRole("link", { name: /Luxanna Crownguard/ }).click();
  await expect(page).toHaveURL(/\/contacts\/runeterra\/p01$/);
  await expect(page.getByText("Demo", { exact: true }).filter({ visible: true })).toBeVisible();
});

// A static host sends no headers: the policy, Trusted Types included, comes
// from the meta tag, which `vite preview`'s own headers would hide here.
test("carries the content security policy in a meta tag", async ({ page, isMobile }) => {
  test.skip(isMobile, "the policy doesn't depend on the viewport");
  await page.goto("./");
  const policy = await page
    .locator('meta[http-equiv="Content-Security-Policy"]')
    .getAttribute("content");
  expect(policy).toContain("default-src 'self'");
  expect(policy).toContain("require-trusted-types-for 'script'; trusted-types 'none'");
});

test("gives link previews an absolute image it serves", async ({ page, request, isMobile }) => {
  test.skip(isMobile, "the tags don't depend on the viewport");
  await page.goto("./");
  const image = await page.locator('meta[property="og:image"]').getAttribute("content");
  expect(image).toBe(new URL("og-image.png", page.url()).href);
  const response = await request.get(image ?? "");
  expect(response.ok()).toBe(true);
  expect(response.headers()["content-type"]).toBe("image/png");
});

test("opens the contact list directly without signing in", async ({ page }) => {
  await page.goto("./contacts");
  await expect(page).toHaveURL(/\/contacts\/runeterra$/);
  await expect(page.getByRole("link", { name: /Luxanna Crownguard/ })).toBeVisible();
  await expect(page.getByText("Demo: nothing is saved, change anything you like.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in" })).not.toBeVisible();
});

test("ships the contact list as a page of its own", async ({ request }) => {
  const response = await request.get("./contacts.html");
  expect(response.ok()).toBe(true);
});

test("opens a contact deep link directly without signing in", async ({ page }) => {
  await page.goto("./contacts/runeterra/p01");
  await expect(page).toHaveURL(/\/contacts\/runeterra\/p01$/);
  await expect(page.getByRole("heading", { name: /Luxanna Crownguard/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in" })).not.toBeVisible();
});

test("signs out of a session opened by a direct link", async ({ page }) => {
  await page.goto("./settings");
  await expect(page.getByText("demo", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await signIn(page);
});

test("forgets an edit on reload", async ({ page }) => {
  await page.goto("./");
  await signIn(page);
  await page.getByRole("link", { name: /Luxanna Crownguard/ }).click();
  await page.getByRole("button", { name: /^Edit/ }).filter({ visible: true }).first().click();
  await page.locator('input[type="tel"]').first().fill("+41 79 000 99 99");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("status").filter({ hasText: /^Saved$/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "079 000 99 99" }).first()).toBeVisible();

  await page.reload();
  await expect(page).toHaveURL(/\/contacts\/runeterra\/p01$/);
  await expect(page.getByRole("link", { name: "079 000 00 01" }).first()).toBeVisible();
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`passes axe on the demo's own screens, ${colorScheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    await page.goto("./");
    const check = async (screen: string) => {
      const { violations } = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"])
        .exclude("[data-logotype]")
        .analyze();
      expect
        .soft(
          violations.map((v) => v.id),
          screen,
        )
        .toEqual([]);
    };
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
    await check("sign-in");
    await signIn(page);
    await check("list");
  });
}
