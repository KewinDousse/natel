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
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { type DavAddressBook, type DavAuth, DavError } from "@/dav/types";
import { I18nProvider } from "@/i18n/react";
import type { Contact, RawComponent } from "@/model/contact";
import { createQueryClient } from "@/queries";
import { addressBooksKey } from "@/queries/keys";
import { routeTree } from "@/routeTree.gen";
import { usePreferences } from "@/store/preferences";
import { useSessionStore } from "@/store/session";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const { mockDiscoverAddressBooks, mockListContacts, mockFetchCards, mockParse, mockCreateCard } =
  vi.hoisted(() => ({
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
    mockCreateCard:
      vi.fn<
        (
          auth: DavAuth,
          href: string,
          vcardText: string,
        ) => Promise<{ href: string; etag: string; vcardText: string }>
      >(),
  }));

vi.mock("@/dav", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/dav")>();
  return {
    ...actual,
    discoverAddressBooks: mockDiscoverAddressBooks,
    listContacts: mockListContacts,
    fetchCards: mockFetchCards,
    createCard: mockCreateCard,
    // Sign-outs the server confirms.
    closeSession: async () => true,
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
};

const BOOK_A: DavAddressBook = {
  href: "https://dav.example.org/dav/books/a/",
  displayName: "Perso",
};
const BOOK_B: DavAddressBook = { href: "https://dav.example.org/dav/books/b/", displayName: "Pro" };

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
    href: `https://dav.example.org/dav/books/a/${uid}.vcf`,
    etag: `"${uid}"`,
    uid,
    fields: {
      fn: `${overrides.fields?.n.family ?? "Dupont"} ${overrides.fields?.n.given ?? "Jean"}`.trim(),
      n: { family: "Dupont", given: "Jean", additional: "", prefix: "", suffix: "" },
      tel: [],
      email: [],
      nickname: "",
      adr: [],
      bday: null,
      org: "",
      title: "",
      url: "",
      note: "",
      photo: { kind: "unchanged" },
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
    makeContact("jarvan", {
      fields: {
        fn: "Lightshield Jarvan",
        n: { family: "Lightshield", given: "Jarvan", additional: "", prefix: "", suffix: "" },
        tel: [{ value: "078 000 00 03", params: { TYPE: "CELL" } }],
        email: [],
        nickname: "",
        adr: [],
        bday: null,
        org: "",
        title: "",
        url: "",
        note: "",
        photo: { kind: "unchanged" },
      },
    }),
    makeContact("fiora", {
      fields: {
        fn: "Laurent Fiora",
        n: { family: "Laurent", given: "Fiora", additional: "", prefix: "", suffix: "" },
        tel: [{ value: "091 000 00 04", params: { TYPE: "HOME" } }],
        email: [],
        nickname: "",
        adr: [],
        bday: null,
        org: "",
        title: "",
        url: "",
        note: "",
        photo: { kind: "unchanged" },
      },
    }),
    makeContact("lux", {
      fields: {
        fn: "Crownguard Luxanna",
        n: { family: "Crownguard", given: "Luxanna", additional: "", prefix: "", suffix: "" },
        tel: [],
        email: [{ value: "luxanna@crownguard.example" }],
        nickname: "",
        adr: [],
        bday: null,
        org: "",
        title: "",
        url: "",
        note: "",
        photo: { kind: "unchanged" },
      },
    }),
    makeContact("ezreal", {
      fields: {
        fn: "Éclat Ezreal",
        n: { family: "Éclat", given: "Ezreal", additional: "", prefix: "", suffix: "" },
        tel: [],
        email: [],
        nickname: "",
        adr: [],
        bday: null,
        org: "",
        title: "",
        url: "",
        note: "",
        photo: { kind: "unchanged" },
      },
    }),
    makeContact("numero", {
      fields: {
        fn: "123 Service",
        n: { family: "123 Service", given: "", additional: "", prefix: "", suffix: "" },
        tel: [],
        email: [],
        nickname: "",
        adr: [],
        bday: null,
        org: "",
        title: "",
        url: "",
        note: "",
        photo: { kind: "unchanged" },
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
  Object.defineProperty(window.navigator, "languages", {
    get: () => [lang],
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
  // The sort is remembered: a test that changes it mustn't leave it changed.
  usePreferences.setState({ sortBy: "family", theme: null });
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

  it("sends a logged-out visitor to /login with the page to come back to", async () => {
    const router = renderApp("/contacts/b/abc");

    expect(await screen.findByRole("heading", { name: "Ouvrir le carnet" })).toBeTruthy();
    expect(router.state.location.pathname).toBe("/login");
    expect(router.state.location.search).toEqual({ redirect: "/contacts/b/abc" });
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
    expect(await screen.findByText(/Lightshield/)).toBeTruthy();
    // The count line is announced and shows the full book size.
    const count = screen.getByText("5 contacts");
    expect(count.parentElement?.getAttribute("aria-live")).toBe("polite");
  });

  it("names the selected book in the URL", async () => {
    const router = await renderLoggedIn();

    await waitFor(() => expect(router.state.location.pathname).toBe("/contacts/a"));
  });

  it("opens the book the URL names, as after a reload", async () => {
    const router = await renderLoggedIn("/contacts/b");

    expect(await screen.findByText("Ce carnet est vide")).toBeTruthy();
    expect(useSessionStore.getState().selectedBook?.href).toBe(BOOK_B.href);
    expect(router.state.location.pathname).toBe("/contacts/b");
  });

  it("opens the selected book when the URL names one the server doesn't have", async () => {
    const router = await renderLoggedIn("/contacts/gone/jarvan");

    await waitFor(() => expect(router.state.location.pathname).toBe("/contacts/a"));
    expect(useSessionStore.getState().selectedBook?.href).toBe(BOOK_A.href);
  });

  it("opens a contact's address from before books were in it in the first book", async () => {
    const router = await renderLoggedIn("/contacts/jarvan");

    await waitFor(() => expect(router.state.location.pathname).toBe("/contacts/a/jarvan"));
    expect(
      await screen.findByRole("heading", { level: 1, name: "Lightshield Jarvan" }),
    ).toBeTruthy();
  });

  it("puts the book in a contact's address", async () => {
    const router = await renderLoggedIn("/contacts/a");
    const user = userEvent.setup();

    await user.click(await screen.findByRole("link", { name: /Lightshield Jarvan/ }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/contacts/a/jarvan"));
  });

  it("shows a dedicated state when discovery returns zero books", async () => {
    useSessionStore.setState({ auth: AUTH, selectedBook: null });
    mockDiscoverAddressBooks.mockResolvedValue([]);
    renderApp("/contacts");

    expect(await screen.findByText("Aucun carnet d’adresses trouvé sur ce serveur.")).toBeTruthy();
  });

  it("names the list in the top bar when the server has no book", async () => {
    useSessionStore.setState({ auth: AUTH, selectedBook: null });
    mockDiscoverAddressBooks.mockResolvedValue([]);
    renderApp("/settings");

    const back = await screen.findByRole("link", { name: "Retour aux contacts" });
    expect(back.textContent).toBe("Contacts");
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
    expect(headings).toEqual(["C", "E", "L", "#"]);

    const rail = document.getElementById("rail");
    expect(rail).not.toBeNull();
    expect(rail?.querySelector('a[href="#g-C"]')).not.toBeNull();
    // Absent letters are non-interactive spans, not links.
    expect(rail?.querySelector('a[href="#g-A"]')).toBeNull();
    expect(rail?.querySelector("span")?.textContent).toBe("A");
  });

  it("shows a row whose card has neither a name nor an organisation as unnamed", async () => {
    useSessionStore.setState({ auth: AUTH, selectedBook: null });
    mockDiscoverAddressBooks.mockResolvedValue([BOOK_A, BOOK_B]);
    const nameless = makeContact("nameless", {
      fields: {
        fn: "",
        n: { family: "", given: "", additional: "", prefix: "", suffix: "" },
      } as Contact["fields"],
    });
    loadBook([...bookAContacts(), nameless]);
    renderApp("/contacts");
    const row = await screen.findByRole("link", { name: "Contact sans nom" });
    const label = within(row).getByText("Contact sans nom");
    expect(label.className).toContain("italic");
    expect(label.className).toContain("text-muted-foreground");
    expect(screen.queryAllByText("Contact sans nom")).toHaveLength(1);

    fireEvent.click(row);
    const fiche = await screen.findByRole("article", { name: "Contact sans nom" });
    // The family-name line, besides the sr-only title.
    const line = within(fiche)
      .getAllByText("Contact sans nom")
      .find((node) => !node.classList.contains("sr-only"));
    expect(line?.className).toContain("italic");
    expect(line?.className).toContain("text-muted-foreground");
  });

  it("marks the selected row with aria-current and shows the detail pane", async () => {
    await renderLoggedIn();
    const user = userEvent.setup();

    const row = await screen.findByRole("link", { name: /Lightshield Jarvan/ });
    await user.click(row);

    // The router's Link marks the active row; our styles key off its
    // data-status="active" marker.
    await waitFor(() => {
      expect(
        screen.getByRole("link", { name: /Lightshield Jarvan/ }).getAttribute("aria-current"),
      ).toBe("page");
    });
    expect(
      screen.getByRole("link", { name: /Lightshield Jarvan/ }).getAttribute("data-status"),
    ).toBe("active");
    expect(
      await screen.findByRole("heading", { level: 1, name: "Lightshield Jarvan" }),
    ).toBeTruthy();
    // The back affordance exists on mobile.
    expect(screen.getByRole("link", { name: "Retour à «\u00a0Perso\u00a0»" })).toBeTruthy();

    await user.click(screen.getByRole("link", { name: "Retour à «\u00a0Perso\u00a0»" }));
    expect(
      screen.getByRole("link", { name: /Lightshield Jarvan/ }).getAttribute("aria-current"),
    ).toBeNull();
  });

  it("switches the grouping key with the sort toggle", async () => {
    await renderLoggedIn();
    const user = userEvent.setup();

    expect((await screen.findAllByRole("heading", { level: 2 })).map((h) => h.textContent)).toEqual(
      ["C", "E", "L", "#"],
    );

    await user.click(screen.getByRole("button", { name: "Prénom" }));

    const headings = await screen.findAllByRole("heading", { level: 2 });
    expect(headings.map((h) => h.textContent)).toEqual(["E", "F", "J", "L", "#"]);
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

    await screen.findByText(/Lightshield/);
    await user.type(screen.getByRole("searchbox"), "ecl");

    // Only Éclat survives; the mark covers the matched characters.
    expect(screen.getByRole("link", { name: /Éclat Ezreal/ })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Lightshield/ })).toBeNull();
    expect(screen.getByRole("link", { name: /Éclat/ }).querySelector("mark")?.textContent).toBe(
      "Écl",
    );
    expect(screen.getByText("1 résultat")).toBeTruthy();
  });

  it("matches phone digits as substrings and never matches phones with letters", async () => {
    await renderLoggedIn();
    const user = userEvent.setup();

    await screen.findByText(/Lightshield/);
    // Compact digit query matches through the digit rule. The digits-only
    // query "078000" matches the digits of "078 000 00 03" → the whole
    // formatted value is highlighted.
    await user.type(screen.getByRole("searchbox"), "078000");

    expect(screen.getByRole("link", { name: /Lightshield/ })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Laurent/ })).toBeNull();
    const digitsMark = screen.getByRole("link", { name: /Lightshield/ }).querySelector("mark");
    expect(digitsMark).not.toBeNull();
    expect(digitsMark?.textContent).toBe("078 000 00 03");

    await user.clear(screen.getByRole("searchbox"));
    await user.type(screen.getByRole("searchbox"), "078 000");
    expect(
      screen.getByRole("link", { name: /Lightshield/ }).querySelector("mark")?.textContent,
    ).toBe("078 000");

    await user.clear(screen.getByRole("searchbox"));
    await user.type(screen.getByRole("searchbox"), "78x");
    expect(screen.getAllByText("Aucun résultat").length).toBeGreaterThan(0);
  });

  it("shows the zero-results state and hides the rail while searching", async () => {
    await renderLoggedIn();
    const user = userEvent.setup();

    await screen.findByText(/Lightshield/);
    await user.type(screen.getByRole("searchbox"), "ar");

    // Rail still rendered (results exist) but hidden.
    expect(document.getElementById("rail")?.hasAttribute("hidden")).toBe(true);
    expect(screen.getByText("2 résultats")).toBeTruthy();

    await user.clear(screen.getByRole("searchbox"));
    await user.type(screen.getByRole("searchbox"), "xyzzy");

    expect(screen.getAllByText("Aucun résultat").length).toBeGreaterThan(0);
    expect(
      screen.getByText(
        "La recherche porte aussi sur les numéros, e\u2060-\u2060mails et organisations.",
      ),
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
    const router = await renderLoggedIn();
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
    await waitFor(() => expect(router.state.location.pathname).toBe("/contacts/b"));
    // Book B is empty in the pipeline → empty-book state.
    expect(await screen.findByText("Ce carnet est vide")).toBeTruthy();
  });

  it("leaves the open contact for the other book's list", async () => {
    const router = await renderLoggedIn("/contacts/a/jarvan");
    const user = userEvent.setup();
    await screen.findByRole("heading", { level: 1, name: "Lightshield Jarvan" });

    await user.click(await screen.findByRole("button", { name: /Carnet d/ }));
    await user.click(screen.getByRole("menuitemradio", { name: "Pro" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/contacts/b"));
    expect(await screen.findByText("Ce carnet est vide")).toBeTruthy();
  });

  it("stays on the settings, which belong to no book", async () => {
    const router = await renderLoggedIn("/settings");
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: /Carnet d/ }));
    await user.click(screen.getByRole("menuitemradio", { name: "Pro" }));

    await waitFor(() => expect(useSessionStore.getState().selectedBook?.href).toBe(BOOK_B.href));
    expect(router.state.location.pathname).toBe("/settings");
  });
});

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

describe("layout", () => {
  it("uses the desktop grid classes and hides the list on mobile while a contact is open", async () => {
    await renderLoggedIn();
    const user = userEvent.setup();

    // Wait for the router to mount the route before inspecting the layout.
    const row = await screen.findByRole("link", { name: /Lightshield Jarvan/ });
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
});

// ---------------------------------------------------------------------------
// Sync
// ---------------------------------------------------------------------------

describe("incomplete address books", () => {
  it("keeps the live region mounted from loading to an incomplete result", async () => {
    useSessionStore.setState({ auth: AUTH, selectedBook: BOOK_A });
    mockDiscoverAddressBooks.mockResolvedValue([BOOK_A]);
    loadBook(bookAContacts().slice(0, 1));
    let finish: ((cards: []) => void) | undefined;
    mockFetchCards.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    renderApp("/contacts");
    await waitFor(() => expect(finish).toBeDefined());
    const live = document.querySelector("[data-incomplete-book]");
    expect(live).not.toBeNull();
    expect(live?.textContent).toBe("");
    finish?.([]);
    await screen.findByRole("status", { name: "Liste incomplète" });
    expect(document.querySelector("[data-incomplete-book]")).toBe(live);
  });

  it("retries the cards when background discovery has failed", async () => {
    useSessionStore.setState({ auth: AUTH, selectedBook: BOOK_A });
    mockDiscoverAddressBooks.mockResolvedValue([BOOK_A]);
    loadBook(bookAContacts().slice(0, 1));
    mockFetchCards.mockResolvedValue([]);
    const queryClient = createQueryClient();
    queryClient.setDefaultOptions({ queries: { retry: false } });
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
    const warning = await screen.findByRole("status", { name: "Liste incomplète" });
    mockDiscoverAddressBooks.mockRejectedValue(
      new DavError("Synthetic discovery failure", "NETWORK"),
    );
    await queryClient.refetchQueries({ queryKey: addressBooksKey(AUTH) });
    loadBook(bookAContacts().slice(0, 1));
    await userEvent.setup().click(within(warning).getByRole("button", { name: "Réessayer" }));
    await screen.findByRole("link", { name: /Lightshield Jarvan/ });
    expect(screen.queryByRole("status", { name: "Liste incomplète" })).toBeNull();
  });

  it("reports missing and unreadable cards while keeping readable contacts visible", async () => {
    useSessionStore.setState({ auth: AUTH, selectedBook: null });
    mockDiscoverAddressBooks.mockResolvedValue([BOOK_A, BOOK_B]);
    const contacts = bookAContacts().slice(0, 3);
    loadBook(contacts);
    mockFetchCards.mockResolvedValue(
      contacts.slice(0, 2).map((contact) => ({
        href: contact.href,
        etag: contact.etag,
        vcardText: contact.href,
      })),
    );
    const parse = mockParse.getMockImplementation()!;
    mockParse.mockImplementation((text, href, etag) => {
      if (href === contacts[1]!.href) throw new Error("Invalid synthetic card");
      return parse(text, href, etag);
    });
    renderApp("/contacts");

    const warning = await screen.findByRole("status", { name: "Liste incomplète" });
    expect(warning.textContent).toContain("2 fiches n’ont pas pu être affichées.");
    expect(await screen.findByRole("link", { name: /Lightshield Jarvan/ })).toBeTruthy();

    loadBook(contacts);
    await userEvent.setup().click(within(warning).getByRole("button", { name: "Réessayer" }));
    await waitFor(() =>
      expect(screen.queryByRole("status", { name: "Liste incomplète" })).toBeNull(),
    );
    expect(await screen.findByText("3 contacts")).toBeTruthy();
  });

  it("does not call a book empty when every listed card failed to load", async () => {
    useSessionStore.setState({ auth: AUTH, selectedBook: null });
    mockDiscoverAddressBooks.mockResolvedValue([BOOK_A]);
    loadBook(bookAContacts().slice(0, 1));
    mockFetchCards.mockResolvedValue([]);
    renderApp("/contacts");

    const warning = await screen.findByRole("status", { name: "Liste incomplète" });
    expect(warning.textContent).toContain("1 fiche n’a pas pu être affichée.");
    expect(screen.queryByText("Ce carnet est vide")).toBeNull();
  });

  it("clears the warning on switching to a different book", async () => {
    useSessionStore.setState({ auth: AUTH, selectedBook: null });
    mockDiscoverAddressBooks.mockResolvedValue([BOOK_A, BOOK_B]);
    loadBook(bookAContacts().slice(0, 1));
    mockFetchCards.mockResolvedValue([]);
    renderApp("/contacts");
    await screen.findByRole("status", { name: "Liste incomplète" });

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Carnet d/ }));
    await user.click(screen.getByRole("menuitemradio", { name: "Pro" }));
    await screen.findByText("Ce carnet est vide");
    expect(screen.queryByRole("status", { name: "Liste incomplète" })).toBeNull();
  });

  it("shows no warning after a complete load", async () => {
    await renderLoggedIn();
    await screen.findByText("5 contacts");
    expect(screen.queryByRole("status", { name: "Liste incomplète" })).toBeNull();
  });
});

describe("sync", () => {
  /** The book loaded; a failed reload shows after the query's two retries. */
  async function renderLoaded(path = "/contacts") {
    useSessionStore.setState({ auth: AUTH, selectedBook: null });
    mockDiscoverAddressBooks.mockResolvedValue([BOOK_A]);
    loadBook(bookAContacts());
    const queryClient = createQueryClient();
    const router = createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: [path] }),
    });
    render(
      <QueryClientProvider client={queryClient}>
        <I18nProvider>
          <RouterProvider router={router} />
        </I18nProvider>
      </QueryClientProvider>,
    );
    await screen.findByRole("link", { name: /Lightshield Jarvan/ });
    return { queryClient, router };
  }

  it("warns only when the book can't be reloaded, explains it, and tries again", async () => {
    const { queryClient } = await renderLoaded();
    expect(screen.queryByRole("button", { name: "Synchronisation impossible" })).toBeNull();

    mockListContacts.mockRejectedValue(new DavError("down", "NETWORK"));
    void queryClient.refetchQueries();
    const warning = await screen.findByRole(
      "button",
      { name: "Synchronisation impossible" },
      { timeout: 8000 },
    );
    // The contacts already shown stay.
    expect(screen.getByRole("link", { name: /Lightshield Jarvan/ })).toBeTruthy();

    // A tap opens the explanation, its action focused.
    const user = userEvent.setup();
    await user.click(warning);
    expect(warning.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText(/ne sont peut-être plus à jour/)).toBeTruthy();
    const retry = screen.getByRole("button", { name: "Réessayer" });
    expect(document.activeElement).toBe(retry);

    // Escape closes it and gives the warning the focus back.
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("button", { name: "Réessayer" })).toBeNull();
    expect(document.activeElement).toBe(warning);

    // While it reloads, the action stays focusable but does nothing.
    let finish: () => void = () => {};
    mockListContacts.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = () => resolve(bookAContacts().map((c) => ({ href: c.href, etag: c.etag })));
        }),
    );
    mockListContacts.mockClear();
    await user.click(warning);
    await user.click(screen.getByRole("button", { name: "Réessayer" }));
    const syncing = await screen.findByRole("button", { name: "Synchronisation…" });
    expect(syncing.getAttribute("aria-disabled")).toBe("true");
    await user.click(syncing);
    expect(mockListContacts).toHaveBeenCalledTimes(1);

    finish();
    expect(await screen.findByText("Contacts à jour")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Synchronisation impossible" })).toBeNull();
    // The focus moves on rather than falling back to the page.
    expect(document.activeElement).toBe(screen.getByRole("link", { name: "Paramètres" }));
  }, 15000);

  it("closes the panel on a click outside, and Escape in it doesn't cancel an edit", async () => {
    const { queryClient } = await renderLoaded("/contacts/a/jarvan?edit=true");
    await screen.findByRole("button", { name: "Enregistrer" });

    mockListContacts.mockRejectedValue(new DavError("down", "NETWORK"));
    void queryClient.refetchQueries();
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", { name: "Synchronisation impossible" }, { timeout: 8000 }),
    );
    await user.click(document.body);
    expect(screen.queryByRole("button", { name: "Réessayer" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Synchronisation impossible" }));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("button", { name: "Réessayer" })).toBeNull();
    expect(screen.getByRole("button", { name: "Enregistrer" })).toBeTruthy();
  }, 15000);

  it("offers to sign in again when the session expired since the book loaded", async () => {
    const { queryClient, router } = await renderLoaded();

    mockListContacts.mockRejectedValue(new DavError("expired", "AUTH"));
    void queryClient.refetchQueries();
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", { name: "Votre session a expiré" }, { timeout: 8000 }),
    );
    await user.click(screen.getByRole("button", { name: "Se reconnecter" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
    // Signing in again comes back to the list, in the same book.
    expect(router.state.location.search).toEqual({ redirect: "/contacts/a" });
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  }, 15000);
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
      history: createMemoryHistory({ initialEntries: ["/settings"] }),
    });
    render(
      <QueryClientProvider client={queryClient}>
        <I18nProvider>
          <RouterProvider router={router} />
        </I18nProvider>
      </QueryClientProvider>,
    );
    await screen.findByText(/Lightshield/);

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Se déconnecter" }));

    expect(await screen.findByRole("heading", { name: "Ouvrir le carnet" })).toBeTruthy();
    expect(router.state.location.pathname).toBe("/login");
    expect(useSessionStore.getState().auth).toBeNull();
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Loading, failing and empty books
// ---------------------------------------------------------------------------

describe("while the book loads, fails or is empty", () => {
  it("shows placeholder rows while the book loads", async () => {
    useSessionStore.setState({ auth: AUTH, selectedBook: null });
    mockDiscoverAddressBooks.mockResolvedValue([BOOK_A]);
    mockListContacts.mockImplementation(() => new Promise(() => {}));
    renderApp("/contacts");

    expect(await screen.findByText("Chargement des contacts…")).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "Contacts" }).getAttribute("aria-busy")).toBe(
      "true",
    );
  });

  it("says the server isn't answering, and tries again", async () => {
    useSessionStore.setState({ auth: AUTH, selectedBook: null });
    mockDiscoverAddressBooks.mockResolvedValue([BOOK_A]);
    mockListContacts.mockRejectedValue(new DavError("down", "NETWORK"));
    renderApp("/contacts");
    const user = userEvent.setup();

    expect(
      await screen.findByText("Impossible de charger les contacts", {}, { timeout: 8000 }),
    ).toBeTruthy();
    // The list says it; the header doesn't warn about a book never shown.
    expect(screen.queryByRole("button", { name: "Synchronisation impossible" })).toBeNull();
    loadBook(bookAContacts());
    await user.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(await screen.findByRole("link", { name: /Lightshield Jarvan/ })).toBeTruthy();
  }, 15000);

  it("asks to sign in again when the session has expired", async () => {
    useSessionStore.setState({ auth: AUTH, selectedBook: null });
    mockDiscoverAddressBooks.mockRejectedValue(new DavError("expired", "AUTH"));
    renderApp("/contacts");

    expect(await screen.findByText("Votre session a expiré", {}, { timeout: 8000 })).toBeTruthy();
    await userEvent.setup().click(screen.getByRole("button", { name: "Se reconnecter" }));
    expect(await screen.findByRole("heading", { name: "Ouvrir le carnet" })).toBeTruthy();
  }, 15000);

  it("offers a first contact and an import on an empty book", async () => {
    useSessionStore.setState({ auth: AUTH, selectedBook: null });
    mockDiscoverAddressBooks.mockResolvedValue([BOOK_A]);
    loadBook([]);
    renderApp("/contacts");

    expect(await screen.findByText("Ce carnet est vide")).toBeTruthy();
    const list = screen.getByRole("navigation", { name: "Contacts" });
    expect(within(list).getByRole("link", { name: "Nouveau contact" }).getAttribute("href")).toBe(
      "/contacts/a/new",
    );
    expect(within(list).getByRole("button", { name: "Importer un fichier .vcf" })).toBeTruthy();
  });

  it("keeps an open import on its book when the address changes book", async () => {
    const router = await renderLoggedIn("/contacts/b");
    mockCreateCard.mockImplementation(async (_auth, href, vcardText) => ({
      href,
      etag: '"new"',
      vcardText,
    }));
    const list = await screen.findByRole("navigation", { name: "Contacts" });
    await within(list).findByText("Ce carnet est vide");
    const input = list.querySelector('input[type="file"]');
    if (!(input instanceof HTMLInputElement)) throw new Error("no file input");
    const card = "BEGIN:VCARD\r\nVERSION:3.0\r\nUID:grace\r\nFN:Grace Hopper\r\nEND:VCARD\r\n";
    await userEvent.setup().upload(input, new File([card], "grace.vcf", { type: "text/vcard" }));
    const dialog = await screen.findByRole("dialog", { name: "Importer dans «\u00a0Pro\u00a0»" });

    await router.navigate({ to: "/contacts/$book", params: { book: "a" } });
    await waitFor(() => expect(useSessionStore.getState().selectedBook?.href).toBe(BOOK_A.href));
    expect(dialog.isConnected).toBe(true);
    expect(within(dialog).getByRole("heading").textContent).toBe("Importer dans «\u00a0Pro\u00a0»");
    await userEvent
      .setup()
      .click(within(dialog).getByRole("button", { name: "Importer 1 contact" }));

    await within(dialog).findByText(/^Importés\s: 1$/);
    expect(mockCreateCard).toHaveBeenCalledTimes(1);
    expect(mockCreateCard.mock.calls[0]?.[1]).toMatch(
      /^https:\/\/dav\.example\.org\/dav\/books\/b\//,
    );
  });

  it("counts a lone contact in the singular", async () => {
    useSessionStore.setState({ auth: AUTH, selectedBook: null });
    mockDiscoverAddressBooks.mockResolvedValue([BOOK_A]);
    loadBook(bookAContacts().slice(0, 1));
    renderApp("/contacts");

    expect(await screen.findByText("1 contact")).toBeTruthy();
  });

  it("names the open book in the switcher's accessible name", async () => {
    await renderLoggedIn();

    expect(await screen.findByRole("button", { name: "Carnet d’adresses : Perso" })).toBeTruthy();
  });
});
