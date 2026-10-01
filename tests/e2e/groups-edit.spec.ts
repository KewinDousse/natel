import { expect, type Page, test } from "@playwright/test";
import { getCard, listCards, putCard, resetBook, vcard } from "./dav";
import { PASSWORD, USER } from "./env";

test.skip(({ isMobile }) => isMobile, "the groups editor is the same on phones");

const FAMILY = (members: string[], extra: string[] = []) =>
  vcard([
    "UID:family",
    "FN:Famille",
    "N:Famille;;;;",
    "X-ADDRESSBOOKSERVER-KIND:group",
    ...members.map((m) => `X-ADDRESSBOOKSERVER-MEMBER:urn:uuid:${m}`),
    ...extra,
  ]);

test.beforeEach(async () => {
  await resetBook();
  await putCard(
    "ada",
    vcard(["UID:ada", "FN:Ada Lovelace", "N:Lovelace;Ada;;;", "CATEGORIES:Travail", "X-KEEP:yes"]),
  );
});

async function editAda(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByLabel("Username").fill(USER);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByRole("link", { name: /Lovelace/ }).click();
  await page.getByRole("button", { name: /^Edit/ }).filter({ visible: true }).first().click();
  await expect(page.getByRole("button", { name: "Save" })).toBeVisible();
}

async function addGroup(page: Page, name: string): Promise<void> {
  const input = page.getByRole("combobox", { name: "Add a group" });
  await input.fill(name);
  await input.press("Enter");
}

const groupCards = async () =>
  (await listCards()).filter((card) => card.includes("X-ADDRESSBOOKSERVER-KIND:group"));

test("adds a contact to a new group with a group card", async ({ page }) => {
  const adaBefore = await getCard("ada");
  await editAda(page);
  await addGroup(page, "Club");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Saved")).toBeVisible();

  await expect.poll(async () => (await groupCards()).length).toBe(1);
  const [club] = await groupCards();
  expect(club).toContain("VERSION:3.0");
  expect(club).toContain("FN:Club");
  expect(club).toContain("X-ADDRESSBOOKSERVER-MEMBER:urn:uuid:ada");
  // Nothing on Ada's own card changed, so it wasn't written.
  expect(await getCard("ada")).toBe(adaBefore);
});

test("adds a member to the group card that has the name, keeping its data", async ({ page }) => {
  await putCard("family", FAMILY(["bob"], ["X-OTHER:kept"]));
  await editAda(page);
  await addGroup(page, "Famille");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Saved")).toBeVisible();

  const family = await getCard("family");
  expect(family).toContain("X-ADDRESSBOOKSERVER-MEMBER:urn:uuid:ada");
  expect(family).toContain("X-ADDRESSBOOKSERVER-MEMBER:urn:uuid:bob");
  expect(family).toContain("X-OTHER:kept");
});

test("removes a group from the group card and from CATEGORIES", async ({ page }) => {
  await putCard("family", FAMILY(["ada", "bob"]));
  await editAda(page);
  await page.getByRole("button", { name: "Remove from “Famille”" }).click();
  await page.getByRole("button", { name: "Remove from “Travail”" }).click();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Saved")).toBeVisible();

  const family = await getCard("family");
  expect(family).not.toContain("uuid:ada");
  expect(family).toContain("uuid:bob");
  const ada = await getCard("ada");
  expect(ada).not.toContain("CATEGORIES");
  expect(ada).toContain("X-KEEP:yes");
});

test("offers to overwrite a group card changed elsewhere", async ({ page }) => {
  await putCard("family", FAMILY([]));
  await editAda(page);
  await putCard("family", FAMILY(["carl"]));
  await addGroup(page, "Famille");
  await page.getByRole("button", { name: "Save" }).click();

  await expect(page.getByText("these groups were not updated")).toBeVisible();
  await expect(page.getByText("Famille · changed elsewhere")).toBeVisible();
  await page.getByRole("button", { name: /Overwrite/ }).click();
  // The contact's own save already showed "Saved": wait for the group card itself.
  await expect.poll(() => getCard("family")).toContain("uuid:ada");
  await expect(page.getByText("these groups were not updated")).toBeHidden();
  expect(await getCard("family")).toContain("uuid:carl");
});
