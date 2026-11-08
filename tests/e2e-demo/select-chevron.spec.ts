import { expect, type Locator, test } from "@playwright/test";

async function expectHouseChevron(select: Locator) {
  await select.scrollIntoViewIfNeeded();
  await expect(select).toBeVisible();
  expect(await select.evaluate((element) => getComputedStyle(element).appearance)).toBe("none");
  const chevron = select.locator("xpath=following-sibling::*[local-name()='svg']");
  await expect(chevron).toBeVisible();
  const [field, mark] = await Promise.all([select.boundingBox(), chevron.boundingBox()]);
  if (!field || !mark) throw new Error("Missing select bounds");
  // Inside the field, at its right, vertically centred.
  expect(mark.x + mark.width).toBeLessThanOrEqual(field.x + field.width);
  expect(mark.x).toBeGreaterThan(field.x + field.width / 2);
  expect(Math.abs(mark.y + mark.height / 2 - (field.y + field.height / 2))).toBeLessThan(1);
  // A click on the chevron reaches the select.
  const hit = await select.evaluate(
    (element, [x, y]) => document.elementFromPoint(x ?? 0, y ?? 0) === element,
    [mark.x + mark.width / 2, mark.y + mark.height / 2],
  );
  expect(hit).toBe(true);
  const colour = (target: Locator) => target.evaluate((element) => getComputedStyle(element).color);
  expect(await colour(chevron)).toBe(await colour(select));
}

test("draws the app's chevron on the settings' selects", async ({ page }) => {
  await page.goto("./settings");
  const selects = page.locator("main select");
  await expect(selects.first()).toBeVisible();
  expect(await selects.count()).toBeGreaterThanOrEqual(6);
  for (const select of await selects.all()) await expectHouseChevron(select);
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`draws the app's chevron on a form's type menu, ${colorScheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await page.goto("./contacts/runeterra/p01?edit=true");
    const menu = page.locator("#sec-tel select").first();
    await expectHouseChevron(menu);
    // The type menu stays muted beside the value it qualifies.
    const muted = await page.evaluate(() => {
      const probe = document.createElement("span");
      probe.style.color = "var(--muted-foreground)";
      document.body.append(probe);
      const colour = getComputedStyle(probe).color;
      probe.remove();
      return colour;
    });
    expect(await menu.evaluate((element) => getComputedStyle(element).color)).toBe(muted);
  });
}

for (const width of [390, 1280]) {
  test(`draws the app's chevron on the sign-in language select at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("./login");
    await expectHouseChevron(page.locator("select").filter({ visible: true }).first());
  });
}
