/**
 * Tests for src/routes/contacts.tsx — the directory screen.
 *
 * Renders the real router (routeTree + memory history) so the beforeLoad
 * guards run. `@/dav` and `@/vcard` are mocked (real parse/orgOf kept in
 * vcard), so discovery/fetching never hits the network and contacts are
 * controlled exactly.
 */

import { QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DavAddressBook, DavAuth } from "@/dav/types";
import { I18nProvider } from "@/i18n/react";
import type { Contact, RawComponent } from "@/model/contact";
import { createQueryClient } from "@/queries";
import { routeTree } from "@/routeTree.gen";
import { useSessionStore } from "@/store/session";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const { mockDiscoverAddressBooks, mockListContacts, mockFetchCards, mockParse } = vi.hoisted(
  () => ({
    mockDiscoverAddressBooks: vi.fn<(auth: DavAuth) => Promise<DavAddressBook[]>>(),
    mockListContacts:
      vi.fn<(auth: DavAuth, bookHref: string) => Promise<{ href: string; etag: string }[]>>(),
    mockFetchCards:
      vi.fn<
        (
          auth: DavAuth,
          hrefs: string[],
        ) => Promise<Array<{ href: string; etag: string; vcardText: string }>>
      >(),
    mockParse: vi.fn<(text: string, href: string, etag: string) => Contact>(),
  }),
);

vi.mock("@/dav", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/dav")>();
  return {
    ...actual,
    discoverAddressBooks: mockDiscoverAddressBooks,
    listContacts: mockListContacts,
    fetchCards: mockFetchCards,
  };
});

