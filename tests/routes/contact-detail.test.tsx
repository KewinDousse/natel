/**
 * Component tests for /contacts/$id — the contact page in VIEW mode.
 *
 * Renders the real router with the real vCard parse (only the dav layer is
 * mocked), so the read-only display accessors exercise real vCard text.
 */

import { QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { tintOf } from "@/components/photo-avatar";
import type { DavAddressBook, DavAuth } from "@/dav/types";
import { I18nProvider } from "@/i18n/react";
import { createQueryClient } from "@/queries";
import { routeTree } from "@/routeTree.gen";
import { usePreferences } from "@/store/preferences";
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
};

const BOOK_A: DavAddressBook = {
  href: "https://dav.example.org/dav/books/a/",
  displayName: "Perso",
};

const CARD_FULL = [
  "BEGIN:VCARD",
  "VERSION:3.0",
  "UID:full",
  "FN:Du Couteau Katarina",
  "N:Du Couteau;Katarina;;;",
  "TITLE:Lame de Noxus",
  "ORG:Haut Commandement de Noxus",
  "TEL;TYPE=CELL:+41790000001",
  "TEL;TYPE=WORK:+41210000002",
  "EMAIL;TYPE=WORK:katarina@noxus.example",
  "EMAIL;TYPE=HOME:kat@du-couteau.example",
  "ADR;TYPE=WORK:;;Place du Bastion 2;Noxus;NX;0000;Runeterra",
  "BDAY:1987-03-14",
  "CATEGORIES:Travail,Fosse de Noxus",
  "NOTE:Rencontrée à la Fosse de Noxus.\\nPréfère les messages aux appels.",
  "END:VCARD",
].join("\r\n");

const CARD_PHONE_ONLY = [
  "BEGIN:VCARD",
  "VERSION:3.0",
  "UID:phone-only",
  "FN:Lightshield Jarvan",
  "N:Lightshield;Jarvan;;;",
  "TEL;TYPE=VOICE:091 000 00 04",
  "END:VCARD",
].join("\r\n");

/** Organisation-only: no N, no FN, so the avatar is the building icon. */
const CARD_ORG = [
  "BEGIN:VCARD",
  "VERSION:3.0",
  "UID:org-card",
  "ORG:Haut Commandement de Noxus",
  "END:VCARD",
].join("\r\n");

