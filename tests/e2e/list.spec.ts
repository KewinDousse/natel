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

async function toolbarBottom(page: Page): Promise<number> {
  return page.evaluate(
    () => document.getElementById("list-toolbar")?.getBoundingClientRect().bottom ?? 0,
  );
}

function groupTop(page: Page, letter: string): Promise<number | undefined> {
  return page.evaluate(
    (l) => document.getElementById(`g-${l}`)?.getBoundingClientRect().top,
    letter,
  );
}

// Just under the sticky toolbar: neither hidden by it nor overshot past it.
async function landsOn(page: Page, letter: string): Promise<void> {
  const bottom = await toolbarBottom(page);
  await expect.poll(() => groupTop(page, letter)).toBeGreaterThanOrEqual(bottom - 1);
  await expect.poll(() => groupTop(page, letter)).toBeLessThan(bottom + 8);
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
    await page.getByRole("link", { name: "Back to “Contacts”" }).click();
  } else {
    await page.getByRole("button", { name: "Last name" }).click();
  }
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

  await send("touchStart", await center("C"));
  await landsOn(page, "C");
  await send("touchMove", await center("M"));
  await landsOn(page, "M");
  await send("touchMove", await center("T"));
  await landsOn(page, "T");
  await send("touchEnd");

  // A plain tap on an absent letter: no anchor to follow, so only the rail's
  // own handler can land it on the next present letter.
  await send("touchStart", await center("Q"));
  await send("touchEnd");
  await landsOn(page, "R");
});

test("keeps the toolbar in view while the list scrolls", async ({ page, isMobile }) => {
  await putCard(
    "friend",
    vcard(["UID:friend", "FN:Zoé Zufall", "N:Zufall;Zoé;;;", "CATEGORIES:Friends"]),
  );
  // Lettered by last name: every card here is an Alain.
  await page.addInitScript(() => localStorage.setItem("natel.preferences", '{"sort":"family"}'));
  await signIn(page);
  const toolbar = page.locator("#list-toolbar");
  const count = toolbar.getByText(`${FAMILIES.length + 1} contacts`);
  const filter = toolbar.getByRole("button", { name: "Filter by group: All groups" });
  await expect(filter).toBeVisible();
  // Where the toolbar sticks: under the header on phones, atop the pane from lg.
  const stickTop = () =>
    isMobile
      ? page.evaluate(() => document.getElementById("app-header")?.getBoundingClientRect().bottom)
      : page.evaluate(() => document.getElementById("list")?.getBoundingClientRect().top);

  // By the page on phones and by the pane from lg.
  const scrollList = (by: number) =>
    page.evaluate(
      ({ mobile, by }) => {
        const scroller = mobile ? document.scrollingElement : document.getElementById("list");
        scroller?.scrollBy(0, by);
      },
      { mobile: isMobile, by },
    );

  await scrollList(2000);
  await expect(page.getByRole("link", { name: /Aardin/ })).not.toBeInViewport();
  await expect(count).toBeInViewport();
  await expect(filter).toBeInViewport();
  const top = (await stickTop()) ?? Number.NaN;
  await expect.poll(async () => (await toolbar.boundingBox())?.y).toBeCloseTo(top, 0);

  // The letter of the section crossing the toolbar's bottom edge sticks below
  // the toolbar, not under it. A few pixels into that section, so its letter
  // is stuck rather than pushed up by the section's end.
  const bottom = await toolbarBottom(page);
  const crossing = await page.evaluate((edge) => {
    const section = [...document.querySelectorAll<HTMLElement>("#list section")].find((s) => {
      const rect = s.getBoundingClientRect();
      return rect.top < edge && rect.bottom > edge;
    });
    return section && { id: section.id, top: section.getBoundingClientRect().top };
  }, bottom);
  expect(crossing).toBeDefined();
  await scrollList((crossing?.top ?? 0) - bottom + 20);
  const stuck = await page.evaluate((id) => {
    const heading = document
      .getElementById(id)
      ?.querySelector(":scope > h2")
      ?.getBoundingClientRect();
    if (!heading) return null;
    return {
      top: heading.top,
      hit: document.elementFromPoint(
        heading.left + heading.width / 2,
        heading.top + heading.height / 2,
      )?.tagName,
    };
  }, crossing?.id ?? "");
  expect(stuck).not.toBeNull();
  expect(stuck?.top ?? 0).toBeGreaterThanOrEqual(bottom - 1);
  expect(stuck?.hit).toBe("H2");

  // A jump to a letter lands just below the toolbar. Phones: see the rail finger test.
  if (!isMobile) {
    await page.locator("#rail").getByRole("link", { name: "M", exact: true }).click();
    await landsOn(page, "M");
    await expect(count).toBeInViewport();
  }
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
