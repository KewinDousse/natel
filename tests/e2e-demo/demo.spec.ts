import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

async function signIn(page: Page): Promise<void> {
  await expect(page.getByText("Demo: any username and password work.")).toBeVisible();
  await page.getByLabel("Username").fill("visitor");
  await page.getByLabel("Password", { exact: true }).fill("anything");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("link", { name: /Rochat Léa/ })).toBeVisible();
}

test("signs in with any credentials, and says on every screen that it is a demo", async ({
  page,
}) => {
  await page.goto("./");
  await signIn(page);
  await expect(page.getByText("Demo: nothing is saved, change anything you like.")).toBeVisible();
  await page.getByRole("link", { name: /Rochat Léa/ }).click();
  await expect(page).toHaveURL(/\/natel\/contacts\/p01$/);
  await expect(page.getByText("Demo", { exact: true }).filter({ visible: true })).toBeVisible();
});

test("keeps the open contact marked in the list under the subpath", async ({ page, isMobile }) => {
  test.skip(isMobile, "the list and the contact share the screen from lg");
  await page.goto("./");
  await signIn(page);
  await page.getByRole("link", { name: /Rochat Léa/ }).click();
  await expect(page.getByRole("link", { name: /Rochat Léa/ })).toHaveAttribute(
    "aria-current",
    "page",
  );
});

test("loads the app on a deep link", async ({ page }) => {
  await page.goto("./contacts/p01");
  // Credentials live in memory only: a fresh load asks for them again.
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
});

test("forgets an edit on reload", async ({ page }) => {
  await page.goto("./");
  await signIn(page);
  await page.getByRole("link", { name: /Rochat Léa/ }).click();
  await page.getByRole("button", { name: /^Edit/ }).filter({ visible: true }).first().click();
  await page.locator('input[type="tel"]').first().fill("+41 79 000 99 99");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved");
  await expect(page.getByRole("link", { name: "079 000 99 99" }).first()).toBeVisible();

  await page.reload();
  await signIn(page);
  await page.getByRole("link", { name: /Rochat Léa/ }).click();
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