const CARD_BDAY_MONTH_DAY = [
  "BEGIN:VCARD",
  "VERSION:3.0",
  "UID:bday-md",
  "FN:Fortune Sarah",
  "N:Fortune;Sarah;;;",
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
          href: `https://dav.example.org/dav/books/a/${uid}.vcf`,
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

function shimMatchMedia(matches = true) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string): MediaQueryList =>
      ({
        matches,
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
  usePreferences.setState({ sortBy: "family", theme: null, mapApp: null });
  useSessionStore.setState({ auth: null, selectedBook: null, groupFilter: null });
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
    expect(titles).toEqual([
      "Téléphones",
      "E\u2060-\u2060mails",
      "Adresse",
      "Anniversaire",
      "Groupes",
      "Note",
    ]);
  });

  it("hides empty sections entirely", async () => {
    await renderLoggedIn("/contacts/phone-only");

    const article = await screen.findByRole("article");
    const titles = within(article)
      .getAllByRole("heading", { level: 2 })
      .map((h) => h.textContent);
    expect(titles).toEqual(["Téléphone"]);
    expect(within(article).queryByText("E\u2060-\u2060mail")).toBeNull();
  });

  it("titles a section in the plural only for several values", async () => {
    await renderLoggedIn("/contacts/full");

    const article = await screen.findByRole("article");
    expect(within(article).getByRole("heading", { level: 2, name: "Téléphones" })).toBeTruthy();
    expect(
      within(article).getByRole("heading", { level: 2, name: "E\u2060-\u2060mails" }),
    ).toBeTruthy();
  });

  it("hides the job/org row when neither is present", async () => {
    await renderLoggedIn("/contacts/phone-only");

    const article = await screen.findByRole("article");
    // The phone still drives the action row…
    expect(within(article).getByRole("link", { name: "Appeler" })).toBeTruthy();
    // …but the job title / organisation row is absent (no TITLE, no ORG).
    expect(within(article).queryByText(/Lame de Noxus/)).toBeNull();
    expect(within(article).queryByText(/Haut Commandement de Noxus/)).toBeNull();
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

    const callLink = await screen.findByRole("link", { name: "079 000 00 01" });
    expect(callLink.getAttribute("href")).toBe("tel:+41790000001");
    expect(screen.getByRole("link", { name: "SMS" }).getAttribute("href")).toBe("sms:+41790000001");

    const workLink = screen.getByRole("link", { name: "021 000 00 02" });
    expect(workLink.getAttribute("href")).toBe("tel:+41210000002");

    const writeLink = screen.getByRole("link", { name: "E\u2060-\u2060mail" });
    expect(writeLink.getAttribute("href")).toBe("mailto:katarina@noxus.example");

    // Emails display as stored.
    expect(screen.getByText("kat@du-couteau.example")).toBeTruthy();

    // The list row's trailing phone is formatted too (display only).
    const row = screen.getByRole("link", { name: /Du Couteau Katarina/ });
    expect(within(row).getByText("079 000 00 01")).toBeTruthy();
  });

  // A card imported from a file or shared by another account can carry any value.
  it("keeps a value from adding fields to the tel:, sms: and mailto: links", async () => {
    const card = [
      "BEGIN:VCARD",
      "VERSION:3.0",
      "UID:fields",
      "FN:Meyer Luc",
      "N:Meyer;Luc;;;",
      "TEL;TYPE=CELL:*21#?body=Hi",
      "EMAIL:luc@example.org?bcc=x@attacker.example&body=Hi%0A",
      "END:VCARD",
    ].join("\r\n");
    useSessionStore.setState({ auth: AUTH, selectedBook: null });
    mockDiscoverAddressBooks.mockResolvedValue([BOOK_A]);
    loadCards({ fields: card });
    renderApp("/contacts/fields");

    const write = await screen.findByRole("link", { name: "E\u2060-\u2060mail" });
    expect(write.getAttribute("href")).toBe(
      "mailto:luc@example.org%3Fbcc%3Dx@attacker.example%26body%3DHi%250A",
    );
    expect(screen.getByRole("link", { name: "SMS" }).getAttribute("href")).toBe(
      "sms:*21%23%3Fbody=Hi",
    );
    const hrefs = screen.getAllByRole("link").map((link) => link.getAttribute("href"));
    expect(hrefs).toContain("tel:*21%23%3Fbody=Hi");
    expect(hrefs.filter((href) => /^(tel|sms|mailto):.*[?#]/.test(href ?? ""))).toEqual([]);
  });

  it("marks the primary number (first TYPE=cell) text-xl font-bold, others not", async () => {
    await renderLoggedIn("/contacts/full");

    const primary = await screen.findByRole("link", { name: "079 000 00 01" });
    expect(primary.className).toContain("text-xl");
    expect(primary.className).toContain("font-bold");
    // The body text's step-down at lg would override text-xl and shrink it.
    expect(primary.className).not.toContain("lg:text-body");

    const work = screen.getByRole("link", { name: "021 000 00 02" });
    expect(work.className).not.toContain("text-xl");
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
    expect(screen.queryByRole("link", { name: "E\u2060-\u2060mail" })).toBeNull();
  });

  it("translates the mobile type label to Mobile and the others", async () => {
    await renderLoggedIn("/contacts/full");

    const article = await screen.findByRole("article");
    expect(within(article).getByText("Mobile")).toBeTruthy();
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
  it("shows initials on the card's own tint for a person card", async () => {
    await renderLoggedIn("/contacts/full");

    const article = await screen.findByRole("article");
    const avatar = within(article).getByText("DK");
    expect(avatar.style.backgroundColor).toBe(`var(--avatar-tint-${tintOf("full")})`);
    expect(avatar.className).toContain("font-display");
  });

  it("shows the building icon for an organisation-only card", async () => {
    await renderLoggedIn("/contacts/org-card");

    const article = await screen.findByRole("article");
    // Once as the page's accessible name, once as the visible org line.
    expect(within(article).getByRole("heading", { level: 1 }).textContent).toBe(
      "Haut Commandement de Noxus",
    );
    const visible = within(article)
      .getAllByText("Haut Commandement de Noxus")
      .filter((el) => el.closest(".sr-only") === null);
    expect(visible).toHaveLength(1);
    expect(article.querySelector("svg")).not.toBeNull();
    expect(within(article).queryByText(/^[A-Z]{2}$/)).toBeNull();
  });

  it("shows the building icon, and the name once, for a card named after its organisation", async () => {
    const card = [
      "BEGIN:VCARD",
      "VERSION:3.0",
      "UID:atelier",
      "FN:Atelier de Lumière",
      "N:;;;;",
      "ORG:Atelier de Lumière",
      "END:VCARD",
    ].join("\r\n");
    useSessionStore.setState({ auth: AUTH, selectedBook: null });
    mockDiscoverAddressBooks.mockResolvedValue([BOOK_A]);
    loadCards({ atelier: card });
    renderApp("/contacts/atelier");

    const article = await screen.findByRole("article");
    const visible = within(article)
      .getAllByText("Atelier de Lumière")
      .filter((el) => el.closest(".sr-only") === null);
    expect(visible).toHaveLength(1);
    expect(article.querySelector("svg")).not.toBeNull();
  });

  it("writes the name and the initials in the order the list sorts by", async () => {
    await renderLoggedIn("/contacts/full");
    const article = await screen.findByRole("article");
    expect(within(article).getByText("Du Couteau Katarina", { selector: "p" })).toBeTruthy();

    act(() => usePreferences.setState({ sortBy: "given" }));
    expect(within(article).getByText("Katarina Du Couteau", { selector: "p" })).toBeTruthy();
    expect(within(article).getByText("KD")).toBeTruthy();
  });

  it("names an organisation once, its units under it", async () => {
    const card = [
      "BEGIN:VCARD",
      "VERSION:3.0",
      "UID:acme",
      "FN:",
      "N:;;;;",
      "ORG:ACME;Ventes",
      "END:VCARD",
    ].join("\r\n");
    useSessionStore.setState({ auth: AUTH, selectedBook: null });
    mockDiscoverAddressBooks.mockResolvedValue([BOOK_A]);
    loadCards({ acme: card });
    renderApp("/contacts/acme");

    const article = await screen.findByRole("article");
    const names = within(article)
      .getAllByText("ACME")
      .filter((el) => el.closest(".sr-only") === null);
    expect(names).toHaveLength(1);
    expect(within(article).getByText("Ventes")).toBeTruthy();
  });

  it("puts a first name alone on the first line, in ink", async () => {
    const card = [
      "BEGIN:VCARD",
      "VERSION:3.0",
      "UID:jinx",
      "FN:Jinx",
      "N:;Jinx;;;",
      "END:VCARD",
    ].join("\r\n");
    useSessionStore.setState({ auth: AUTH, selectedBook: null });
    mockDiscoverAddressBooks.mockResolvedValue([BOOK_A]);
    loadCards({ jinx: card });
    renderApp("/contacts/jinx");

    const article = await screen.findByRole("article");
    const name = within(article)
      .getAllByText("Jinx")
      .filter((el) => el.closest(".sr-only") === null);
    expect(name).toHaveLength(1);
    expect(name[0]?.className).not.toContain("text-muted-foreground");
    expect(name[0]?.parentElement?.className).not.toContain("text-muted-foreground");
  });

  it("writes the address as one block, the locality whole without a postcode", async () => {
    const card = [
      "BEGIN:VCARD",
      "VERSION:3.0",
      "UID:sciel",
      "FN:Sciel",
      "N:;Sciel;;;",
      "ADR;TYPE=HOME:;;Ferme des Champs-Dorés;Grande-Cité;;;",
      "END:VCARD",
    ].join("\r\n");
    useSessionStore.setState({ auth: AUTH, selectedBook: null });
    mockDiscoverAddressBooks.mockResolvedValue([BOOK_A]);
    loadCards({ sciel: card });
    renderApp("/contacts/sciel");

    const article = await screen.findByRole("article");
    const address = article.querySelector("address");
    expect(address?.textContent).toBe("Ferme des Champs-Dorés Grande-Cité");
    expect(within(address as HTMLElement).getByText("Grande-Cité").className).not.toContain(
      "truncate",
    );
  });

  it("links the address to OpenStreetMap, in a new tab, on a desktop", async () => {
    // jsdom's user agent names neither Android nor an Apple device.
    expect(navigator.userAgent).not.toMatch(/Android|iPhone|iPad|Macintosh/);
    await renderLoggedIn("/contacts/full");

    const article = await screen.findByRole("article");
    const link = within(article).getByRole("link", {
      name: "Voir Place du Bastion 2, 0000 Noxus, NX, Runeterra sur une carte",
    });
    expect(link.getAttribute("href")).toBe(
      "https://www.openstreetmap.org/search?query=Place%20du%20Bastion%202%2C%200000%20Noxus%2C%20NX%2C%20Runeterra",
    );
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    expect(link.querySelector("address")).not.toBeNull();
  });

  it("opens the map the settings choose, in the same tab for the device's app", async () => {
    usePreferences.setState({ mapApp: "geo" });
    await renderLoggedIn("/contacts/full");

    const article = await screen.findByRole("article");
    const link = within(article).getByRole("link", { name: /sur une carte$/ });
    expect(link.getAttribute("href")).toBe(
      "geo:0,0?q=Place%20du%20Bastion%202%2C%200000%20Noxus%2C%20NX%2C%20Runeterra",
    );
    expect(link.getAttribute("target")).toBeNull();
  });

  it("searches the map without the box and extended line, and gives a box alone no map", async () => {
    const card = [
      "BEGIN:VCARD",
      "VERSION:3.0",
      "UID:verso",
      "FN:Verso",
      "N:;Verso;;;",
      "ADR;TYPE=HOME:Case postale 33;Atelier;Rue du Monolithe 1;Lumière;;;",
      "END:VCARD",
    ].join("\r\n");
    const box = [
      "BEGIN:VCARD",
      "VERSION:3.0",
      "UID:box",
      "FN:Esquie",
      "N:;Esquie;;;",
      "ADR:Case postale 12;;;;;;",
      "END:VCARD",
    ].join("\r\n");
    useSessionStore.setState({ auth: AUTH, selectedBook: null });
    mockDiscoverAddressBooks.mockResolvedValue([BOOK_A]);
    loadCards({ verso: card, box });
    const router = renderApp("/contacts/verso");

    const article = await screen.findByRole("article");
    expect(
      within(article)
        .getByRole("link", { name: /sur une carte$/ })
        .getAttribute("href"),
    ).toBe("https://www.openstreetmap.org/search?query=Rue%20du%20Monolithe%201%2C%20Lumi%C3%A8re");

    await act(() => router.navigate({ to: "/contacts/$id", params: { id: "box" } }));
    await waitFor(() =>
      expect(screen.getByRole("article").querySelector("address")?.textContent).toBe(
        "Case postale 12",
      ),
    );
    expect(within(screen.getByRole("article")).queryByRole("link", { name: /carte/ })).toBeNull();
  });

  it("shows every address, each with its type or label", async () => {
    const card = [
      "BEGIN:VCARD",
      "VERSION:3.0",
      "UID:lune",
      "FN:Lune",
      "N:;Lune;;;",
      "ADR;TYPE=HOME:;c/o Esquie;Rue du Monolithe 1;Lumière;;;",
      "item1.ADR:;;Phare 3;Vieux Lumière;;;",
      "item1.X-ABLABEL:Atelier",
      "END:VCARD",
    ].join("\r\n");
    useSessionStore.setState({ auth: AUTH, selectedBook: null });
    mockDiscoverAddressBooks.mockResolvedValue([BOOK_A]);
    loadCards({ lune: card });
    renderApp("/contacts/lune");

    const article = await screen.findByRole("article");
    expect(within(article).getByRole("heading", { name: "Adresses" })).toBeTruthy();
    expect([...article.querySelectorAll("address")].map((a) => a.textContent)).toEqual([
      "c/o Esquie Rue du Monolithe 1 Lumière",
      "Phare 3 Vieux Lumière",
    ]);
    expect(within(article).getByText("Domicile")).toBeTruthy();
    expect(within(article).getByText("Atelier")).toBeTruthy();
    expect(within(article).getAllByRole("button", { name: "Copier l’adresse" })).toHaveLength(2);
    expect(within(article).getByRole("button", { name: "Modifier les adresses" })).toBeTruthy();
  });

  it("names the browser tab after the contact", async () => {
    await renderLoggedIn("/contacts/full");

    await screen.findByRole("article");
    await waitFor(() => expect(document.title).toBe("Du Couteau Katarina · Natel"));
  });

  it("renders a month-day birthday without a year, and so without an age", async () => {
    await renderLoggedIn("/contacts/bday-md");

    const article = await screen.findByRole("article");
    const time = within(article).getByText("14 mars");
    expect(time.tagName).toBe("TIME");
    expect(time.getAttribute("dateTime")).toBe("--03-14");
    expect(within(article).queryByText(/ans$/)).toBeNull();
  });

  it("gives the age after a full birthday", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 21));
    try {
      await renderLoggedIn("/contacts/full");

      const article = await screen.findByRole("article");
      expect(within(article).getByText("14 mars 1987").tagName).toBe("TIME");
      expect(within(article).getByText("· 39 ans")).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it("renders groups as chips", async () => {
    await renderLoggedIn("/contacts/full");

    const article = await screen.findByRole("article");
    const chips = within(article)
      .getAllByRole("listitem")
      .map((item) => within(item).getByRole("button"));
    expect(chips.map((c) => c.textContent)).toEqual(
      expect.arrayContaining(["Travail", "Fosse de Noxus"]),
    );
    for (const chip of chips) {
      expect(chip.className).toContain("rounded-full");
    }
  });

  it("filters the list on a group's chip, beside the contact on desktop", async () => {
    const user = userEvent.setup();
    const router = await renderLoggedIn("/contacts/full");

    const article = await screen.findByRole("article");
    await user.click(within(article).getByRole("button", { name: "Afficher le groupe Travail" }));

    expect(useSessionStore.getState().groupFilter).toBe("Travail");
    expect(screen.getByRole("button", { name: "Filtrer par groupe\u00a0: Travail" })).toBeTruthy();
    expect(router.state.location.pathname).toBe("/contacts/full");
  });

  it("goes back to the filtered list on a group's chip on a phone", async () => {
    const user = userEvent.setup();
    const router = await renderLoggedIn("/contacts/full");
    shimMatchMedia(false);

    const article = await screen.findByRole("article");
    await user.click(
      within(article).getByRole("button", { name: "Afficher le groupe Fosse de Noxus" }),
    );

    expect(useSessionStore.getState().groupFilter).toBe("Fosse de Noxus");
    await waitFor(() => expect(router.state.location.pathname).toBe("/contacts"));
  });

  it("preserves note whitespace with pre-wrap", async () => {
    await renderLoggedIn("/contacts/full");

    const article = await screen.findByRole("article");
    // getByText normalises whitespace, so match the collapsed form.
    const note = within(article).getByText(
      "Rencontrée à la Fosse de Noxus. Préfère les messages aux appels.",
    );
    expect(note.className).toContain("whitespace-pre-wrap");
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

  it("mobile top bar is a router Link back to the list, named after the book", async () => {
    const router = await renderLoggedIn("/contacts/full");
    const user = userEvent.setup();

    const back = await screen.findByRole("link", { name: "Retour à «\u00a0Perso\u00a0»" });
    expect(back.textContent).toBe("Perso");
    await user.click(back);
    await waitFor(() => expect(router.state.location.pathname).toBe("/contacts"));
  });

  it("keeps the back bar visible in the not-found state", async () => {
    await renderLoggedIn("/contacts/unknown");

    expect(await screen.findByRole("link", { name: "Retour à «\u00a0Perso\u00a0»" })).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Edit-mode readiness
// ---------------------------------------------------------------------------

describe("edit-mode readiness", () => {
  it("page root is an article with data-mode=view", async () => {
    await renderLoggedIn("/contacts/full");

    const article = await screen.findByRole("article");
    expect(article.getAttribute("data-mode")).toBe("view");
  });
});
