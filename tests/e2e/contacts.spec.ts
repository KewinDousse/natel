import { expect, type Page, test } from "@playwright/test";
import { getCard, listCards, putCard, resetBook, vcard } from "./dav";
import { PASSWORD, SERVER, USER } from "./env";

// Not edited by the UI: must survive every save untouched. The grouped
// pair is how Apple clients label a value.
const UNKNOWN = [
  "X-NATEL-E2E;X-PARAM=kept:unknown value",
  "item1.URL:https://example.org/ada",
  "item1.X-ABLabel:Notes",
];

const ADA = vcard([
  "UID:ada",
  "FN:Ada Lovelace",
  "N:Lovelace;Ada;;;",
  "ORG:Analytical Engines",
  // X-SOURCE is a parameter the UI does not know; it stays on the edited TEL.
  "TEL;TYPE=CELL;X-SOURCE=phone:+41 79 000 00 01",
  ...UNKNOWN,
]);

/**
 * Property and group names are case-insensitive (RFC 6350 §3.3), and both
 * Radicale and ical.js change their case (ADR 011): compare names without
 * case, values exactly.
 */
function expectUnknownKept(card: string | null): void {
  const lines = (card ?? "").split(/\r?\n/);
  for (const expected of UNKNOWN) {
    const colon = expected.indexOf(":");
    const name = expected.slice(0, colon).toLowerCase();
    const value = expected.slice(colon);
    const found = lines.some(
      (line) => line.slice(0, colon).toLowerCase() === name && line.slice(colon) === value,
    );
    expect(found, `${expected} kept in:\n${card}`).toBe(true);
  }
}

async function signIn(page: Page, password = PASSWORD): Promise<void> {
  await page.goto("/");
  await page.getByLabel("Username").fill(USER);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

async function openAda(page: Page): Promise<void> {
  await page.getByRole("link", { name: /Lovelace Ada/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: /Lovelace/ })).toBeAttached();
}

async function startEditing(page: Page): Promise<void> {
  await page.getByRole("button", { name: /^Edit/ }).filter({ visible: true }).first().click();
  await expect(page.getByRole("button", { name: "Save" })).toBeVisible();
}

function primaryPhoneInput(page: Page) {
  return page.locator('input[type="tel"]').first();
}

test.beforeEach(async () => {
  await resetBook();
  await putCard("ada", ADA);
});

test("rejects a wrong password", async ({ page }) => {
  test.skip(!SERVER.checksPassword, "the server leaves authentication to a proxy");
  await signIn(page, "wrong-password");
  await expect(page.getByText("Invalid username or password.")).toBeVisible();
});

test("signs in, opens a contact and signs out", async ({ page }) => {
  await signIn(page);
  await openAda(page);
  await expect(page.getByRole("link", { name: "079 000 00 01" }).first()).toBeVisible();
  // On a phone the contact is its own screen, without the header.
  if (test.info().project.name === "mobile") {
    await page.getByRole("link", { name: "Back to contacts" }).filter({ visible: true }).click();
  }
  await page.getByRole("button", { name: "Sign out" }).filter({ visible: true }).click();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
});

test("edits a phone number and keeps unknown properties", async ({ page }) => {
  await signIn(page);
  await openAda(page);
  await startEditing(page);
  await primaryPhoneInput(page).fill("+41 79 000 00 00");
  await page.getByRole("button", { name: "Save" }).click();
  // The toast shows once the PUT has landed; the Save button is renamed
  // "Saving…" as soon as it starts.
  await expect(page.getByRole("status")).toHaveText("Saved");

  const saved = await getCard("ada");
  expect(saved).toContain("TEL;TYPE=CELL;X-SOURCE=phone:+41 79 000 00 00");
  expectUnknownKept(saved);
});

test("shows a semicolon the server escaped, and saves it without adding a backslash", async ({
  page,
}) => {
  // A 3.0 card as Radicale stores it, every semicolon in text escaped (RFC 2426).
  await putCard("ada", ADA.replace("END:VCARD", "NOTE:Lac 1\\; 2e étage\r\nEND:VCARD"));
  await signIn(page);
  await openAda(page);
  await expect(page.getByText("Lac 1; 2e étage").filter({ visible: true })).toBeVisible();
  await startEditing(page);
  await primaryPhoneInput(page).fill("+41 79 000 00 00");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved");

  const note = (await getCard("ada"))?.split(/\r?\n/).find((line) => /^NOTE:/i.test(line));
  expect(note?.replace(/\\([\\,;])/g, "$1")).toBe("NOTE:Lac 1; 2e étage");
});

