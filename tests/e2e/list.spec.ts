import { expect, type Page, test } from "@playwright/test";
import { putCard, resetBook, vcard } from "./dav";
import { PASSWORD, USER } from "./env";

// Two cards per letter, enough for the list to scroll on every viewport.
// No Q, so the rail has an absent letter to land next to.
const FAMILIES = "ABCDEFGHIJKLMNOPRSTUVWXYZ"
  .split("")
  .flatMap((letter) => [`${letter}ardin`, `${letter}ernier`]);

async function signIn(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByLabel("Username").fill(USER);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "A", exact: true })).toBeVisible();
}

test.beforeEach(async () => {
  await resetBook();
  for (const [i, family] of FAMILIES.entries()) {
    await putCard(`c${i}`, vcard([`UID:c${i}`, `FN:Alain ${family}`, `N:${family};Alain;;;`]));
  }
});

test("puts the sorted part of the name first", async ({ page }) => {
  await signIn(page);
  const row = page.getByRole("link", { name: /Aardin/ });
  // By first name unless the settings say otherwise.
  await expect(row.locator("b")).toHaveText("Alain");
  await expect(row).toContainText("Alain Aardin");
  await page.getByRole("button", { name: "Sort: First name" }).click();
  await page.getByRole("menuitemradio", { name: "Last name" }).click();
  await expect(row.locator("b")).toHaveText("Aardin");
  await expect(row).toContainText("Aardin Alain");
});

test("reaches the # group from the alphabetical index", async ({ page, isMobile }) => {
  const names = ["6minutes", "@office", "#club", "+service", "😀 Smile", "東京", "Жан", "Ωmega"];
  for (const [i, name] of names.entries()) {
    await putCard(`other${i}`, vcard([`UID:other${i}`, `FN:${name}`]));
  }
  await signIn(page);
  const rail = page.getByRole("navigation", { name: "Alphabetical index" });
  const other = rail.getByRole("link", { name: "#", exact: true });
  await expect(other).toHaveAttribute("href", "#g-#");
  await expect(rail.locator("[data-letter]").last()).toHaveText("#");
  const target = page.locator('[id="g-#"]');
  for (const name of names) await expect(target).toContainText(name);

  if (isMobile) {
    const box = await other.boundingBox();
    if (!box) throw new Error("no # on the rail");
    const touch = await page.context().newCDPSession(page);
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }],
    });
    await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  } else {
    await other.click();
  }
  await expect(target.getByRole("heading", { name: "#", exact: true })).toBeInViewport();
  await expect(target.getByRole("link", { name: /6minutes/ })).toBeInViewport();
  if (!isMobile) {
    await rail.getByRole("link", { name: "A", exact: true }).click();
    await expect(target.getByRole("link", { name: /6minutes/ })).not.toBeInViewport();
    await other.focus();
    await other.press("Enter");
    await expect(target.getByRole("link", { name: /6minutes/ })).toBeInViewport();
  }
});

test("follows a finger sliding down the A–Z rail", async ({ page, isMobile }) => {
  test.skip(!isMobile, "touch only");
  // Lettered by last name: every card here is an Alain.
  await page.addInitScript(() => localStorage.setItem("natel.preferences", '{"sort":"family"}'));
  await signIn(page);
  const center = async (letter: string) => {
    const box = await page.locator("#rail").getByText(letter, { exact: true }).boundingBox();
    if (!box) throw new Error(`no ${letter} on the rail`);
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  };
  const touch = await page.context().newCDPSession(page);
  const send = async (
    type: "touchStart" | "touchMove" | "touchEnd",
    point?: { x: number; y: number },
  ) => touch.send("Input.dispatchTouchEvent", { type, touchPoints: point ? [point] : [] });
  const groupTop = (letter: string) =>
    page.evaluate((l) => document.getElementById(`g-${l}`)?.getBoundingClientRect().top, letter);
  const headerBottom = () =>
    page.evaluate(() => document.querySelector("header")?.getBoundingClientRect().bottom ?? 0);

  // Just under the sticky header: neither hidden by it nor overshot past it.
  const landsOn = async (letter: string) => {
    const bottom = await headerBottom();
    await expect.poll(() => groupTop(letter)).toBeGreaterThanOrEqual(bottom - 1);
    await expect.poll(() => groupTop(letter)).toBeLessThan(bottom + 8);
  };

  await send("touchStart", await center("C"));
  await landsOn("C");
  await send("touchMove", await center("M"));
  await landsOn("M");
  await send("touchMove", await center("T"));
  await landsOn("T");
  await send("touchEnd");

  // A plain tap on an absent letter: no anchor to follow, so only the rail's
  // own handler can land it on the next present letter.
  await send("touchStart", await center("Q"));
  await send("touchEnd");
  await landsOn("R");
});

