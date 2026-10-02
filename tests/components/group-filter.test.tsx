/**
 * Component tests for the list's group filter (DESIGN.md "Group filter",
 * ADR 022). Real router and vCard code; only src/dav is mocked.
 */

import { QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DavAddressBook, DavAuth } from "@/dav/types";
import { I18nProvider } from "@/i18n/react";
import { createQueryClient } from "@/queries";
import { routeTree } from "@/routeTree.gen";
import { useSessionStore } from "@/store/session";

const mocks = vi.hoisted(() => ({
  discoverAddressBooks: vi.fn(),
  listContacts: vi.fn(),
  fetchCards: vi.fn(),
}));

vi.mock("@/dav", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/dav")>()),
  ...mocks,
}));

const AUTH: DavAuth = { username: "alice", password: "secret" };
const BOOK: DavAddressBook = { href: "https://dav.example.org/books/a/", displayName: "Perso" };
const OTHER: DavAddressBook = { href: "https://dav.example.org/books/b/", displayName: "Travail" };

const card = (lines: string[]) =>
  ["BEGIN:VCARD", "VERSION:3.0", ...lines, "END:VCARD", ""].join("\r\n");
const person = (uid: string, family: string, given: string, extra: string[] = []) =>
  card([`UID:${uid}`, `FN:${given} ${family}`, `N:${family};${given};;;`, ...extra]);

let books: Record<string, Record<string, string>>;

beforeEach(async () => {
  cleanup();
  await new Promise((r) => setTimeout(r, 50));
  Object.defineProperty(window.navigator, "language", { get: () => "fr-FR", configurable: true });
  Object.defineProperty(window.navigator, "languages", {
    get: () => ["fr-FR"],
    configurable: true,
  });
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: () => ({ matches: true, addEventListener() {}, removeEventListener() {} }),
  });
  localStorage.clear();
  vi.resetAllMocks();
  books = {
    [BOOK.href]: {
      [`${BOOK.href}ada.vcf`]: person("ada", "Lovelace", "Ada"),
      [`${BOOK.href}grace.vcf`]: person("grace", "Hopper", "Grace", ["CATEGORIES:Famille"]),
      [`${BOOK.href}alan.vcf`]: person("alan", "Turing", "Alan"),
      [`${BOOK.href}family.vcf`]: card([
        "UID:family",
        "FN:Famille",
        "X-ADDRESSBOOKSERVER-KIND:group",
        "X-ADDRESSBOOKSERVER-MEMBER:urn:uuid:ada",
      ]),
      [`${BOOK.href}club.vcf`]: card([
        "UID:club",
        "FN:Club",
        "X-ADDRESSBOOKSERVER-KIND:group",
        "X-ADDRESSBOOKSERVER-MEMBER:urn:uuid:alan",
      ]),
    },
    [OTHER.href]: { [`${OTHER.href}edsger.vcf`]: person("edsger", "Dijkstra", "Edsger") },
  };
  mocks.discoverAddressBooks.mockResolvedValue([BOOK, OTHER]);
  mocks.listContacts.mockImplementation(async (_a: DavAuth, bookHref: string) =>
    Object.keys(books[bookHref] ?? {}).map((href) => ({ href, etag: '"e"' })),
  );
  mocks.fetchCards.mockImplementation(async (_a: DavAuth, hrefs: string[]) =>
    hrefs.map((href) => ({
      href,
      etag: '"e"',
      vcardText: Object.values(books).find((cards) => href in cards)?.[href] ?? "",
    })),
  );
});

let client: ReturnType<typeof createQueryClient>;

async function renderList() {
  useSessionStore.setState({ auth: AUTH, selectedBook: BOOK });
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ["/contacts"] }),
  });
  client = createQueryClient();
  render(
    <QueryClientProvider client={client}>
      <I18nProvider>
        <RouterProvider router={router} />
      </I18nProvider>
    </QueryClientProvider>,
  );
  await screen.findByRole("link", { name: /Lovelace/ }, { timeout: 5000 });
  return userEvent.setup();
}

const trigger = () => screen.getByRole("button", { name: /^Filtrer par groupe/ });

