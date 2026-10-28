import { expect, test } from "@playwright/test";
import { putCard, resetBook, vcard } from "./dav";
import { PASSWORD, USER } from "./env";

test.skip(({ isMobile }) => isMobile, "reading groups doesn't depend on the viewport");

test.beforeEach(async () => {
  await resetBook();
  await putCard(
    "ada",
    vcard(["UID:ada", "FN:Ada Lovelace", "N:Lovelace;Ada;;;", "CATEGORIES:Travail"]),
  );
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

test("keeps group cards out of the list and shows both kinds of groups", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Username").fill(USER);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByRole("link", { name: /Lovelace/ })).toBeVisible();
  await expect(page.getByText("1 contact", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /Famille/ })).toHaveCount(0);

  await page.getByRole("link", { name: /Lovelace/ }).click();
  const groups = page.locator("section").filter({ has: page.getByText("Groups", { exact: true }) });
  await expect(groups.getByText("Famille", { exact: true })).toBeVisible();
  await expect(groups.getByText("Travail", { exact: true })).toBeVisible();
});

test("keeps an imported group card out of the list", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Username").fill(USER);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("link", { name: /Lovelace/ })).toBeVisible();

  await page.getByRole("button", { name: /Address book/ }).click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("menuitem", { name: "Import a .vcf file…" }).click();
  const club = vcard(["UID:club", "FN:Club", "KIND:group", "MEMBER:urn:uuid:ada"]).replace(
    "VERSION:3.0",
    "VERSION:4.0",
  );
  await (await chooser).setFiles({
    name: "club.vcf",
    mimeType: "text/vcard",
    buffer: Buffer.from(club),
  });
  await page
    .getByRole("dialog", { name: /Import into/ })
    .getByRole("button", { name: /^Import \d+ contacts?$/ })
    .click();
  const dialog = page.getByRole("dialog", { name: /Import into/ });
  await expect(dialog.getByText("Imported: 1")).toBeVisible();
  await dialog.getByRole("button", { name: "Close" }).click();

  await expect(page.getByText("1 contact", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /Club/ })).toHaveCount(0);
  await page.getByRole("link", { name: /Lovelace/ }).click();
  const groups = page.locator("section").filter({ has: page.getByText("Groups", { exact: true }) });
  await expect(groups.getByText("Club", { exact: true })).toBeVisible();
});