vi.mock("@/vcard", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/vcard")>();
  return { ...actual, parse: mockParse };
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const AUTH: DavAuth = {
  username: "alice",
  password: "secret",
};

const BOOK_A: DavAddressBook = {
  href: "https://dav.example.ch/dav/books/a/",
  displayName: "Perso",
};
const BOOK_B: DavAddressBook = { href: "https://dav.example.ch/dav/books/b/", displayName: "Pro" };

function rawStub(): RawComponent {
  return {
    getFirstPropertyValue: () => "",
    getFirstProperty: () => null,
    getAllProperties: () => [],
    removeAllProperties: () => {},
    removeProperty: () => true,
    addProperty: () => null,
    toString: () => "vcard",
  } as unknown as RawComponent;
}

function makeContact(uid: string, overrides: Partial<Contact> = {}): Contact {
  const base: Contact = {
    href: `https://dav.example.ch/dav/books/a/${uid}.vcf`,
    etag: `"${uid}"`,
    uid,
    fields: {
      fn: `${overrides.fields?.n.family ?? "Dupont"} ${overrides.fields?.n.given ?? "Jean"}`.trim(),
      n: { family: "Dupont", given: "Jean", additional: "", prefix: "", suffix: "" },
      tel: [],
      email: [],
      nickname: "",
      adr: null,
      bday: null,
      org: "",
      title: "",
      url: "",
      note: "",
    },
    raw: rawStub(),
  };
  return {
    ...base,
    ...overrides,
    fields: { ...base.fields, ...overrides.fields } as Contact["fields"],
  };
}

/** The five contacts of the "Perso" book used by the default pipeline. */
function bookAContacts(): Contact[] {
  return [
    makeContact("benali", {
      fields: {
        fn: "Benali Karim",
        n: { family: "Benali", given: "Karim", additional: "", prefix: "", suffix: "" },
        tel: [{ value: "078 330 12 45", params: { TYPE: "CELL" } }],
        email: [],
        nickname: "",
        adr: null,
        bday: null,
        org: "",
        title: "",
        url: "",
        note: "",
      },
    }),
    makeContact("bernasconi", {
      fields: {
        fn: "Bernasconi Giulia",
        n: { family: "Bernasconi", given: "Giulia", additional: "", prefix: "", suffix: "" },
        tel: [{ value: "091 923 77 60", params: { TYPE: "HOME" } }],
        email: [],
        nickname: "",
        adr: null,
        bday: null,
        org: "",
        title: "",
        url: "",
        note: "",
      },
    }),
    makeContact("chen", {
      fields: {
        fn: "Chen Olivia",
        n: { family: "Chen", given: "Olivia", additional: "", prefix: "", suffix: "" },
        tel: [],
        email: [{ value: "olivia@chen.ch" }],
        nickname: "",
        adr: null,
        bday: null,
        org: "",
        title: "",
        url: "",
        note: "",
      },
    }),
    makeContact("evrat", {
      fields: {
        fn: "Évrat Luc",
        n: { family: "Évrat", given: "Luc", additional: "", prefix: "", suffix: "" },
        tel: [],
        email: [],
        nickname: "",
        adr: null,
        bday: null,
        org: "",
        title: "",
        url: "",
        note: "",
      },
    }),
    makeContact("numero", {
      fields: {
        fn: "123 Service",
        n: { family: "123 Service", given: "", additional: "", prefix: "", suffix: "" },
        tel: [],
        email: [],
        nickname: "",
        adr: null,
        bday: null,
        org: "",
        title: "",
        url: "",
        note: "",
      },
    }),
  ];
}

/**
 * Wire the mocked dav/vcard pipeline so the "Perso" book returns `contacts`
 * and every other book returns none.
 */
function loadBook(contacts: Contact[]) {
  mockListContacts.mockImplementation(async (_auth, bookHref) =>
    bookHref === BOOK_A.href ? contacts.map((c) => ({ href: c.href, etag: c.etag })) : [],
  );
  mockFetchCards.mockImplementation(async (_auth, hrefs) =>
    hrefs.map((href) => ({ href, etag: '"e"', vcardText: href })),
  );
  mockParse.mockImplementation((_text, href) => {
    const contact = contacts.find((c) => c.href === href);
    return contact ?? contacts[0]!;
  });
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

function setLanguage(lang: string) {
  Object.defineProperty(window.navigator, "language", {
    get: () => lang,
    configurable: true,
  });
}

/** jsdom has no matchMedia; the "/" shortcut and desktop classes need one. */
function shimMatchMedia() {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string): MediaQueryList =>
      ({
        matches: true,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList,
  });
}

function renderApp(path: string) {
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

/** Render logged in with the default "Perso" book loaded. */
async function renderLoggedIn(path = "/contacts") {
  useSessionStore.setState({ auth: AUTH, selectedBook: null });
  mockDiscoverAddressBooks.mockResolvedValue([BOOK_A, BOOK_B]);
  loadBook(bookAContacts());
  return renderApp(path);
}

beforeEach(() => {
  setLanguage("fr-FR");
  shimMatchMedia();
  localStorage.clear();
  useSessionStore.setState({ auth: null, selectedBook: null });
  vi.resetAllMocks();
});

// ---------------------------------------------------------------------------
// Route guard
// ---------------------------------------------------------------------------

describe("route guard", () => {
  it("redirects /contacts to /login when logged out", async () => {
    renderApp("/contacts");

    expect(await screen.findByRole("heading", { name: "Ouvrir le carnet" })).toBeTruthy();
  });

  it("redirects logged-in / to /contacts", async () => {
    useSessionStore.setState({ auth: AUTH });
    mockDiscoverAddressBooks.mockResolvedValue([BOOK_A]);
    loadBook(bookAContacts());
    const router = renderApp("/");

    await waitFor(() => expect(router.state.location.pathname).toBe("/contacts"));
  });
});

// ---------------------------------------------------------------------------
// Address books
// ---------------------------------------------------------------------------

describe("address books", () => {
  it("auto-selects the first book and loads its contacts", async () => {
    await renderLoggedIn();

    await waitFor(() => expect(useSessionStore.getState().selectedBook?.href).toBe(BOOK_A.href));
    expect(await screen.findByText(/Benali/)).toBeTruthy();
    // The count line is announced and shows the full book size.
    const count = screen.getByText("5 contacts");
    expect(count.parentElement?.getAttribute("aria-live")).toBe("polite");
  });

  it("shows a dedicated state when discovery returns zero books", async () => {
    useSessionStore.setState({ auth: AUTH, selectedBook: null });
    mockDiscoverAddressBooks.mockResolvedValue([]);
    renderApp("/contacts");

    expect(await screen.findByText("Aucun carnet d’adresses trouvé sur ce serveur.")).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Grouping, rail, selection
// ---------------------------------------------------------------------------

describe("list grouping and rail", () => {
  it("groups by family initial, # last, and marks rail letters present/absent", async () => {
    await renderLoggedIn();

    const headings = (await screen.findAllByRole("heading", { level: 2 })).map(
      (h) => h.textContent,
    );
    expect(headings).toEqual(["B", "C", "E", "#"]);

    const rail = document.getElementById("rail");
    expect(rail).not.toBeNull();
    expect(rail?.querySelector('a[href="#g-B"]')).not.toBeNull();
    // Absent letters are non-interactive spans, not links.
    expect(rail?.querySelector('a[href="#g-A"]')).toBeNull();
    expect(rail?.querySelector("span")?.textContent).toBe("A");
  });

  it("marks the selected row with aria-current and shows the detail pane", async () => {
    await renderLoggedIn();
    const user = userEvent.setup();

    const row = await screen.findByRole("link", { name: /Benali Karim/ });
    await user.click(row);

    // The router's Link marks the active row; our styles key off its
    // data-status="active" marker.
    await waitFor(() => {
      expect(screen.getByRole("link", { name: /Benali Karim/ }).getAttribute("aria-current")).toBe(
        "page",
      );
    });
    expect(screen.getByRole("link", { name: /Benali Karim/ }).getAttribute("data-status")).toBe(
      "active",
    );
    expect(await screen.findByRole("heading", { level: 1, name: "Benali Karim" })).toBeTruthy();
    // The back affordance exists on mobile.
    expect(screen.getByRole("link", { name: "Retour aux contacts" })).toBeTruthy();

    await user.click(screen.getByRole("link", { name: "Retour aux contacts" }));
    expect(
      screen.getByRole("link", { name: /Benali Karim/ }).getAttribute("aria-current"),
    ).toBeNull();
  });

  it("switches the grouping key with the sort toggle", async () => {
    await renderLoggedIn();
    const user = userEvent.setup();

    expect((await screen.findAllByRole("heading", { level: 2 })).map((h) => h.textContent)).toEqual(
      ["B", "C", "E", "#"],
    );

    await user.click(screen.getByRole("button", { name: "Prénom" }));

    const headings = await screen.findAllByRole("heading", { level: 2 });
    expect(headings.map((h) => h.textContent)).toEqual(["G", "K", "L", "O", "#"]);
    expect(screen.getByRole("button", { name: "Prénom" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(screen.getByRole("button", { name: "Nom" }).getAttribute("aria-pressed")).toBe("false");
  });
});

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

describe("search", () => {
  it("filters accent-insensitively and highlights matches with <mark>", async () => {
    await renderLoggedIn();
    const user = userEvent.setup();

    await screen.findByText(/Benali/);
    await user.type(screen.getByRole("searchbox"), "evr");

    // Only Évrat survives; the mark covers the matched characters.
    expect(screen.getByRole("link", { name: /Évrat Luc/ })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Benali/ })).toBeNull();
    expect(screen.getByRole("link", { name: /Évrat/ }).querySelector("mark")?.textContent).toBe(
      "Évr",
    );
    expect(screen.getByText("1 résultat")).toBeTruthy();
  });

  it("matches phone digits as substrings and never matches phones with letters", async () => {
    await renderLoggedIn();
    const user = userEvent.setup();

    await screen.findByText(/Benali/);
    // Compact digit query matches through the digit rule. The digits-only
    // query "078330" matches the digits of "078 330 12 45" → the whole
    // formatted value is highlighted.
    await user.type(screen.getByRole("searchbox"), "078330");

    expect(screen.getByRole("link", { name: /Benali/ })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Bernasconi/ })).toBeNull();
    const digitsMark = screen.getByRole("link", { name: /Benali/ }).querySelector("mark");
    expect(digitsMark).not.toBeNull();
    expect(digitsMark?.textContent).toBe("078 330 12 45");

    await user.clear(screen.getByRole("searchbox"));
    await user.type(screen.getByRole("searchbox"), "078 330");
    expect(screen.getByRole("link", { name: /Benali/ }).querySelector("mark")?.textContent).toBe(
      "078 330",
    );

    await user.clear(screen.getByRole("searchbox"));
    await user.type(screen.getByRole("searchbox"), "78x");
    expect(screen.getAllByText("Aucun résultat").length).toBeGreaterThan(0);
  });

  it("shows the zero-results state and hides the rail while searching", async () => {
    await renderLoggedIn();
    const user = userEvent.setup();

    await screen.findByText(/Benali/);
    await user.type(screen.getByRole("searchbox"), "be");

    // Rail still rendered (results exist) but hidden.
    expect(document.getElementById("rail")?.hasAttribute("hidden")).toBe(true);
    expect(screen.getByText("2 résultats")).toBeTruthy();

    await user.clear(screen.getByRole("searchbox"));
    await user.type(screen.getByRole("searchbox"), "xyzzy");

    expect(screen.getAllByText("Aucun résultat").length).toBeGreaterThan(0);
    expect(
      screen.getByText("La recherche porte aussi sur les numéros, e-mails et organisations."),
    ).toBeTruthy();
    expect(document.getElementById("rail")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Keyboard
// ---------------------------------------------------------------------------

describe("search keyboard shortcuts", () => {
  it("focuses the search box on / and clears it on Escape", async () => {
    await renderLoggedIn();
    const searchbox = await screen.findByRole("searchbox");
    const user = userEvent.setup();
    await user.click(searchbox);
    expect(document.activeElement).toBe(searchbox);

    // "/" focuses the search box even when another element has focus.
    screen.getByRole("button", { name: "Prénom" }).focus();
    fireEvent.keyDown(window, { key: "/" });
    expect(document.activeElement).toBe(searchbox);

    await user.type(searchbox, "ben");
    fireEvent.keyDown(searchbox, { key: "Escape" });
    expect((searchbox as HTMLInputElement).value).toBe("");
  });

  it("does not hijack '/' while the search box is being typed in", async () => {
    await renderLoggedIn();
    const searchbox = await screen.findByRole("searchbox");
    const user = userEvent.setup();

    // A real "/" typed into the field must reach the input, not trigger the
    // focus shortcut (the handler skips targets that are inputs).
    await user.click(searchbox);
    await user.keyboard("/");

    expect((searchbox as HTMLInputElement).value).toBe("/");
  });
});

// ---------------------------------------------------------------------------
// Book switcher
// ---------------------------------------------------------------------------

describe("book switcher", () => {
  it("opens, marks the current book, switches books, and closes on Escape", async () => {
    await renderLoggedIn();
    const user = userEvent.setup();

    const trigger = await screen.findByRole("button", { name: /Carnet d/ });
    expect(trigger.textContent).toContain("Perso");

    await user.click(trigger);

    const perso = screen.getByRole("menuitemradio", { name: "Perso" });
    const pro = screen.getByRole("menuitemradio", { name: "Pro" });
    expect(perso.getAttribute("aria-checked")).toBe("true");
    expect(pro.getAttribute("aria-checked")).toBe("false");
    // Menu focus lands on the current book.
    expect(document.activeElement).toBe(perso);

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menuitemradio")).toBeNull();
    expect(document.activeElement).toBe(trigger);

    // Switch to the other book: still in the (freshly reopened) menu.
    await user.click(trigger);
    await user.click(screen.getByRole("menuitemradio", { name: "Pro" }));

    await waitFor(() => expect(useSessionStore.getState().selectedBook?.href).toBe(BOOK_B.href));
    // Book B is empty in the pipeline → empty-book state.
    expect(await screen.findByText("Ce carnet est vide.")).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Layout and sync
// ---------------------------------------------------------------------------

describe("layout and sync status", () => {
  it("uses the desktop grid classes and hides the list on mobile while a contact is open", async () => {
    await renderLoggedIn();
    const user = userEvent.setup();

    // Wait for the router to mount the route before inspecting the layout.
    const row = await screen.findByRole("link", { name: /Benali Karim/ });
    const main = document.querySelector("main");
    expect(main?.className).toContain("lg:grid-cols-[minmax(26rem,34rem)_1fr]");
    expect(document.querySelector("aside")?.className).toContain("lg:bg-muted");
    expect(document.getElementById("app-header")?.className).toContain("lg:static");

    await user.click(row);

    await waitFor(() => {
      expect(document.querySelector("aside")?.className).not.toContain("max-lg:hidden");
    });
    // The header is hidden on mobile while a contact fills the screen.
    expect(document.getElementById("app-header")?.className).toContain("max-lg:hidden");
  });

  it("shows the sync line once the contacts query has data", async () => {
    await renderLoggedIn();
    expect(await screen.findByText("Synchronisé à l’instant")).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Logout
// ---------------------------------------------------------------------------

describe("logout", () => {
  it("clears the session and the query cache, then shows the sign-in screen", async () => {
    useSessionStore.setState({ auth: AUTH, selectedBook: null });
    mockDiscoverAddressBooks.mockResolvedValue([BOOK_A, BOOK_B]);
    loadBook(bookAContacts());
    const queryClient = createQueryClient();
    const router = createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: ["/contacts"] }),
    });
    render(
      <QueryClientProvider client={queryClient}>
        <I18nProvider>
          <RouterProvider router={router} />
        </I18nProvider>
      </QueryClientProvider>,
    );
    await screen.findByText(/Benali/);

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Se déconnecter" }));

    expect(await screen.findByRole("heading", { name: "Ouvrir le carnet" })).toBeTruthy();
    expect(router.state.location.pathname).toBe("/login");
    expect(useSessionStore.getState().auth).toBeNull();
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  });
});
