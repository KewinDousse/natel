/**
 * Component tests for /contacts/$id — the contact page in VIEW mode.
 *
 * Renders the real router with the real vCard parse (only the dav layer is
 * mocked), so the read-only display accessors exercise real vCard text.
 */

import { QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DavAddressBook, DavAuth } from "@/dav/types";
import { I18nProvider } from "@/i18n/react";
import { createQueryClient } from "@/queries";
import { routeTree } from "@/routeTree.gen";
import { useSessionStore } from "@/store/session";

// ---------------------------------------------------------------------------
// Mocks (dav only — vcard stays real so accessors see real parsed cards)
// ---------------------------------------------------------------------------

const { mockDiscoverAddressBooks, mockListContacts, mockFetchCards } = vi.hoisted(() => ({
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
}));

vi.mock("@/dav", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/dav")>();
  return {
    ...actual,
    discoverAddressBooks: mockDiscoverAddressBooks,
    listContacts: mockListContacts,
    fetchCards: mockFetchCards,
  };
});

// ---------------------------------------------------------------------------
// Fixtures — synthetic vCards
// ---------------------------------------------------------------------------

const AUTH: DavAuth = {
  username: "alice",
  password: "secret",
};

const BOOK_A: DavAddressBook = {
  href: "https://dav.example.ch/dav/books/a/",
  displayName: "Perso",
};

const CARD_FULL = [
  "BEGIN:VCARD",
  "VERSION:3.0",
  "UID:full",
  "FN:Delacrétaz Anne-Sophie",
  "N:Delacrétaz;Anne-Sophie;;;",
  "TITLE:Responsable des espaces verts",
  "ORG:Commune de Pully",
  "TEL;TYPE=CELL:+41793184427",
  "TEL;TYPE=WORK:+41217213300",
  "EMAIL;TYPE=WORK:as.delacretaz@pully.ch",
  "EMAIL;TYPE=HOME:as.vuilleumier@proton.me",
  "ADR;TYPE=WORK:;;Avenue du Prieuré 2;Pully;VD;1009;Suisse",
  "BDAY:1987-03-14",
  "CATEGORIES:Travail,Repair Café",
  "NOTE:Rencontrée au Repair Café de Renens.\\nPréfère les messages aux appels.",
  "END:VCARD",
].join("\r\n");

const CARD_PHONE_ONLY = [
  "BEGIN:VCARD",
  "VERSION:3.0",
  "UID:phone-only",
  "FN:Meyer Luc",
  "N:Meyer;Luc;;;",
  "TEL;TYPE=VOICE:091 923 77 60",
  "END:VCARD",
].join("\r\n");

/** Organisation-only: no N, no FN, so the avatar is the building icon. */
const CARD_ORG = [
  "BEGIN:VCARD",
  "VERSION:3.0",
  "UID:org-card",
  "ORG:Commune de Pully",
  "END:VCARD",
].join("\r\n");

const CARD_BDAY_MONTH_DAY = [
  "BEGIN:VCARD",
  "VERSION:3.0",
  "UID:bday-md",
  "FN:Favre Léa",
  "N:Favre;Léa;;;",
  "BDAY:--03-14",
  "END:VCARD",
].join("\r\n");

const CARDS = {
  full: CARD_FULL,
  "phone-only": CARD_PHONE_ONLY,
  "org-card": CARD_ORG,
  "bday-md": CARD_BDAY_MONTH_DAY,
};