describe("the group filter", () => {
  it("lists every group with its count, and shows only the chosen one's contacts", async () => {
    const user = await renderList();
    expect(trigger().textContent).toBe("Tous les groupes");

    await user.click(trigger());
    const menu = screen.getByRole("menu", { name: "Groupes" });
    const items = within(menu).getAllByRole("menuitemradio");
    expect(items.map((item) => item.textContent)).toEqual([
      "Tous les groupes",
      "Club1",
      "Famille2",
    ]);
    expect(items[0]?.getAttribute("aria-checked")).toBe("true");
    expect(document.activeElement).toBe(items[0]);

    await user.click(within(menu).getByRole("menuitemradio", { name: /Famille/ }));
    expect(screen.queryByRole("menu")).toBeNull();
    expect(screen.getByText("2 contacts dans Famille")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Lovelace/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Hopper/ })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Turing/ })).toBeNull();
    // The rail keeps every letter; T has no contact in the group.
    const rail = document.getElementById("rail");
    expect(rail?.querySelector('a[href="#g-T"]')).toBeNull();
    expect(rail?.querySelector('a[href="#g-L"]')).not.toBeNull();

    await user.click(screen.getByRole("button", { name: "Afficher tous les groupes" }));
    expect(screen.getByText("3 contacts")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Turing/ })).toBeTruthy();
  });

  it("moves through the menu with the arrows, and Escape gives the focus back", async () => {
    const user = await renderList();
    trigger().focus();
    await user.keyboard("{ArrowDown}");
    const items = within(screen.getByRole("menu")).getAllByRole("menuitemradio");
    expect(document.activeElement).toBe(items[0]);
    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(document.activeElement).toBe(items[2]);
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(items[0]);
    await user.keyboard("{End}");
    expect(document.activeElement).toBe(items[2]);
    await user.keyboard("{Home}");
    expect(document.activeElement).toBe(items[0]);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it("keeps the focus on the trigger when × clears the filter", async () => {
    const user = await renderList();
    await user.click(trigger());
    await user.click(screen.getByRole("menuitemradio", { name: /Club/ }));
    await user.click(screen.getByRole("button", { name: "Afficher tous les groupes" }));
    expect(document.activeElement).toBe(trigger());
  });

  it("says so when the group has no contact", async () => {
    const book = books[BOOK.href] ?? {};
    book[`${BOOK.href}empty.vcf`] = card([
      "UID:empty",
      "FN:Vide",
      "X-ADDRESSBOOKSERVER-KIND:group",
    ]);
    const user = await renderList();
    await user.click(trigger());
    await user.click(screen.getByRole("menuitemradio", { name: /Vide/ }));
    expect(screen.getByText("Aucun contact dans ce groupe.")).toBeTruthy();
  });

  it("ends the filter when its group goes, and doesn't bring it back", async () => {
    const user = await renderList();
    await user.click(trigger());
    await user.click(screen.getByRole("menuitemradio", { name: /Club/ }));
    expect(screen.queryByRole("link", { name: /Lovelace/ })).toBeNull();

    const book = books[BOOK.href] ?? {};
    const club = book[`${BOOK.href}club.vcf`] ?? "";
    delete book[`${BOOK.href}club.vcf`];
    const refetch = async () => {
      await act(async () => {
        await client.invalidateQueries();
      });
    };
    await refetch();
    await screen.findByRole("link", { name: /Lovelace/ });
    expect(trigger().textContent).toBe("Tous les groupes");

    book[`${BOOK.href}club.vcf`] = club;
    await refetch();
    await screen.findByText("3 contacts");
    expect(trigger().textContent).toBe("Tous les groupes");
  });

  it("searches within the group", async () => {
    const user = await renderList();
    await user.click(trigger());
    await user.click(screen.getByRole("menuitemradio", { name: /Famille/ }));
    await user.type(screen.getByRole("searchbox"), "Ada");
    expect(screen.getByText("1 résultat")).toBeTruthy();
    await user.clear(screen.getByRole("searchbox"));
    await user.type(screen.getByRole("searchbox"), "Alan");
    expect(screen.getAllByText("Aucun résultat").length).toBeGreaterThan(0);
    expect(screen.queryByRole("link", { name: /Turing/ })).toBeNull();
  });

  it("starts from every group in another book, and hides itself in a book without groups", async () => {
    const user = await renderList();
    await user.click(trigger());
    await user.click(screen.getByRole("menuitemradio", { name: /Club/ }));
    expect(screen.getByText("1 contact dans Club")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Carnet d’adresses" }));
    await user.click(screen.getByRole("menuitemradio", { name: "Travail" }));
    await screen.findByRole("link", { name: /Dijkstra/ });
    expect(screen.queryByRole("button", { name: /^Filtrer par groupe/ })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Carnet d’adresses" }));
    await user.click(screen.getByRole("menuitemradio", { name: "Perso" }));
    await screen.findByRole("link", { name: /Turing/ });
    expect(trigger().textContent).toBe("Tous les groupes");
  });
});
