import { expect, type Page, test } from "@playwright/test";
import { createBook, deleteCard, EXTRA_BOOK_PATH, getCard, putCard, resetBook, vcard } from "./dav";
import { PASSWORD, USER } from "./env";

test.skip(({ isMobile }) => isMobile, "the move is the same page on phones");

const ADA = vcard(["UID:ada", "FN:Ada Lovelace", "N:Lovelace;Ada;;;", "X-KEEP;X-P=1:yes"]);

async function signIn(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByLabel("Username").fill(USER);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  // Discovery may list the extra book first.
  const switcher = page.getByRole("button", { name: /Address book/ });
  await expect(switcher).toBeVisible();
  if (!/Contacts/.test((await switcher.textContent()) ?? "")) {
    await switcher.click();
    await page.getByRole("menuitemradio", { name: "Contacts" }).click();
  }
  await expect(page.getByRole("link", { name: /Lovelace/ })).toBeVisible();
}

async function editAda(page: Page): Promise<void> {
  await page.getByRole("link", { name: /Lovelace/ }).click();
  await page.getByRole("button", { name: /^Edit/ }).filter({ visible: true }).first().click();
  await expect(page.getByRole("button", { name: "Save" })).toBeVisible();
}

test.beforeEach(async () => {
  await resetBook();
  await createBook(EXTRA_BOOK_PATH, "Work");
  await putCard("ada", ADA);
});

test("moves a contact to another book, card unchanged", async ({ page }) => {
  await signIn(page);
  await editAda(page);
  await page.getByRole("button", { name: "Move to another address book" }).click();
  const dialog = page.getByRole("dialog", { name: "Move this contact?" });
  // The only other book is chosen already.
  await expect(dialog.getByRole("radio", { name: "Work" })).toBeChecked();
  await dialog.getByRole("button", { name: "Move" }).click();

  await expect(page.getByText("Moved to “Work”")).toBeVisible();
  await expect(page.getByRole("button", { name: /Address book/ })).toHaveText(/Work/);
  await expect(page.getByRole("heading", { level: 1, name: /Lovelace/ })).toBeAttached();
  expect(await getCard("ada")).toBeNull();
  expect(await getCard("ada", EXTRA_BOOK_PATH)).toBe(ADA);
});

test("asks to save or cancel before moving unsaved changes", async ({ page }) => {
  await signIn(page);
  await editAda(page);
  await page.getByLabel("Last name", { exact: true }).fill("Byron");
  const move = page.getByRole("button", { name: "Move to another address book" });
  await expect(move).toBeDisabled();
  await expect(page.getByText("Save or cancel your changes first.")).toBeVisible();
});

test("stops without writing when the card changed elsewhere", async ({ page }) => {
  await signIn(page);
  await editAda(page);
  const changed = ADA.replace("FN:Ada Lovelace", "FN:Ada King");
  await putCard("ada", changed);
  await page.getByRole("button", { name: "Move to another address book" }).click();
  const dialog = page.getByRole("dialog", { name: "Move this contact?" });
  await dialog.getByRole("radio", { name: "Work" }).check();
  await dialog.getByRole("button", { name: "Move" }).click();

  await expect(page.getByText("Reload it to see the changes before moving it.")).toBeVisible();
  expect(await getCard("ada")).toBe(changed);
  expect(await getCard("ada", EXTRA_BOOK_PATH)).toBeNull();
});

test("offers no move with a single book", async ({ page }) => {
  await resetBook();
  await putCard("ada", ADA);
  await signIn(page);
  await editAda(page);
  await expect(page.getByRole("button", { name: "Delete contact" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Move to another address book" })).toHaveCount(0);
});

test("stops without writing when the card was deleted elsewhere", async ({ page }) => {
  await signIn(page);
  await editAda(page);
  await deleteCard("ada");
  await page.getByRole("button", { name: "Move to another address book" }).click();
  const dialog = page.getByRole("dialog", { name: "Move this contact?" });
  await dialog.getByRole("radio", { name: "Work" }).check();
  await dialog.getByRole("button", { name: "Move" }).click();

  await expect(page.getByText("Reload it to see the changes before moving it.")).toBeVisible();
  expect(await getCard("ada", EXTRA_BOOK_PATH)).toBeNull();
});

test("edits and saves a contact moved into a book already opened", async ({ page }) => {
  await signIn(page);
  // Open Work once, so its contacts are cached when the card lands there.
  await page.getByRole("button", { name: /Address book/ }).click();
  await page.getByRole("menuitemradio", { name: "Work" }).click();
  await expect(page.getByText("This address book is empty")).toBeVisible();
  await page.getByRole("button", { name: /Address book/ }).click();
  await page.getByRole("menuitemradio", { name: "Contacts" }).click();
  await editAda(page);
  await page.getByRole("button", { name: "Move to another address book" }).click();
  const dialog = page.getByRole("dialog", { name: "Move this contact?" });
  await dialog.getByRole("radio", { name: "Work" }).check();
  await dialog.getByRole("button", { name: "Move" }).click();
  await expect(page.getByText("Moved to “Work”")).toBeVisible();

  await page.getByRole("button", { name: /^Edit/ }).filter({ visible: true }).first().click();
  await page.getByLabel("Last name", { exact: true }).fill("Byron");
  await page.getByRole("button", { name: "Save" }).click();
  // The button reads "Saving…" while the PUT runs: wait for the server instead.
  await expect.poll(() => getCard("ada", EXTRA_BOOK_PATH)).toContain("N:Byron;Ada;;;");
});
