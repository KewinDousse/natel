import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { putCard, resetBook, vcard } from "./dav";
import { PASSWORD, USER } from "./env";

test("reports an unreadable book, retries, and restores the list and focus", async ({ page }) => {
  await resetBook();
  await putCard("ada", vcard(["UID:ada", "FN:Ada Lovelace", "N:Lovelace;Ada;;;"]));
  await page.route("**/dav/**", async (route) => {
    const response = await route.fetch();
    if (route.request().method() !== "REPORT") {
      await route.fulfill({ response });
      return;
    }
    const body = (await response.text()).replace(
      /<([\w-]+:)?address-data\b[^>]*>[\s\S]*?<\/(?:[\w-]+:)?address-data>/g,
      '<address-data xmlns="urn:ietf:params:xml:ns:carddav">invalid synthetic card</address-data>',
    );
    await route.fulfill({ response, body });
  });
  await page.goto("/");
  await page.getByLabel("Username").fill(USER);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  const warning = page.getByRole("status", { name: "Incomplete list" });
  await expect(warning).toContainText("1 card could not be displayed.");
  await expect(page.getByText("This address book is empty")).toHaveCount(0);
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .exclude("[data-logotype]")
    .analyze();
  expect(violations.map((violation) => violation.id)).toEqual([]);
  await page.unroute("**/dav/**");
  await warning.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("link", { name: /Ada Lovelace/ })).toBeVisible();
  await expect(warning).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Contacts" })).toBeFocused();
});
