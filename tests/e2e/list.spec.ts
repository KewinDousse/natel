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

test("puts the sorted part of the name first", async ({ page, isMobile }) => {
  await signIn(page);
  const row = page.getByRole("link", { name: /Aardin/ });
  // By first name unless the settings say otherwise.
  await expect(row.locator("b")).toHaveText("Alain");
  await expect(row).toContainText("Alain Aardin");
  // Phones offer the sort in the settings only.
  if (isMobile) {
    await page.getByRole("link", { name: "Settings" }).click();
    await page.getByRole("combobox", { name: "Sort by" }).selectOption("family");
    await page.getByRole("link", { name: "Back to contacts" }).click();
  } else {
    await page.getByRole("button", { name: "Last name" }).click();
  }
  await expect(row.locator("b")).toHaveText("Aardin");
  await expect(row).toContainText("Aardin Alain");
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