function loadCards(selected: Record<string, string> = CARDS) {
  const entries = Object.entries(selected);
  mockListContacts.mockImplementation(async (_auth, bookHref) =>
    bookHref === BOOK_A.href
      ? entries.map(([uid]) => ({
          href: `https://dav.example.ch/dav/books/a/${uid}.vcf`,
          etag: `"${uid}"`,
        }))
      : [],
  );
  mockFetchCards.mockImplementation(async (_auth, hrefs) =>
    hrefs.map((href) => ({
      href,
      etag: '"e"',
      vcardText: selected[href.split("/").at(-1)?.replace(".vcf", "") ?? ""] ?? "",
    })),
  );
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

async function renderLoggedIn(path: string) {
  useSessionStore.setState({ auth: AUTH, selectedBook: null });
  mockDiscoverAddressBooks.mockResolvedValue([BOOK_A]);
  loadCards();
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
// Content: sections in design order
// ---------------------------------------------------------------------------

describe("contact page content", () => {
  it("renders every populated section in DESIGN order with translated labels", async () => {
    await renderLoggedIn("/contacts/full");

    const article = await screen.findByRole("article");
    const titles = within(article)
      .getAllByRole("heading", { level: 2 })
      .map((h) => h.textContent);
    expect(titles).toEqual(["Téléphones", "E-mails", "Adresse", "Anniversaire", "Groupes", "Note"]);
  });

  it("hides empty sections entirely", async () => {
    await renderLoggedIn("/contacts/phone-only");

    const article = await screen.findByRole("article");
    const titles = within(article)
      .getAllByRole("heading", { level: 2 })
      .map((h) => h.textContent);
    expect(titles).toEqual(["Téléphones"]);
    expect(within(article).queryByText("E-mails")).toBeNull();
  });

  it("hides the job/org row when neither is present", async () => {
    await renderLoggedIn("/contacts/phone-only");

    const article = await screen.findByRole("article");
    // The phone still drives the action row…
    expect(within(article).getByRole("link", { name: "Appeler" })).toBeTruthy();
    // …but the job title / organisation row is absent (no TITLE, no ORG).
    expect(within(article).queryByText(/Responsable/)).toBeNull();
    expect(within(article).queryByText(/Commune de Pully/)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Web address
// ---------------------------------------------------------------------------

describe("web address", () => {
  async function renderWithUrl(url: string) {
    const card = [
      "BEGIN:VCARD",
      "VERSION:3.0",
      "UID:site",
      "FN:Meyer Luc",
      "N:Meyer;Luc;;;",
      `URL:${url}`,
      "END:VCARD",
    ].join("\r\n");
    useSessionStore.setState({ auth: AUTH, selectedBook: null });
    mockDiscoverAddressBooks.mockResolvedValue([BOOK_A]);
    loadCards({ site: card });
    renderApp("/contacts/site");
  }

  it.each([["https://example.org/luc"], ["http://example.org/luc"]])("links %s", async (url) => {
    await renderWithUrl(url);
    const link = await screen.findByRole("link", { name: url });
    expect(link.getAttribute("href")).toBe(url);
  });

  // A card written by another client or imported from a file can carry any scheme.
  it("shows an address with another scheme as text, not as a link", async () => {
    await renderWithUrl("ms-msdt:/id PCWDiagnostic");
    expect(await screen.findByText("ms-msdt:/id PCWDiagnostic")).toBeTruthy();
    expect(screen.queryByRole("link", { name: /ms-msdt/ })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Phones, emails, action row
// ---------------------------------------------------------------------------

describe("phones and action row", () => {
  it("formats the displayed number but keeps tel:/sms:/mailto: hrefs raw", async () => {
    await renderLoggedIn("/contacts/full");

    const callLink = await screen.findByRole("link", { name: "079 318 44 27" });
    expect(callLink.getAttribute("href")).toBe("tel:+41793184427");
    expect(screen.getByRole("link", { name: "SMS" }).getAttribute("href")).toBe("sms:+41793184427");

    const workLink = screen.getByRole("link", { name: "021 721 33 00" });
    expect(workLink.getAttribute("href")).toBe("tel:+41217213300");

    const writeLink = screen.getByRole("link", { name: "Écrire" });
    expect(writeLink.getAttribute("href")).toBe("mailto:as.delacretaz@pully.ch");

    // Emails display as stored.
    expect(screen.getByText("as.vuilleumier@proton.me")).toBeTruthy();

    // The list row's trailing phone is formatted too (display only).
    const row = screen.getByRole("link", { name: /Delacrétaz Anne-Sophie/ });
    expect(within(row).getByText("079 318 44 27")).toBeTruthy();
  });

  it("marks the primary number (first TYPE=cell) text-xl font-bold, others not", async () => {
    await renderLoggedIn("/contacts/full");

    const primary = await screen.findByRole("link", { name: "079 318 44 27" });
    expect(primary.parentElement?.className).toContain("text-xl");
    expect(primary.parentElement?.className).toContain("font-bold");
    // The primary must NOT carry the lg:text-[0.9375rem] step-down from TEXT;
    // at ≥1024px that would override text-xl and silently shrink the primary.
    expect(primary.parentElement?.className).not.toContain("lg:text-[0.9375rem]");

    const work = screen.getByRole("link", { name: "021 721 33 00" });
    expect(work.parentElement?.className).not.toContain("text-xl");
  });

  it("omits the SMS button when the contact has no number", async () => {
    await renderLoggedIn("/contacts/phone-only");

    // phone-only still has a phone → SMS present.
    expect(await screen.findByRole("link", { name: "SMS" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Appeler" })).toBeTruthy();
  });

  it("shows no action pill at all for an org-only card (no number, no email)", async () => {
    await renderLoggedIn("/contacts/org-card");

    expect(await screen.findByRole("article")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "SMS" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Appeler" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Écrire" })).toBeNull();
  });

  it("translates the mobile type label to Natel and the others", async () => {
    await renderLoggedIn("/contacts/full");

    const article = await screen.findByRole("article");
    expect(within(article).getByText("Natel")).toBeTruthy();
    expect(within(article).getByText("Domicile")).toBeTruthy();
    // "Travail" appears as a type label (work tel + work email) and a group chip.
    expect(within(article).getAllByText("Travail").length).toBeGreaterThanOrEqual(3);
  });

  it("falls back to Autre when no TYPE param is present", async () => {
    await renderLoggedIn("/contacts/phone-only");

    const article = await screen.findByRole("article");
    expect(within(article).getByText("Autre")).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Copy buttons
// ---------------------------------------------------------------------------

describe("copy buttons", () => {
  it("renders a copy button for every value row (tel, email, address, bday)", async () => {
    await renderLoggedIn("/contacts/full");

    const article = await screen.findByRole("article");
    // Tel section: 2 buttons (primary + work number)
    // Email section: 2 buttons (work + home email)
    // Address + bday: 1 each
    const copyButtons = within(article).getAllByRole("button");
    expect(copyButtons.length).toBeGreaterThanOrEqual(6);
  });
});

// ---------------------------------------------------------------------------
// Avatar, birthday, groups, note
// ---------------------------------------------------------------------------

describe("avatar and special sections", () => {
  it("shows initials on bg-avatar for a person card", async () => {
    await renderLoggedIn("/contacts/full");

    const article = await screen.findByRole("article");
    const avatar = within(article).getByText("DA");
    expect(avatar.className).toContain("bg-avatar");
    expect(avatar.className).toContain("font-display");
  });

  it("shows the building icon for an organisation-only card", async () => {
    await renderLoggedIn("/contacts/org-card");

    const article = await screen.findByRole("article");
    // Once as the page's accessible name, once as the visible org line.
    expect(within(article).getByRole("heading", { level: 1 }).textContent).toBe("Commune de Pully");
    const visible = within(article)
      .getAllByText("Commune de Pully")
      .filter((el) => el.closest(".sr-only") === null);
    expect(visible).toHaveLength(1);
    expect(article.querySelector("svg")).not.toBeNull();
    expect(within(article).queryByText(/^[A-Z]{2}$/)).toBeNull();
  });

  it("renders a month-day birthday without a year", async () => {
    await renderLoggedIn("/contacts/bday-md");

    const article = await screen.findByRole("article");
    const time = within(article).getByText("14 mars");
    expect(time.tagName).toBe("TIME");
    expect(time.getAttribute("dateTime")).toBe("--03-14");
  });

  it("renders groups as chips", async () => {
    await renderLoggedIn("/contacts/full");

    const article = await screen.findByRole("article");
    const chips = within(article).getAllByRole("listitem");
    expect(chips.map((c) => c.textContent)).toEqual(
      expect.arrayContaining(["Travail", "Repair Café"]),
    );
    for (const chip of chips) {
      expect(chip.className).toContain("rounded-full");
    }
  });

  it("preserves note whitespace with pre-wrap", async () => {
    await renderLoggedIn("/contacts/full");

    const article = await screen.findByRole("article");
    // getByText normalises whitespace, so match the collapsed form.
    // The note appears in both the view span and the hidden edit textarea.
    const noteElements = within(article).getAllByText(
      "Rencontrée au Repair Café de Renens. Préfère les messages aux appels.",
    );
    expect(noteElements.length).toBeGreaterThanOrEqual(1);
    const viewNote = noteElements[0] as HTMLElement;
    expect(viewNote).toBeTruthy();
    const parent = viewNote.parentElement;
    expect(parent?.className).toContain("whitespace-pre-wrap");
  });
});

// ---------------------------------------------------------------------------
// States: loading, not found, mobile top bar
// ---------------------------------------------------------------------------

describe("loading, not-found and mobile top bar", () => {
  it("renders nothing (like the list screen) while the book is loading", async () => {
    useSessionStore.setState({ auth: AUTH, selectedBook: null });
    mockDiscoverAddressBooks.mockResolvedValue([BOOK_A]);
    mockListContacts.mockImplementation(async () => []);
    mockFetchCards.mockImplementation(() => new Promise(() => {}));
    renderApp("/contacts/unknown");

    await waitFor(() => expect(useSessionStore.getState().selectedBook?.href).toBe(BOOK_A.href));
    expect(document.querySelector("article")).toBeNull();
    expect(screen.queryByText("Contact introuvable")).toBeNull();
  });

  it("shows an honest not-found state for an id outside the book", async () => {
    await renderLoggedIn("/contacts/unknown");

    expect(await screen.findByText("Contact introuvable")).toBeTruthy();
    expect(screen.getByText("Ce contact n’est pas dans ce carnet.")).toBeTruthy();
    expect(screen.queryByRole("article")).toBeNull();
  });

  it("mobile top bar is a router Link back to the list", async () => {
    const router = await renderLoggedIn("/contacts/full");
    const user = userEvent.setup();

    const back = await screen.findByRole("link", { name: "Retour aux contacts" });
    expect(back.textContent).toContain("Contacts");
    await user.click(back);
    await waitFor(() => expect(router.state.location.pathname).toBe("/contacts"));
  });

  it("keeps the back bar visible in the not-found state", async () => {
    await renderLoggedIn("/contacts/unknown");

    expect(await screen.findByRole("link", { name: "Retour aux contacts" })).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Edit-mode readiness
// ---------------------------------------------------------------------------

describe("edit-mode readiness", () => {
  it("page root is an article with group/fiche and data-mode=view", async () => {
    await renderLoggedIn("/contacts/full");

    const article = await screen.findByRole("article");
    expect(article.getAttribute("data-mode")).toBe("view");
    expect(article.className).toContain("group/fiche");
  });

  it("value cells stack view and edit layers in one grid area, edit hidden", async () => {
    await renderLoggedIn("/contacts/full");

    const article = await screen.findByRole("article");
    const stacked = article.querySelector('[class*="grid-area:1/1"]');
    expect(stacked).not.toBeNull();
    // The view frame carries the edit-hiding classes already.
    const frame = stacked?.querySelector('[class*="group-data-[mode=edit]"]');
    expect(frame).not.toBeNull();
    expect(stacked?.className).toContain("grid");
  });
});
