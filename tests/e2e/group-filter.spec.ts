import { expect, type Page, test } from "@playwright/test";
import { putCard, resetBook, vcard } from "./dav";
import { PASSWORD, USER } from "./env";

test.beforeEach(async () => {
  await resetBook();
  await putCard("ada", vcard(["UID:ada", "FN:Ada Lovelace", "N:Lovelace;Ada;;;"]));
  await putCard(
    "grace",
    vcard(["UID:grace", "FN:Grace Hopper", "N:Hopper;Grace;;;", "CATEGORIES:Famille"]),
  );
  await putCard("alan", vcard(["UID:alan", "FN:Alan Turing", "N:Turing;Alan;;;"]));
  await putCard(
    "family",
    vcard([
      "UID:family",
      "FN:Famille",
      "N:Famille;;;;",
      "X-ADDRESSBOOKSERVER-KIND:group",
      "X-ADDRESSBOOKSERVER-MEMBER:urn:uuid:ada",
    ]),
  );
});

async function signIn(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByLabel("Username").fill(USER);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("link", { name: /Lovelace/ })).toBeVisible();
}

test("filters the list on a group from its group card and CATEGORIES", async ({ page }) => {
  await signIn(page);
  await page.getByRole("button", { name: /^Filter by group/ }).click();
  await page.getByRole("menuitemradio", { name: /Famille/ }).click();

  await expect(page.getByText("2 contacts in Famille")).toBeVisible();
  await expect(page.getByRole("link", { name: /Lovelace/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Hopper/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Turing/ })).toHaveCount(0);

  await page.getByRole("button", { name: "Show all groups" }).click();
  await expect(page.getByText("3 contacts")).toBeVisible();
  await expect(page.getByRole("link", { name: /Turing/ })).toBeVisible();
});

test("puts the group filter on its own row on a phone", async ({ page, isMobile }) => {
  test.skip(!isMobile, "the row only breaks below 640px");
  await signIn(page);
  const count = await page.getByText("3 contacts").boundingBox();
  const filter = await page.getByRole("button", { name: /^Filter by group/ }).boundingBox();
  expect(count && filter && filter.y >= count.y + count.height).toBe(true);
  // The count stays on one line.
  expect(count && count.height < 24).toBe(true);
});