test("leaves the whole list scrollbar free of the rail", async ({ page, isMobile }) => {
  test.skip(isMobile, "the list scrolls on its own from lg");
  await signIn(page);
  const list = await page.locator("#list").boundingBox();
  const rail = await page.locator("#rail").boundingBox();
  expect(list).not.toBeNull();
  expect(rail).not.toBeNull();
  if (list && rail) expect(rail.x).toBeGreaterThanOrEqual(list.x + list.width);
  // Whatever sits at the scrollbar's edge, top to bottom, is the list itself.
  const hits = await page.evaluate(() => {
    const box = document.getElementById("list")?.getBoundingClientRect();
    if (!box) return [];
    return [0.1, 0.3, 0.5, 0.7, 0.9].map(
      (at) =>
        document.elementFromPoint(box.right - 2, box.top + box.height * at)?.closest("#list")?.id ??
        null,
    );
  });
  expect(hits).toEqual(["list", "list", "list", "list", "list"]);
});

test("sorts by the last modification and moves a saved contact to the top", async ({
  page,
  isMobile,
}) => {
  await putCard(
    "old",
    vcard(["UID:old", "FN:Ada Old", "N:Old;Ada;;;", "REV:2021-05-04T08:00:00Z"]),
  );
  await putCard(
    "new",
    vcard(["UID:new", "FN:Bea New", "N:New;Bea;;;", "REV:2025-01-15T09:00:00Z"]),
  );
  await signIn(page);
  await page.getByRole("button", { name: "Sort: First name" }).click();
  await page.getByRole("menuitemradio", { name: "Recently modified" }).click();
  const rows = page.locator("#list [data-contact-id]");
  await expect(rows.nth(0)).toContainText("Bea New");
  await expect(rows.nth(1)).toContainText("Ada Old");
  await expect(rows.nth(1).locator("time")).toHaveText("May 2021");
  // Undated cards follow, with an empty date column.
  await expect(rows.nth(2)).toContainText("Alain");
  await expect(rows.nth(2).locator("time")).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Alphabetical index" })).toHaveCount(0);

  await rows.nth(1).click();
  await page.getByRole("button", { name: /^Edit/ }).filter({ visible: true }).first().click();
  await page.getByLabel("First name", { exact: true }).fill("Adèle");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("status").filter({ hasText: /^Saved$/ })).toBeVisible();
  if (isMobile) await page.getByRole("link", { name: "Back to “Contacts”" }).click();
  await expect(rows.nth(0)).toContainText("Adèle Old");
});

test("offers the sort menu at every width, without overflow", async ({ page }) => {
  await signIn(page);
  for (const width of [320, 390, 640, 1024, 1440]) {
    await page.setViewportSize({ width, height: 800 });
    const trigger = page.getByRole("button", { name: "Sort: First name" });
    await expect(trigger).toBeVisible();
    // The current sort is never cut off, nor is the page wider than the screen.
    const label = trigger.locator("span");
    expect(await label.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  }

  await page.setViewportSize({ width: 390, height: 800 });
  await page.getByRole("button", { name: "Sort: First name" }).click();
  const menu = page.getByRole("menu", { name: "Sort by" });
  await expect(menu.getByRole("menuitemradio")).toHaveText([
    "First name",
    "Last name",
    "Recently modified",
  ]);
  await expect(menu.getByRole("menuitemradio", { name: "First name" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await expect(menu.getByRole("menuitemradio", { checked: true })).toHaveCount(1);
  await menu.getByRole("menuitemradio", { name: "Last name" }).click();
  await expect(menu).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Aardin/ }).locator("b")).toHaveText("Aardin");

  await page.getByRole("button", { name: "Sort: Last name" }).click();
  await expect(menu.getByRole("menuitemradio", { checked: true })).toHaveText("Last name");
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Sort: Last name" })).toBeFocused();
});
