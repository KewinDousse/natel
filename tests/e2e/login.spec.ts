import { expect, test } from "@playwright/test";
import { PASSWORD, USER } from "./env";

test.skip(({ isMobile }) => isMobile, "the markup doesn't depend on the viewport");

// What password managers key on to recognise a sign-in form and offer to fill
// or save it.
test("marks the sign-in form for password managers", async ({ page }) => {
  await page.goto("/");
  const form = page.locator("form").filter({ has: page.locator('input[type="password"]') });
  await expect(form).toHaveAttribute("method", "post");
  await expect(page.getByLabel("Username")).toHaveAttribute("name", "username");
  await expect(page.getByLabel("Username")).toHaveAttribute("autocomplete", "username");
  const password = page.getByLabel("Password", { exact: true });
  await expect(password).toHaveAttribute("name", "password");
  await expect(password).toHaveAttribute("autocomplete", "current-password");
});

// Baïkal opens a PHP session on every request: its cookie would stay in the
// browser after the logout, so the proxy lets none through.
test("leaves no cookie in the browser once signed in", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Username").fill(USER);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("searchbox")).toBeVisible();
  expect(await page.context().cookies()).toEqual([]);
});
