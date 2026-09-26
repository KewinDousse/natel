/**
 * Tests for contact creation: the header's "+" link and /contacts/new, the
 * contact page on a blank card. `@/dav` is mocked (real DavError kept) and
 * the book starts empty, so the created card is the only one around.
 */

import { QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DavError } from "@/dav";
import type { DavAddressBook, DavAuth } from "@/dav/types";
import { I18nProvider } from "@/i18n/react";
import { createQueryClient } from "@/queries";
import { routeTree } from "@/routeTree.gen";
import { useSessionStore } from "@/store/session";

const { mockDiscoverAddressBooks, mockListContacts, mockFetchCards, mockCreateCard } = vi.hoisted(
  () => ({
    mockDiscoverAddressBooks: vi.fn<(auth: DavAuth) => Promise<DavAddressBook[]>>(),
    mockListContacts:
      vi.fn<(auth: DavAuth, bookHref: string) => Promise<{ href: string; etag: string }[]>>(),
    mockFetchCards: vi.fn(async () => []),
    mockCreateCard:
      vi.fn<
        (
          auth: DavAuth,
          bookHref: string,
          vcardText: string,
        ) => Promise<{ href: string; etag: string }>
      >(),
  }),
);

vi.mock("@/dav", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/dav")>();
  return {
    ...actual,
    discoverAddressBooks: mockDiscoverAddressBooks,
    listContacts: mockListContacts,
    fetchCards: mockFetchCards,
    createCard: mockCreateCard,
  };
});

const AUTH: DavAuth = { username: "alice", password: "secret" };
const BOOK: DavAddressBook = { href: "http://localhost:3000/dav/books/a/", displayName: "Perso" };

function setLanguage(lang: string) {
  Object.defineProperty(window.navigator, "language", { get: () => lang, configurable: true });
}

function renderApp(path: string) {
  useSessionStore.setState({ auth: AUTH, selectedBook: null });
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  render(
    <QueryClientProvider client={createQueryClient()}>
      <I18nProvider>
        <RouterProvider router={router} />
      </I18nProvider>
    </QueryClientProvider>,
  );
  return router;
}

/** The family and given name inputs of the (single) fiche. */
async function nameInputs(): Promise<[HTMLInputElement, HTMLInputElement]> {
  const article = await screen.findByRole("article");
  const [family, given] = article.querySelectorAll<HTMLInputElement>('input[type="text"]');
  if (!family || !given) throw new Error("name inputs not found");
  return [family, given];
}

beforeEach(() => {
  setLanguage("fr-FR");
  vi.clearAllMocks();
  mockDiscoverAddressBooks.mockResolvedValue([BOOK]);
  mockListContacts.mockResolvedValue([]);
});

describe("new contact", () => {
  it("opens a blank form in edit mode from the header's + link", async () => {
    const router = renderApp("/contacts");
    const user = userEvent.setup();

    await user.click(await screen.findByRole("link", { name: "Nouveau contact" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/contacts/new"));
    const article = await screen.findByRole("article");
    expect(article.getAttribute("data-mode")).toBe("edit");
    const [family, given] = await nameInputs();
    expect(family.value).toBe("");
    expect(given.value).toBe("");
    expect(screen.getByRole("heading", { level: 1, name: "Nouveau contact" })).toBeTruthy();
  });

  it("creates a vCard 3.0 in the selected book and opens its page", async () => {
    mockCreateCard.mockResolvedValue({ href: `${BOOK.href}created.vcf`, etag: '"e1"' });
    const router = renderApp("/contacts/new");
    const user = userEvent.setup();
    const [family, given] = await nameInputs();

    await user.type(family, "Favre");
    await user.type(given, "Aline");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() => expect(mockCreateCard).toHaveBeenCalledTimes(1));
    const [auth, bookHref, vcard] = mockCreateCard.mock.calls[0] ?? [];
    expect(auth).toEqual(AUTH);
    expect(bookHref).toBe(BOOK.href);
    expect(vcard).toContain("VERSION:3.0");
    expect(vcard).toContain("N:Favre;Aline;;;");
    expect(vcard).toContain("FN:Aline Favre");
    const uid = vcard?.match(/^UID:(.+)$/m)?.[1]?.trim();
    expect(uid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);

    await waitFor(() => expect(router.state.location.pathname).toBe(`/contacts/${uid}`));
    const article = await screen.findByRole("article");
    expect(article.getAttribute("data-mode")).toBe("view");
    expect(screen.getByRole("heading", { level: 1, name: "Favre Aline" })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("Enregistré");
  });

  it("requires a name before anything is sent", async () => {
    renderApp("/contacts/new");
    const user = userEvent.setup();
    await nameInputs();

    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    expect((await screen.findAllByText("Requis")).length).toBeGreaterThan(0);
    expect(mockCreateCard).not.toHaveBeenCalled();
  });

  it("goes back to the list on cancel", async () => {
    const router = renderApp("/contacts/new");
    const user = userEvent.setup();
    await nameInputs();

    await user.click(screen.getByRole("button", { name: "Annuler" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/contacts"));
    expect(mockCreateCard).not.toHaveBeenCalled();
  });

  it("reports a 412 on create as an error, not as an edit conflict", async () => {
    mockCreateCard.mockRejectedValue(new DavError("exists", "CONFLICT"));
    const router = renderApp("/contacts/new");
    const user = userEvent.setup();
    const [family] = await nameInputs();

    await user.type(family, "Favre");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    expect(await screen.findByText("Erreur inattendue — réessayez.")).toBeTruthy();
    expect(screen.queryByText("Ce contact a été modifié ailleurs.")).toBeNull();
    expect(router.state.location.pathname).toBe("/contacts/new");
  });
});
