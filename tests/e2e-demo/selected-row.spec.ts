import { expect, test } from "@playwright/test";

test.beforeEach(({ isMobile }) => {
  test.skip(isMobile, "On phones, a contact replaces the list.");
});

test("brings a directly linked contact's row into view", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 600 });
  await page.goto("./contacts/runeterra/p05");
  await expect(page.locator('#list a[data-status="active"]')).toBeInViewport({ ratio: 1 });
});

test("brings the row opened with the arrow keys into view", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 600 });
  await page.goto("./contacts/runeterra");
  const rows = page.locator("#list a[data-contact-id]");
  await expect(rows.first()).toBeVisible();
  const last = await rows.last().getAttribute("data-contact-id");
  // With no contact open, the up arrow opens the last one.
  await page.keyboard.press("ArrowUp");
  await expect(page).toHaveURL(new RegExp(`/contacts/runeterra/${last}$`));
  await expect(page.locator('#list a[data-status="active"]')).toBeInViewport({ ratio: 1 });
});

test("leaves the list in place when a visible row is clicked", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 600 });
  await page.goto("./contacts/runeterra");
  const list = page.locator("#list");
  const row = list.locator("a[data-contact-id]").nth(8);
  await expect(row).toBeVisible();
  await list.evaluate((element) => element.scrollTo(0, 400));
  await expect(row).toBeInViewport({ ratio: 1 });
  await row.click();
  await expect(row).toHaveAttribute("data-status", "active");
  expect(await list.evaluate((element) => element.scrollTop)).toBe(400);
});
