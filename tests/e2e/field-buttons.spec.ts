import { expect, type Locator, type Page, test } from "@playwright/test";
import { PASSWORD, USER } from "./env";

/** The button's height and its gaps to the field's top and bottom edges, in pixels. */
async function gaps(
  field: Locator,
  button: Locator,
): Promise<{ top: number; bottom: number; height: number }> {
  const outer = await field.boundingBox();
  const inner = await button.boundingBox();
  if (!outer || !inner) throw new Error("not laid out");
  return {
    top: inner.y - outer.y,
    bottom: outer.y + outer.height - (inner.y + inner.height),
    height: inner.height,
  };
}

/** Centred, and small enough to clear the field's border (DESIGN.md). */
function expectCentred({
  top,
  bottom,
  height,
}: {
  top: number;
  bottom: number;
  height: number;
}): void {
  expect(height).toBe(32);
  expect(top).toBeGreaterThan(0);
  expect(Math.abs(top - bottom)).toBeLessThanOrEqual(1);
}

async function fillSignIn(page: Page): Promise<void> {
  await page.context().clearCookies();
  await page.goto("/");
  await page.getByLabel("Username").fill(USER);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
}

test("centres the password's show button inside its field", async ({ page }) => {
  await fillSignIn(page);
  expectCentred(
    await gaps(
      page.getByLabel("Password", { exact: true }),
      page.getByRole("button", { name: "Show" }),
    ),
  );
});

test("centres the search's clear button inside its field", async ({ page }) => {
  await fillSignIn(page);
  await page.getByRole("button", { name: "Sign in" }).click();
  const search = page.getByRole("searchbox");
  await expect(search).toBeVisible();
  await search.fill("a");
  expectCentred(await gaps(search, page.getByRole("button", { name: "Clear search" })));
});
