import { expect, test } from "@playwright/test";

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
