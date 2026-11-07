import { expect, type Locator, test } from "@playwright/test";

async function expectShape(avatar: Locator, shape: "round" | "square"): Promise<void> {
  await expect
    .poll(async () =>
      avatar.evaluate((element) => {
        const { width, height } = element.getBoundingClientRect();
        const radius = Number.parseFloat(getComputedStyle(element).borderRadius);
        if (width === 0 || width !== height || radius <= 0) return null;
        return radius >= width / 2 ? "round" : "square";
      }),
    )
    .toBe(shape);
}

test("remembers contact image shape across the list, contact page and form", async ({ page }) => {
  await page.goto("./contacts/runeterra");
  const photo = page.getByRole("link", { name: /Luxanna Crownguard/ }).locator("img");
  await expectShape(photo, "round");
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  const shape = page.getByRole("combobox", { name: "Contact image shape" });
  await expect(shape).toHaveValue("round");
  await shape.selectOption("square");
  await page.reload();
  await expect(shape).toHaveValue("square");

  await page.goto("./contacts/runeterra");
  await expectShape(photo, "square");
  await page.getByRole("link", { name: /Luxanna Crownguard/ }).click();
  const detailPhoto = page.locator("main img").last();
  await expectShape(detailPhoto, "square");
  await page.getByRole("button", { name: /^Edit/ }).filter({ visible: true }).first().click();
  await expectShape(detailPhoto, "square");

  await page.goto("./settings");
  await shape.selectOption("round");
  await page.reload();
  await expect(shape).toHaveValue("round");
  expect(await page.evaluate(() => localStorage.getItem("natel.preferences"))).toBeNull();
  await page.goto("./contacts/runeterra/p01");
  await expectShape(detailPhoto, "round");
  await page.getByRole("button", { name: /^Edit/ }).filter({ visible: true }).first().click();
  await expectShape(detailPhoto, "round");
});
