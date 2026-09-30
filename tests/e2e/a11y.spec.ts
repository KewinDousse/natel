import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { createBook, EXTRA_BOOK_PATH, putCard, resetBook, vcard } from "./dav";
import { PASSWORD, SERVER, USER } from "./env";

// Every screen, in both palettes, against WCAG 2.1 A and AA plus axe's best
// practices. Only violations fail: contrast axe can't compute (text over an
// image or a gradient, or with pointer-events off) comes back as incomplete.
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"];

async function expectNoViolations(page: Page, screen: string): Promise<void> {
  const { violations } = await new AxeBuilder({ page })
    .withTags(TAGS)
    // WCAG 1.4.3 sets no contrast for a logotype.
    .exclude("[data-logotype]")
    .analyze();
  const found = violations.map((v) => ({
    rule: v.id,
    impact: v.impact,
    nodes: v.nodes.map((n) => n.target.join(" ")),
  }));
  expect.soft(found, screen).toEqual([]);
}

async function signIn(page: Page): Promise<void> {
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

async function openBookMenu(page: Page): Promise<void> {
  await page.getByRole("button", { name: /Address book/ }).click();
  await expect(page.getByRole("menu")).toBeVisible();
}

const ADA = vcard([
  "UID:ada",
  "FN:Ada Lovelace",
  "N:Lovelace;Ada;;;",
  "ORG:Analytical Engines",
  "TITLE:Mathematician",
  "TEL;TYPE=CELL:+41 79 318 44 27",
  "TEL;TYPE=WORK:+41 22 555 12 34",
  "EMAIL;TYPE=WORK:ada@example.org",
  "ADR;TYPE=HOME:;;Rue du Rhône 12;Genève;;1204;Suisse",
  "BDAY:1815-12-10",
  "URL:https://example.org/ada",
  "NOTE:First programmer.",
  "CATEGORIES:Science",
]);

test.beforeEach(async () => {
  await resetBook();
  await createBook(EXTRA_BOOK_PATH, "Work");
  await putCard("ada", ADA);
  await putCard("grace", vcard(["UID:grace", "FN:Grace Hopper", "N:Hopper;Grace;;;"]));
});

// Fades would let axe measure a colour halfway through its transition.
test.use({ reducedMotion: "reduce" });

for (const colorScheme of ["light", "dark"] as const) {
  test.describe(colorScheme, () => {
    test.use({ colorScheme });

    test("sign-in screen", async ({ page }) => {
      await page.goto("/");
      await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
      await expectNoViolations(page, "sign-in");
      if (!SERVER.checksPassword) return;
      await page.getByLabel("Username").fill(USER);
      await page.getByLabel("Password", { exact: true }).fill("wrong");
      await page.getByRole("button", { name: "Sign in" }).click();
      await expect(page.getByText("Invalid username or password.")).toBeVisible();
      await expectNoViolations(page, "sign-in error");
    });

    test("list, search and book menu", async ({ page }) => {
      await page.goto("/");
      await signIn(page);
      await expectNoViolations(page, "list");
      await page.getByRole("searchbox", { name: "Search contacts" }).fill("zzz");
      await expect(page.getByText("No results").first()).toBeVisible();
      await expectNoViolations(page, "search without result");
      await page.getByRole("searchbox", { name: "Search contacts" }).fill("");
      await openBookMenu(page);
      await expectNoViolations(page, "book menu");
      await page.getByRole("menuitemradio", { name: "Work" }).click();
      await expect(page.getByText("This address book is empty.")).toBeVisible();
      await expectNoViolations(page, "empty book");
    });

    test("contact page, editing and its dialogs", async ({ page, context }) => {
      // The "Copied" toast shows only once the clipboard write succeeds.
      await context.grantPermissions(["clipboard-read", "clipboard-write"]);
      await page.goto("/");
      await signIn(page);
      await page.getByRole("link", { name: /Lovelace/ }).click();
      await expect(page.getByRole("heading", { level: 1, name: /Lovelace/ })).toBeVisible();
      await expectNoViolations(page, "contact");
      await page.getByRole("button", { name: "Copy number" }).first().click();
      await expect(page.getByText("Copied")).toBeVisible();
      await expectNoViolations(page, "toast");

      await page.getByRole("button", { name: /^Edit/ }).filter({ visible: true }).first().click();
      await expect(page.getByRole("button", { name: "Save" })).toBeVisible();
      await expectNoViolations(page, "contact edit");

      const email = page.getByLabel("Email address (Work)");
      await email.fill("not an address");
      await page.getByRole("button", { name: "Save" }).click();
      await expect(page.getByText("Invalid email address")).toBeVisible();
      await expectNoViolations(page, "contact edit with an error");
      await email.fill("ada@example.org");

      await page.getByRole("button", { name: "Delete contact" }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await expectNoViolations(page, "delete dialog");
      await page.keyboard.press("Escape");

      await page.getByRole("button", { name: "Move to another address book" }).click();
      await expect(page.getByRole("dialog", { name: "Move this contact?" })).toBeVisible();
      await expectNoViolations(page, "move dialog");
      await page.keyboard.press("Escape");

      await page.getByPlaceholder("Last name").fill("Lovelace-Byron");
      await page.getByRole("button", { name: "Cancel" }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await expectNoViolations(page, "discard dialog");
      await page.getByRole("button", { name: "Keep editing" }).click();

      // Another client changes the card before this one saves.
      await putCard("ada", ADA.replace("ORG:Analytical Engines", "ORG:Difference Engines"));
      await page.getByRole("button", { name: "Save" }).click();
      await expect(page.getByText("This contact was modified elsewhere.")).toBeVisible();
      await expectNoViolations(page, "conflict");
    });

    test("new contact", async ({ page }) => {
      await page.goto("/");
      await signIn(page);
      await page.getByRole("link", { name: "New contact" }).filter({ visible: true }).click();
      await expect(page.getByRole("button", { name: "Save" })).toBeVisible();
      await expectNoViolations(page, "new contact");
    });

    test("import dialog", async ({ page }) => {
      await page.goto("/");
      await signIn(page);
      await openBookMenu(page);
      const chooser = page.waitForEvent("filechooser");
      await page.getByRole("menuitem", { name: "Import a .vcf file…" }).click();
      await (await chooser).setFiles({
        name: "import.vcf",
        mimeType: "text/vcard",
        buffer: Buffer.from(
          vcard(["UID:alan", "FN:Alan Turing", "N:Turing;Alan;;;"]) + vcard(["N:;;;;"]),
        ),
      });
      // Once finished; the counts depend on how each server takes the nameless card.
      const dialog = page.getByRole("dialog", { name: /Import into/ });
      await expect(dialog.getByRole("button", { name: "Close" })).toBeVisible();
      await expectNoViolations(page, "import dialog");
    });

    test("settings", async ({ page }) => {
      await page.goto("/");
      await signIn(page);
      await page.getByRole("link", { name: "Settings" }).click();
      await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
      await expectNoViolations(page, "settings");
    });

    test("keyboard shortcuts", async ({ page, isMobile }) => {
      test.skip(isMobile, "keyboard shortcuts are a desktop matter");
      await page.goto("/");
      await signIn(page);
      await page.getByRole("link", { name: /Lovelace/ }).focus();
      await page.keyboard.press("?");
      await expect(page.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeVisible();
      await expectNoViolations(page, "shortcuts");
    });
  });
}
