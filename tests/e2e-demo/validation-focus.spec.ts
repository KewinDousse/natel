import { expect, type Locator, type Page, test } from "@playwright/test";

const belowBar = async (page: Page, field: Locator) => {
  const box = await field.boundingBox();
  const bar = await page.locator("[data-contact-edit-bar]").boundingBox();
  if (!box || !bar) throw new Error("Missing field or edit bar bounds");
  return box.y + box.height > bar.y;
};

test("Save focuses the first invalid field and brings it above the edit bar", async ({
  page,
  viewport,
}) => {
  // Short enough for the last field to sit under the edit bar.
  await page.setViewportSize({ width: viewport?.width ?? 1280, height: 560 });
  await page.goto("./contacts/runeterra/new");
  const save = page.getByRole("button", { name: "Save", exact: true });
  const firstName = page.getByLabel("First name", { exact: true });
  await save.click();
  await expect(firstName).toBeFocused();
  await expect(firstName).toHaveAttribute("aria-invalid", "true");

  await firstName.fill("Camille");
  await page.getByRole("button", { name: "Add email", exact: true }).click();
  const email = page.locator('input[type="email"]').last();
  await email.fill("invalid");
  await page.getByRole("button", { name: "Add information", exact: true }).click();
  await page.getByRole("menuitem", { name: "Add website", exact: true }).click();
  const website = page.getByLabel("Website", { exact: true });
  await website.fill("invalid");
  await save.click();
  await expect(email).toBeFocused();
  await expect(email).toHaveAttribute("aria-invalid", "true");
  await expect(website).toHaveAttribute("aria-invalid", "true");

  await email.fill("camille@example.org");
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    for (const aside of document.querySelectorAll("aside")) aside.scrollTop = 0;
  });
  expect(await belowBar(page, website)).toBe(true);
  await save.click();
  await expect(website).toBeFocused();
  await expect(async () => {
    const box = await website.boundingBox();
    expect(box?.y ?? -1).toBeGreaterThanOrEqual(0);
    expect(await belowBar(page, website)).toBe(false);
  }).toPass();
});