test("creates a contact", async ({ page }) => {
  await signIn(page);
  await page.getByRole("link", { name: "New contact" }).filter({ visible: true }).click();
  await page.getByPlaceholder("Last name").fill("Hopper");
  await page.getByPlaceholder("First name").fill("Grace");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("heading", { level: 1, name: /Hopper/ })).toBeAttached();

  const cards = await listCards();
  expect(cards).toHaveLength(2);
  expect(cards.find((c) => c.includes("N:Hopper;Grace"))).toContain("VERSION:3.0");
});

/** Edits the phone number while another client changes the card, then saves. */
async function saveOverConcurrentEdit(page: Page): Promise<void> {
  await signIn(page);
  await openAda(page);
  await startEditing(page);

  // Another client edits the card while this one is editing it.
  await putCard(
    "ada",
    ADA.replace("+41 79 000 00 01", "+41 79 000 00 21").replace(
      "ORG:Analytical Engines",
      "ORG:Difference Engines",
    ),
  );

  await primaryPhoneInput(page).fill("+41 79 000 00 22");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("This contact was modified elsewhere.")).toBeVisible();
  // Nothing was written over the other client's version.
  expect(await getCard("ada")).toContain("+41 79 000 00 21");
}

test("reloads the server version after a conflict", async ({ page }) => {
  await saveOverConcurrentEdit(page);
  await page.getByRole("button", { name: "Reload" }).click();
  await expect(page.getByText("This contact was modified elsewhere.")).toBeHidden();
  await expect(page.getByRole("link", { name: "079 000 00 21" }).first()).toBeVisible();
});

test("overwrites only the fields the user changed after a conflict", async ({ page }) => {
  await saveOverConcurrentEdit(page);
  await page.getByRole("button", { name: "Overwrite with my version" }).click();
  // The banner goes away as the PUT starts; the toast shows once it has landed.
  await expect(page.getByRole("status")).toHaveText("Saved");

  const saved = await getCard("ada");
  // The user's phone number wins; the other client's organisation stays (ADR 013).
  expect(saved).toContain("+41 79 000 00 22");
  expect(saved).toContain("ORG:Difference Engines");
  expectUnknownKept(saved);
});

test("deletes a contact after confirmation", async ({ page }) => {
  await signIn(page);
  await openAda(page);
  await startEditing(page);
  await page.getByRole("button", { name: "Delete contact" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();

  await expect(page.getByText("This address book is empty.")).toBeVisible();
  expect(await getCard("ada")).toBeNull();
});

test("does not delete a contact changed on the server since it was opened", async ({ page }) => {
  await signIn(page);
  await openAda(page);
  await startEditing(page);

  // Another client edits the card after this one loaded it.
  await putCard("ada", ADA.replace("+41 79 000 00 01", "+41 79 000 00 21"));

  await page.getByRole("button", { name: "Delete contact" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText("This contact was modified elsewhere.")).toBeVisible();
  expect(await getCard("ada")).toContain("+41 79 000 00 21");

  await page.getByRole("button", { name: "Reload" }).click();
  await expect(page.getByRole("link", { name: "079 000 00 21" }).first()).toBeVisible();
});

test("a background refresh during editing does not write over another client's change", async ({
  page,
}) => {
  // The list refetches on focus once older than its 5 min staleTime.
  await page.clock.install();
  await signIn(page);
  await openAda(page);
  await startEditing(page);

  // Another client edits the card, then the user comes back to the tab.
  await putCard(
    "ada",
    ADA.replace("ORG:Analytical Engines", "ORG:Difference Engines")
      .replace("FN:Ada Lovelace", "FN:Ada King")
      .replace("N:Lovelace;Ada;;;", "N:King;Ada;;;"),
  );
  await page.clock.fastForward("06:00");
  await page.evaluate(() => {
    window.dispatchEvent(new Event("focus"));
    document.dispatchEvent(new Event("visibilitychange", { bubbles: true }));
  });
  // The page title follows the cache: the refetched card has reached the page.
  await expect(page.getByRole("heading", { level: 1, name: /King/ })).toBeAttached();

  await primaryPhoneInput(page).fill("+41 79 000 00 22");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("This contact was modified elsewhere.")).toBeVisible();
  const saved = await getCard("ada");
  expect(saved).toContain("ORG:Difference Engines");
  expect(saved).toContain("N:King;Ada;;;");
  expect(saved).toContain("+41 79 000 00 01");
});
