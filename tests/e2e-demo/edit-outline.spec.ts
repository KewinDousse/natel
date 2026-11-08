import { expect, type Locator, test } from "@playwright/test";

const fill = (control: Locator) =>
  control.evaluate((element) => getComputedStyle(element).backgroundColor);

test("fills Call and draws Edit, Text and Email as outlines", async ({ page, isMobile }) => {
  await page.goto("./contacts/runeterra/p01");
  const call = page.getByRole("link", { name: "Call", exact: true });
  const edit = page.getByRole("button", { name: /^Edit( \(E\))?$/ }).filter({ visible: true });
  await expect(call).toBeVisible();
  await expect(edit).toHaveCount(1);
  const pageFill = await fill(page.locator("body"));
  expect(await fill(call)).not.toBe(pageFill);
  const outlines = [
    edit,
    page.getByRole("link", { name: "Text", exact: true }),
    page.getByRole("link", { name: "Email", exact: true }),
  ];
  for (const outline of outlines) {
    expect(await fill(outline), String(outline)).toBe(pageFill);
  }
  expect(
    await edit.evaluate((element) => Number.parseFloat(getComputedStyle(element).borderTopWidth)),
    isMobile ? "the top bar's Edit" : "the desktop Edit",
  ).toBeGreaterThan(0);
});
