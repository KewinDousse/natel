import { expect, type Page, test } from "@playwright/test";

// Two searches round-trip through the list: an arrival still on its way has
// landed by the time the second one shows its result.
async function settle(page: Page, name: string) {
  const search = page.getByRole("searchbox");
  await search.fill(name);
  await expect(page.getByRole("link", { name: new RegExp(name) })).toBeVisible();
  await search.fill("");
  await expect(page.locator("#list a[data-contact-id]").nth(1)).toBeVisible();
}

test("opens a full contact beside the list on arrival", async ({ page, isMobile }) => {
  test.skip(isMobile, "Phones show the list alone.");
  await page.goto("./contacts");
  await expect(page).toHaveURL(/\/contacts\/runeterra\/p03$/);
  await expect(page.getByRole("heading", { level: 1, name: "Caitlyn Kiramman" })).toBeVisible();
  // Back on the list within the visit, nothing opens by itself.
  await page.getByRole("button", { name: /Runeterra/ }).click();
  await page.getByRole("menuitemradio", { name: /Expédition 33/ }).click();
  await settle(page, "Aline Dessendre");
  await expect(page).toHaveURL(/\/contacts\/expedition-33$/);
  await expect(page.getByText("Select a contact")).toBeVisible();
});

test("opens the named book's own contact", async ({ page, isMobile }) => {
  test.skip(isMobile, "Phones show the list alone.");
  await page.goto("./contacts/expedition-33");
  await expect(page).toHaveURL(/\/contacts\/expedition-33\/e08$/);
});

test("keeps the list alone on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto("./contacts/runeterra");
  await settle(page, "Caitlyn Kiramman");
  await expect(page).toHaveURL(/\/contacts\/runeterra$/);
});
