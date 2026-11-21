import { expect, test } from "@playwright/test";

test("shows numbers in local or international format without changing the card", async ({
  page,
}) => {
  await page.goto("./contacts/runeterra/p01");
  const number = page
    .getByRole("link", { name: "079 000 00 01", exact: true })
    .filter({ visible: true });
  await expect(number.first()).toHaveAttribute("href", "tel:+41 79 000 00 01");

  await page.goto("./settings");
  const format = page.getByRole("combobox", { name: "Phone format" });
  const preview = page.getByRole("figure", { name: "Preview" });
  await expect(format).toHaveValue("local");
  await expect(preview).toContainText("079 000 00 01");
  await format.selectOption("international");
  await expect(preview).toContainText("+41 79 000 00 01");
  await page.reload();
  await expect(format).toHaveValue("international");

  await page.goto("./contacts/runeterra/p01");
  const international = page
    .getByRole("link", { name: "+41 79 000 00 01", exact: true })
    .filter({ visible: true });
  await expect(international.first()).toHaveAttribute("href", "tel:+41 79 000 00 01");
  await expect(number).toHaveCount(0);

  await page.goto("./settings");
  await format.selectOption("local");
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("natel.preferences")))
    .toBeNull();
});

test("puts the phone format among the contact details settings, above the label position", async ({
  page,
}) => {
  await page.goto("./settings");
  function labelsUnder(heading: string) {
    return page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: heading, exact: true }) })
      .locator("label");
  }
  await expect(labelsUnder("Contact")).toHaveText(["Show first", "Contact image shape"]);
  await expect(labelsUnder("Contact details")).toHaveText([
    "Phone format",
    "Label position",
    "Open addresses in",
    "Show creation and modification dates",
  ]);
});

test("marks a number found by the digits of the format it is not shown in", async ({ page }) => {
  await page.goto("./settings");
  await page.getByRole("combobox", { name: "Phone format" }).selectOption("international");
  await page.goto("./contacts/runeterra");
  await page.getByRole("searchbox").fill("079 000 00 01");
  await expect(
    page.locator("mark", { hasText: "+41 79 000 00 01" }).filter({ visible: true }).first(),
  ).toBeVisible();
});
