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
  // The settings first, then Escape: the list with no contact open, which
  // arriving on it in the demo would not give (DESIGN.md "Demo arrival").
  await page.goto("./settings");
  await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/contacts\/runeterra$/);
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
  // The arrival contact's row is brought into view first.
  await expect(page).toHaveURL(/\/contacts\/runeterra\/p03$/);
  const list = page.locator("#list");
  const row = list.locator("a[data-contact-id]").nth(8);
  await expect(row).toBeVisible();
  await list.evaluate((element) => element.scrollTo(0, 400));
  await expect(row).toBeInViewport({ ratio: 1 });
  await row.click();
  await expect(row).toHaveAttribute("data-status", "active");
  expect(await list.evaluate((element) => element.scrollTop)).toBe(400);
});
