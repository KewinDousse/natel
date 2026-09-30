import { expect, type Page, test } from "@playwright/test";
import { createBook, EXTRA_BOOK_PATH, putCard, resetBook, vcard } from "./dav";
import { PASSWORD, USER } from "./env";

// Phone widths from small Androids to the Pixel 7 the mobile project uses.
const WIDTHS = [320, 360, 375, 390, 412];
// Below this the header's actions wrap under the wordmark instead of
// squeezing the book switcher further.
const ONE_ROW_FROM = 360;

test.skip(({ isMobile }) => !isMobile, "phone layout only");

async function signIn(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByLabel("Username").fill(USER);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: /Address book|Carnet/ })).toBeVisible();
}

// Against clientWidth: on a mobile viewport Chrome widens innerWidth to fit
// wide content, which would hide the overflow this measures.
async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

test.beforeEach(async () => {
  await resetBook();
  await putCard("ada", vcard(["UID:ada", "FN:Ada Lovelace", "N:Lovelace;Ada;;;"]));
});

test("keeps the header on one row above the search from 360px, in both languages", async ({
  page,
}) => {
  await signIn(page);
  await expect(page.getByRole("link", { name: /Lovelace/ })).toBeVisible();
  for (const width of WIDTHS.filter((w) => w >= ONE_ROW_FROM)) {
    await page.setViewportSize({ width, height: 800 });
    for (const lang of ["FR", "EN"]) {
      await page.getByRole("button", { name: lang, exact: true }).click();
      const plus = await page
        .getByRole("link", { name: /New contact|Nouveau contact/ })
        .boundingBox();
      const search = await page.getByRole("searchbox").boundingBox();
      expect(plus, `${width}px ${lang}`).not.toBeNull();
      expect(search, `${width}px ${lang}`).not.toBeNull();
      if (plus && search) {
        expect(plus.y + plus.height, `${width}px ${lang}`).toBeLessThanOrEqual(search.y);
        // Search sits right under the one 56px row, after the 6px band.
        expect(search.y, `${width}px ${lang}`).toBeLessThan(6 + 56 + 8);
      }
      expect(await horizontalOverflow(page), `${width}px ${lang}`).toBe(0);
    }
  }
});

test("never scrolls sideways on the sign-in, list and contact screens", async ({ page }) => {
  for (const width of WIDTHS) {
    for (const lang of ["EN", "FR"]) {
      const at = `${width}px ${lang}`;
      await page.setViewportSize({ width, height: 800 });
      await signIn(page);
      await page.getByRole("button", { name: lang, exact: true }).click();
      await expect(page.getByRole("link", { name: /Lovelace/ })).toBeVisible();
      expect(await horizontalOverflow(page), `${at} list`).toBe(0);
      await page.getByRole("button", { name: /Address book|Carnet/ }).click();
      await expect(page.getByRole("menu")).toBeVisible();
      expect(await horizontalOverflow(page), `${at} book menu`).toBe(0);
      await page.keyboard.press("Escape");
      await page.getByRole("link", { name: /Lovelace/ }).click();
      await expect(page.getByRole("heading", { level: 1 })).toBeAttached();
      expect(await horizontalOverflow(page), `${at} contact`).toBe(0);
      await page
        .getByRole("button", { name: /^(Edit|Modifier)/ })
        .filter({ visible: true })
        .first()
        .click();
      await expect(page.getByRole("button", { name: /^(Save|Enregistrer)$/ })).toBeVisible();
      expect(await horizontalOverflow(page), `${at} edit`).toBe(0);
      await page.goto("/");
      await expect(page.getByRole("button", { name: /^(Sign in|Se connecter)$/ })).toBeVisible();
      expect(await horizontalOverflow(page), `${at} sign-in`).toBe(0);
    }
  }
});

test("keeps the book switcher's chevron inside its pill, clear of the actions", async ({
  page,
}) => {
  await signIn(page);
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 800 });
    const trigger = await page.getByRole("button", { name: /Address book|Carnet/ }).boundingBox();
    const chevron = await page
      .getByRole("button", { name: /Address book|Carnet/ })
      .locator("svg")
      .boundingBox();
    const lang = await page.getByRole("group", { name: /Language|Langue/ }).boundingBox();
    expect(trigger && chevron && lang, `${width}px`).toBeTruthy();
    if (trigger && chevron && lang) {
      expect(chevron.x + chevron.width, `${width}px chevron`).toBeLessThanOrEqual(
        trigger.x + trigger.width + 0.5,
      );
      // Either on the same row and left of the actions, or above them.
      const clear = trigger.x + trigger.width <= lang.x || trigger.y + trigger.height <= lang.y;
      expect(clear, `${width}px switcher clear of the actions`).toBe(true);
    }
  }
});

test("keeps the book menu on screen with a long book name", async ({ page }) => {
  await createBook(EXTRA_BOOK_PATH, "Contacts professionnels de l’association genevoise");
  await signIn(page);
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 800 });
    await page.getByRole("button", { name: /Address book|Carnet/ }).click();
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();
    const box = await menu.boundingBox();
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(box && box.x >= 0 && box.x + box.width <= clientWidth, `${width}px menu`).toBe(true);
    expect(await horizontalOverflow(page), `${width}px`).toBe(0);
    await page.keyboard.press("Escape");
  }
});

test("matches --header-h to the header's real height", async ({ page }) => {
  await signIn(page);
  // Either side of the wrap, which must not depend on the content's width.
  for (const width of [...WIDTHS, ONE_ROW_FROM - 1, 344]) {
    await page.setViewportSize({ width, height: 800 });
    const [header, variable] = await page.evaluate(() => {
      const el = document.getElementById("app-header");
      const probe = document.createElement("div");
      probe.style.height = "var(--header-h)";
      document.body.append(probe);
      const measured = [
        el?.getBoundingClientRect().height ?? 0,
        probe.getBoundingClientRect().height,
      ];
      probe.remove();
      return measured;
    });
    expect(Math.abs((header ?? 0) - (variable ?? 0)), `${width}px`).toBeLessThanOrEqual(1);
  }
});
