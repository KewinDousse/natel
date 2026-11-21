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

test("shows the contacts in no group, and one leaves them when it joins a group", async ({
  page,
  isMobile,
}) => {
  await signIn(page);
  await page.getByRole("button", { name: /^Filter by group/ }).click();
  await expect(page.getByRole("menuitemradio", { name: /^No group/ })).toHaveText("No group1");
  await page.getByRole("menuitemradio", { name: /^No group/ }).click();

  await expect(page.getByText("1 contact", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /Turing/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Lovelace/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Hopper/ })).toHaveCount(0);
  // The groups editor is the same on phones.
  if (isMobile) return;

  await page.getByRole("link", { name: /Turing/ }).click();
  await page.getByRole("button", { name: /^Edit/ }).filter({ visible: true }).first().click();
  const input = page.getByRole("combobox", { name: "Add a group" });
  await input.fill("Famille");
  await input.press("Enter");
  const dialog = page.getByRole("dialog", { name: /How should .* store its groups\?/ });
  await dialog.getByRole("radio", { name: /^Group cards/ }).check();
  await dialog.getByRole("button", { name: "Use this format" }).click();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Saved")).toBeVisible();

  await expect(page.getByText("Every contact is in a group.")).toBeVisible();
  await expect(page.getByRole("link", { name: /Turing/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Filter by group/ })).toHaveText("No group");
  await expect(page.getByRole("heading", { name: "Alan Turing" })).toBeVisible();
});

test("keeps the group filter on the count's row on a phone, the whole sort under it at 320px", async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, "the toolbar holds one row on wider screens");
  await signIn(page);
  const count = await page.getByText("3 contacts").boundingBox();
  const filter = await page.getByRole("button", { name: /^Filter by group/ }).boundingBox();
  expect(count && filter && filter.y < count.y + count.height).toBe(true);
  expect(count && filter && count.y < filter.y + filter.height).toBe(true);
  // The count stays on one line.
  expect(count && count.height < 24).toBe(true);
  // Too narrow for the sort too: it wraps on the right, under the filter.
  await page.setViewportSize({ width: 320, height: 700 });
  const narrowFilter = await page.getByRole("button", { name: /^Filter by group/ }).boundingBox();
  const sort = await page.getByRole("button", { name: /^Sort:/ }).boundingBox();
  expect(sort && narrowFilter && sort.y >= narrowFilter.y + narrowFilter.height).toBe(true);
  expect(
    sort && narrowFilter && Math.abs(sort.x + sort.width - (narrowFilter.x + narrowFilter.width)),
  ).toBeLessThan(1);
  // The longest label, in French, still fits whole.
  await page.evaluate(() => localStorage.setItem("natel.preferences", '{"locale":"fr"}'));
  await page.reload();
  await page.getByRole("button", { name: /^Tri/ }).click();
  await page.getByRole("menuitemradio", { name: "Modifiés récemment" }).click();
  const label = page.getByRole("button", { name: "Tri\u00a0: Modifiés récemment" }).locator("span");
  expect(await label.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
});
