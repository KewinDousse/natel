/**
 * Component tests for the list sorted by last modification (DESIGN.md "Sort
 * by last modification"). Real router and vCard code; only src/dav is mocked.
 */

import { QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { beforeEach, expect, it, vi } from "vitest";
import type { DavAddressBook, DavAuth } from "@/dav/types";
import { I18nProvider } from "@/i18n/react";
import { createQueryClient } from "@/queries";
import { routeTree } from "@/routeTree.gen";
import { usePreferences } from "@/store/preferences";
import { useSessionStore } from "@/store/session";

const mocks = vi.hoisted(() => ({
  discoverAddressBooks: vi.fn(),
  listContacts: vi.fn(),
  fetchCards: vi.fn(),
  fetchCard: vi.fn(),
  updateCard: vi.fn(),
}));

vi.mock("@/dav", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/dav")>()),
  ...mocks,
}));

const AUTH: DavAuth = { username: "alice" };
const BOOK: DavAddressBook = { href: "https://dav.example.org/books/a/", displayName: "Perso" };

const person = (uid: string, family: string, given: string, extra: string[] = []) =>
  [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `UID:${uid}`,
    `FN:${given} ${family}`,
    `N:${family};${given};;;`,
    ...extra,
    "END:VCARD",
    "",
  ].join("\r\n");

let cards: Record<string, string>;

beforeEach(async () => {
  cleanup();
  await new Promise((r) => setTimeout(r, 50));
  Object.defineProperty(window.navigator, "language", { get: () => "en-US", configurable: true });
  Object.defineProperty(window.navigator, "languages", {
    get: () => ["en-US"],
    configurable: true,
  });
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: () => ({ matches: true, addEventListener() {}, removeEventListener() {} }),
  });
  localStorage.clear();
  vi.resetAllMocks();
  usePreferences.setState({ sortBy: "family", byRevision: false });
  const year = new Date().getFullYear();
  cards = {
    [`${BOOK.href}ada.vcf`]: person("ada", "Lovelace", "Ada", ["REV:2021-05-04T08:00:00Z"]),
    [`${BOOK.href}grace.vcf`]: person("grace", "Hopper", "Grace", [`REV:${year}-01-15T09:00:00Z`]),
    [`${BOOK.href}alan.vcf`]: person("alan", "Turing", "Alan"),
  };
  mocks.discoverAddressBooks.mockResolvedValue([BOOK]);
  mocks.listContacts.mockImplementation(async () =>
    Object.keys(cards).map((href) => ({ href, etag: '"e"' })),
  );
  mocks.fetchCards.mockImplementation(async (_a: DavAuth, hrefs: string[]) =>
    hrefs.map((href) => ({ href, etag: '"e"', vcardText: cards[href] ?? "" })),
  );
  mocks.fetchCard.mockImplementation(async (_a: DavAuth, href: string) => ({
    href,
    etag: '"e"',
    vcardText: cards[href] ?? "",
  }));
  mocks.updateCard.mockImplementation(
    async (_a: DavAuth, href: string, _etag: string, vcardText: string) => ({
      href,
      etag: '"e2"',
      vcardText,
    }),
  );
});

async function renderList(path = "/contacts") {
  useSessionStore.setState({ auth: AUTH, selectedBook: BOOK, groupFilter: null });
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  const { container } = render(
    <QueryClientProvider client={createQueryClient()}>
      <I18nProvider>
        <RouterProvider router={router} />
      </I18nProvider>
    </QueryClientProvider>,
  );
  await screen.findByRole("link", { name: /Lovelace/ });
  return { container, user: userEvent.setup() };
}

const rowNames = (container: HTMLElement) =>
  [...container.querySelectorAll<HTMLElement>("#list [data-contact-id]")].map(
    (row) => row.dataset.contactId,
  );

it("sorts by the last modification without letters or rail, and shows each row's day", async () => {
  const { container, user } = await renderList();
  expect(container.querySelector("#rail")).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Recently modified" }));

  expect(usePreferences.getState().byRevision).toBe(true);
  expect(rowNames(container)).toEqual(["grace", "ada", "alan"]);
  expect(container.querySelector("#rail")).toBeNull();
  expect(container.querySelector("#list h2")).toBeNull();
  // The names keep the order of the last sort by name.
  expect(screen.getByRole("link", { name: /^Hopper Grace/ })).toBeTruthy();

  const grace = screen.getByRole("link", { name: /Hopper/ });
  expect(grace).toHaveTextContent("Jan 15");
  expect(grace).toHaveTextContent(`Modified January 15, ${new Date().getFullYear()}`);
  const ada = screen.getByRole("link", { name: /Lovelace/ });
  expect(ada.querySelector("time")?.textContent).toBe("May 2021");
  expect(ada).toHaveTextContent("Modified May 4, 2021");
  expect(screen.getByRole("link", { name: /Turing/ }).querySelector("time")).toBeNull();

  await user.click(screen.getByRole("button", { name: "Last name" }));
  expect(rowNames(container)).toEqual(["grace", "ada", "alan"]);
  expect([...container.querySelectorAll("#list h2")].map((h) => h.textContent)).toEqual([
    "H",
    "L",
    "T",
  ]);
  expect(container.querySelector("#list time")).toBeNull();
});

it("moves a contact saved in Natel to the top", async () => {
  usePreferences.setState({ byRevision: true });
  const { container, user } = await renderList("/contacts/a/ada?edit=true");
  expect(rowNames(container)).toEqual(["grace", "ada", "alan"]);

  const article = await screen.findByRole("article");
  await user.type(within(article).getByLabelText("First name"), "line");
  await user.click(within(article).getByRole("button", { name: "Save" }));

  await waitFor(() => expect(mocks.updateCard).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(rowNames(container)).toEqual(["ada", "grace", "alan"]));
  const today = new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(
    new Date(),
  );
  expect(screen.getByRole("link", { name: /Lovelace/ }).querySelector("time")?.textContent).toBe(
    today,
  );
});

it("leaves a contact saved without a REV with the undated cards (ADR 029)", async () => {
  usePreferences.setState({ byRevision: true });
  const { container, user } = await renderList("/contacts/a/alan?edit=true");

  const article = await screen.findByRole("article");
  await user.type(within(article).getByLabelText("First name"), "o");
  await user.click(within(article).getByRole("button", { name: "Save" }));

  await waitFor(() => expect(mocks.updateCard).toHaveBeenCalledTimes(1));
  expect(mocks.updateCard.mock.calls[0]?.[3]).not.toMatch(/^REV/m);
  await screen.findByRole("link", { name: /Alano/ });
  expect(rowNames(container)).toEqual(["grace", "ada", "alan"]);
});
