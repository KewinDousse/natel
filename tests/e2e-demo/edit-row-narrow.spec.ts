import { expect, type Page, test } from "@playwright/test";

async function rowOf(page: Page, section: string, type: string) {
  // The row is the closest block holding both the type menu and the field.
  const row = page
    .locator(section)
    .getByRole("combobox")
    .first()
    .locator(`xpath=ancestor::div[.//${type}][1]`);
  const [menu, field, remove] = await Promise.all([
    row.getByRole("combobox").first().boundingBox(),
    row.locator(type).first().boundingBox(),
    row.getByRole("button").first().boundingBox(),
  ]);
  if (!menu || !field || !remove) throw new Error("Missing row parts");
  return { menu, field, remove };
}

const edit = (page: Page) => page.goto("./contacts/runeterra/p01?edit=true");
const size = (page: Page, width: number) => page.setViewportSize({ width, height: 800 });

test("keeps the remove button beside the menu when the field takes its own line", async ({
  page,
}) => {
  await size(page, 320);
  await edit(page);
  const { menu, field, remove } = await rowOf(page, "#sec-tel", "input");
  expect(remove.y).toBe(menu.y);
  expect(field.y).toBeGreaterThan(menu.y + menu.height);
  expect(remove.x + remove.width).toBe(field.x + field.width);
});

test("puts menu, field and remove button on one line when the field keeps 10rem", async ({
  page,
}) => {
  await size(page, 360);
  await edit(page);
  const { menu, field, remove } = await rowOf(page, "#sec-tel", "input");
  expect(field.y).toBe(menu.y);
  expect(remove.y).toBe(menu.y);
  expect(field.width).toBeGreaterThanOrEqual(160);
});

test("keeps a row without a remove button on one line at 320px", async ({ page }) => {
  await size(page, 320);
  await page.goto("./contacts/runeterra/p06?edit=true");
  const row = page
    .locator("#sec-url")
    .getByRole("combobox")
    .first()
    .locator("xpath=ancestor::div[.//input][1]");
  const [menu, field] = await Promise.all([
    row.getByRole("combobox").boundingBox(),
    row.locator("input").boundingBox(),
  ]);
  if (!menu || !field) throw new Error("Missing row parts");
  expect(field.y).toBe(menu.y);
});

test("keeps an address's remove button beside its menu on phones", async ({ page }) => {
  await size(page, 412);
  await edit(page);
  const { menu, field, remove } = await rowOf(page, "#sec-adr", "input");
  expect(remove.y).toBe(menu.y);
  expect(field.y).toBeGreaterThan(menu.y + menu.height);
});
