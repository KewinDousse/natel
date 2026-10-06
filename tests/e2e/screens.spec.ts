import { expect, type Page, test } from "@playwright/test";
import { putCard, resetBook, vcard } from "./dav";
import { PASSWORD, USER } from "./env";

// Screenshots of every screen for visual review, not assertions on pixels:
// `SCREENSHOTS=1 pnpm e2e screens`, images land in test-results/.
test.skip(!process.env.SCREENSHOTS, "screenshots on demand only");

const CARDS: Array<[string, string[]]> = [
  [
    "ada",
    [
      "FN:Ada Lovelace",
      "N:Lovelace;Ada;;;",
      "ORG:Analytical Engines",
      "TITLE:Mathematician",
      "TEL;TYPE=CELL:+41 79 000 00 01",
      "TEL;TYPE=WORK:+41 22 000 00 07",
      "EMAIL;TYPE=WORK:ada@example.org",
      "ADR;TYPE=HOME:;;Rue du Port 12;Bilgewater;;0000;Runeterra",
      "BDAY:1815-12-10",
      "NOTE:First programmer.",
      "CATEGORIES:Science,Friends",
      "X-UNKNOWN:kept",
    ],
  ],
  [
    "grace",
    [
      "FN:Grace Hopper",
      "N:Hopper;Grace;;;",
      "TEL;TYPE=CELL:+1 202 555 0147",
      "EMAIL:grace@example.org",
    ],
  ],
  ["alan", ["FN:Alan Turing", "N:Turing;Alan;;;", "EMAIL:alan@example.org"]],
  ["acme", ["FN:ACME SA", "N:;;;;", "ORG:ACME SA", "TEL;TYPE=WORK:+41 21 000 00 08"]],
  [
    "zoe",
    [
      "FN:Zoé Łukasiewicz-Brønsted",
      "N:Łukasiewicz-Brønsted;Zoé;;;",
      "TEL;TYPE=CELL:+33 6 39 98 12 34",
    ],
  ],
];

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: test.info().outputPath(`${name}.png`), fullPage: true });
}

test.beforeEach(async () => {
  await resetBook();
  for (const [uid, lines] of CARDS) await putCard(uid, vcard([`UID:${uid}`, ...lines]));
});

test("screens", async ({ page }) => {
  await page.goto("/");
  await shot(page, "01-login");
  await page.getByLabel("Username").fill(USER);
  await page.getByLabel("Password", { exact: true }).fill("wrong");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Invalid username or password.")).toBeVisible();
  await shot(page, "02-login-error");
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("link", { name: /Ada Lovelace/ })).toBeVisible();
  await shot(page, "03-list");
  await page.getByRole("searchbox", { name: "Search contacts" }).fill("zoe");
  await expect(page.getByText("1 result")).toBeVisible();
  await shot(page, "04-search");
  await page.getByRole("searchbox", { name: "Search contacts" }).fill("");
  await page.getByRole("link", { name: /Ada Lovelace/ }).click();
  await expect(page.getByRole("heading", { level: 1 })).toBeAttached();
  await shot(page, "05-contact");
  await page.getByRole("button", { name: /^Edit/ }).filter({ visible: true }).first().click();
  await expect(page.getByRole("button", { name: "Save" })).toBeVisible();
  await shot(page, "06-contact-edit");
  await page.getByRole("button", { name: "Delete contact" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await shot(page, "07-delete-dialog");
  await page.keyboard.press("Escape");
  await page.getByLabel("Last name", { exact: true }).fill("Lovelace-Byron");
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await shot(page, "08-discard-dialog");
});
