/**
 * Component tests for the contact EDIT mode.
 *
 * Renders the real router with the real vCard parse (only the dav layer is
 * mocked), in ?edit mode. Tests are kept simple and isolated to avoid
 * inter-test interference with TanStack Router memory history.
 */

import { QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ContactPage } from "@/components/contact-page";
import { DavError } from "@/dav";
import type { DavAddressBook, DavAuth } from "@/dav/types";
import { I18nProvider } from "@/i18n/react";
import { createQueryClient } from "@/queries";
import { routeTree } from "@/routeTree.gen";
import { usePreferences } from "@/store/preferences";
import { useSessionStore } from "@/store/session";
import { parse } from "@/vcard";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const {
  mockDiscoverAddressBooks,
  mockListContacts,
  mockFetchCards,
  mockFetchCard,
  mockUpdateCard,
  mockDeleteCard,
} = vi.hoisted(() => ({
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
  mockFetchCard:
    vi.fn<
      (auth: DavAuth, href: string) => Promise<{ href: string; etag: string; vcardText: string }>
    >(),
  mockUpdateCard:
    vi.fn<
      (
        auth: DavAuth,
        href: string,
        etag: string,
        vcardText: string,
      ) => Promise<{ href: string; etag: string }>
    >(),
  mockDeleteCard: vi.fn<(auth: DavAuth, href: string, etag: string) => Promise<void>>(),
}));

vi.mock("@/dav", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/dav")>();
  return {
    ...actual,
    discoverAddressBooks: mockDiscoverAddressBooks,
    listContacts: mockListContacts,
    fetchCards: mockFetchCards,
    fetchCard: mockFetchCard,
    updateCard: mockUpdateCard,
    deleteCard: mockDeleteCard,
  };
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const AUTH: DavAuth = {
  username: "alice",
  password: "secret",
};

const BOOK_A: DavAddressBook = {
  href: "https://dav.example.org/dav/books/a/",
  displayName: "Perso",
};

const CARD_EDITABLE = [
  "BEGIN:VCARD",
  "VERSION:3.0",
  "UID:editable",
  "FN:John Doe",
  "N:Doe;John;;;",
  "TEL;TYPE=CELL:+1-555-111-1111",
  "TEL;TYPE=WORK:+1-555-222-2222",
  "EMAIL;TYPE=WORK:john@work.example",
  "EMAIL;TYPE=HOME:john@home.example",
  "ADR;TYPE=HOME:;;123 Main St;Springfield;;12345;US",
  "BDAY:1987-03-14",
  "END:VCARD",
].join("\r\n");

const CARD_MINIMAL = [
  "BEGIN:VCARD",
  "VERSION:3.0",
  "UID:minimal",
  "FN:Minimal",
  "N:Min;Minimal;;;",
  "END:VCARD",
].join("\r\n");

const CARD_TEXT_BDAY = [
  "BEGIN:VCARD",
  "VERSION:3.0",
  "UID:textbday",
  "FN:Text Bday",
  "N:Bday;Text;;;",
  "BDAY;VALUE=text:circa 1987",
  "END:VCARD",
].join("\r\n");

const CARD_ORG = [
  "BEGIN:VCARD",
  "VERSION:3.0",
  "UID:org",
  "FN:Garage du Lac",
  "N:;;;;",
  "ORG:Garage du Lac",
  "EMAIL;TYPE=INTERNET:info@garage.example",
  "X-SOCIALPROFILE;TYPE=mastodon:https://social.example/@garage",
  "END:VCARD",
].join("\r\n");

const CARDS: Record<string, string> = {
  editable: CARD_EDITABLE,
  minimal: CARD_MINIMAL,
  textbday: CARD_TEXT_BDAY,
  org: CARD_ORG,
};

// ---------------------------------------------------------------------------
// Setup helpers
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

function setupMocks() {
  mockDiscoverAddressBooks.mockResolvedValue([BOOK_A]);
  const entries = Object.entries(CARDS);
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
      vcardText: CARDS[href.split("/").at(-1)?.replace(".vcf", "") ?? ""] ?? "",
    })),
  );
  mockFetchCard.mockImplementation(async (_auth, href) => {
    const vcardText = CARDS[href.split("/").at(-1)?.replace(".vcf", "") ?? ""] ?? "";
    return { href, etag: '"e"', vcardText };
  });
  mockUpdateCard.mockResolvedValue({ href: "editable", etag: '"new-etag"' });
  mockDeleteCard.mockResolvedValue(undefined);
}

beforeEach(async () => {
  cleanup();
  // Give async React cleanup time to settle
  await new Promise((r) => setTimeout(r, 50));
  setLanguage("fr-FR");
  shimMatchMedia();
  localStorage.clear();
  usePreferences.setState({ sortBy: "family", theme: null });
  useSessionStore.setState({ auth: null, selectedBook: null });
  vi.resetAllMocks();
  setupMocks();
});

async function renderEditView(id: string) {
  const path = `/contacts/${id}?edit=true`;
  useSessionStore.setState({ auth: AUTH, selectedBook: null });
  window.history.replaceState({}, "", path);
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  const queryClient = createQueryClient();
  render(
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <RouterProvider router={router} />
      </I18nProvider>
    </QueryClientProvider>,
  );
  const article = await screen.findByRole("article", {}, { timeout: 5000 });
  return { router, article, queryClient };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("edit mode — enter/leave", () => {
  it("renders edit UI when ?edit is in the URL", async () => {
    const { article } = await renderEditView("editable");
    expect(article.getAttribute("data-mode")).toBe("edit");
    expect(screen.getByRole("button", { name: "Enregistrer" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Annuler" })).toBeTruthy();
  });

  it("renders view mode when ?edit is absent", async () => {
    useSessionStore.setState({ auth: AUTH, selectedBook: null });
    window.history.replaceState({}, "", "/contacts/editable");
    const router = createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: ["/contacts/editable"] }),
    });
    render(
      <QueryClientProvider client={createQueryClient()}>
        <I18nProvider>
          <RouterProvider router={router} />
        </I18nProvider>
      </QueryClientProvider>,
    );
    const article = await screen.findByRole("article");
    expect(article.getAttribute("data-mode")).toBe("view");
  });
});

describe("edit mode — add/remove fields", () => {
  it("shows add phone button and adds a row under the others, focused", async () => {
    const { article } = await renderEditView("editable");
    const addBtn = within(article).getByText("Ajouter un téléphone");
    const user = userEvent.setup();
    await user.click(addBtn);
    const telInputs = article.querySelectorAll('input[type="tel"]');
    expect(telInputs.length).toBe(3);
    await waitFor(() => expect(document.activeElement).toBe(telInputs[2]));
  });

  it("shows add email button and adds a row", async () => {
    const { article } = await renderEditView("editable");
    const addBtn = within(article).getByText("Ajouter un e\u2060-\u2060mail");
    const user = userEvent.setup();
    await user.click(addBtn);
    const emailInputs = article.querySelectorAll('input[type="email"]');
    expect(emailInputs.length).toBe(3);
  });

  it("removes a tel row", async () => {
    const { article } = await renderEditView("editable");
    const user = userEvent.setup();
    const removeButtons = within(article).getAllByRole("button", { name: "Supprimer le numéro" });
    await user.click(removeButtons[0]!);
    const telInputs = article.querySelectorAll('input[type="tel"]');
    expect(telInputs.length).toBe(1);
  });

  it("shows add address button when no address", async () => {
    const { article } = await renderEditView("minimal");
    expect(within(article).getByText("Ajouter une adresse")).toBeTruthy();
  });

  it("shows add birthday button when no birthday", async () => {
    const { article } = await renderEditView("minimal");
    expect(within(article).getByText("Ajouter un anniversaire")).toBeTruthy();
  });
});

describe("edit mode — address type", () => {
  it("shows the address's own type in the select", async () => {
    const { article } = await renderEditView("editable");
    const section = article.querySelector("#sec-adr");
    const select = section?.querySelector("select");
    expect(select?.value).toBe("home");
  });
});

describe("edit mode — validation", () => {
  it("rejects invalid email on save", async () => {
    await renderEditView("editable");
    const user = userEvent.setup();

    const emailInputs = await screen.findAllByDisplayValue("john@work.example");
    const firstEmail = emailInputs[0];
    if (!firstEmail) return;
    await user.clear(firstEmail);
    await user.type(firstEmail, "not-an-email");
    await user.tab();

    const saveBtn = screen.getByRole("button", { name: "Enregistrer" });
    await user.click(saveBtn);

    expect(await screen.findByText("Adresse e\u2060-\u2060mail invalide")).toBeTruthy();
    expect(mockUpdateCard).not.toHaveBeenCalled();
  });
});

describe("edit mode — name fields", () => {
  it("come in the order the list sorts by", async () => {
    usePreferences.setState({ sortBy: "given" });
    const { article } = await renderEditView("editable");
    const labels = within(article)
      .getAllByText(/^(Nom|Prénom)$/)
      .map((label) => label.textContent);
    expect(labels).toEqual(["Prénom", "Nom"]);
  });
});

describe("edit mode — field types", () => {
  it("shows Autre for an e-mail typed only INTERNET, and offers no Mobile for e-mails", async () => {
    await renderEditView("org");
    const select = screen.getByRole("combobox", { name: "Type d’adresse e\u2060-\u2060mail" });
    expect((select as HTMLSelectElement).value).toBe("");
    const options = within(select)
      .getAllByRole("option")
      .map((option) => option.textContent);
    expect(options).toEqual(["Domicile", "Travail", "Autre"]);
  });

  it("offers Mobile for phone numbers", async () => {
    await renderEditView("editable");
    const [select] = screen.getAllByRole("combobox", { name: "Type de numéro" });
    const options = within(select as HTMLElement)
      .getAllByRole("option")
      .map((option) => option.textContent);
    expect(options).toEqual(["Mobile", "Travail", "Domicile", "Autre"]);
  });
});

describe("edit mode — names", () => {
  it("saves a card that has only an organisation", async () => {
    await renderEditView("org");
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Fonction"), "Réparations");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() => expect(mockUpdateCard).toHaveBeenCalledTimes(1));
    const vcardText = mockUpdateCard.mock.calls[0]?.[3] ?? "";
    expect(vcardText).toContain("FN:Garage du Lac");
    expect(vcardText).toContain("ORG:Garage du Lac");
    expect(screen.queryByText("Indiquez un nom, un prénom ou une organisation.")).toBeNull();
  });

  it("asks for a name, a first name or an organisation when all three are empty", async () => {
    await renderEditView("minimal");
    const user = userEvent.setup();
    await user.clear(screen.getByLabelText("Nom"));
    await user.clear(screen.getByLabelText("Prénom"));
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    expect(await screen.findByText("Indiquez un nom, un prénom ou une organisation.")).toBeTruthy();
    expect(mockUpdateCard).not.toHaveBeenCalled();
  });
});

describe("edit mode — fields to fix on save", () => {
  it("counts them in the bar and moves the focus to the first one", async () => {
    await renderEditView("editable");
    const user = userEvent.setup();
    const [email] = await screen.findAllByDisplayValue("john@work.example");
    if (!email) throw new Error("no e-mail field");
    await user.clear(email);
    await user.type(email, "not-an-email");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    expect(await screen.findByText("1 champ à corriger")).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(email));
    expect(mockUpdateCard).not.toHaveBeenCalled();
  });
});

describe("edit mode — optional sections", () => {
  it("opens the website field from its pill and focuses it", async () => {
    const { article } = await renderEditView("minimal");
    expect(within(article).queryByLabelText("Site web")).toBeNull();
    const user = userEvent.setup();
    await user.click(within(article).getByRole("button", { name: "Ajouter un site web" }));

    const url = within(article).getByLabelText("Site web");
    await waitFor(() => expect(document.activeElement).toBe(url));
    expect(within(article).queryByRole("button", { name: "Ajouter un site web" })).toBeNull();
  });

  it("opens the note from its pill and focuses it", async () => {
    const { article } = await renderEditView("minimal");
    const user = userEvent.setup();
    await user.click(within(article).getByRole("button", { name: "Ajouter une note" }));

    const note = within(article).getByLabelText("Note");
    await waitFor(() => expect(document.activeElement).toBe(note));
  });
});

describe("edit mode — optional sections after a save", () => {
  it("shows a note saved earlier when the form opens again", async () => {
    const { article } = await renderEditView("minimal");
    const user = userEvent.setup();
    await user.click(within(article).getByRole("button", { name: "Ajouter une note" }));
    await user.type(within(article).getByLabelText("Note"), "Rappeler lundi");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));
    await waitFor(() => expect(article.getAttribute("data-mode")).toBe("view"));

    await user.keyboard("e");
    await waitFor(() => expect(article.getAttribute("data-mode")).toBe("edit"));
    expect((within(article).getByLabelText("Note") as HTMLTextAreaElement).value).toBe(
      "Rappeler lundi",
    );
    expect(within(article).queryByRole("button", { name: "Ajouter une note" })).toBeNull();
  });
});

describe("edit mode — information not shown", () => {
  it("lists the card's other properties in a dialog, as they are written", async () => {
    const { article } = await renderEditView("org");
    const user = userEvent.setup();
    await user.click(
      within(article).getByRole("button", { name: "1 autre information non affichée" }),
    );

    const dialog = await screen.findByRole("dialog", { name: "Informations non affichées" });
    expect(dialog.textContent).toContain(
      "X-SOCIALPROFILE;TYPE=mastodon:https://social.example/@garage",
    );
  });
});

describe("edit mode — birthday input", () => {
  it("keeps a non-numeric year as typed instead of clearing it", async () => {
    await renderEditView("editable");
    const user = userEvent.setup();

    const year = screen.getByDisplayValue("1987");
    await user.clear(year);
    await user.type(year, "19x");

    expect((year as HTMLInputElement).value).toBe("19x");
  });

  it("flags an invalid year on blur like day and month", async () => {
    await renderEditView("editable");
    const user = userEvent.setup();

    const year = screen.getByDisplayValue("1987");
    await user.clear(year);
    await user.type(year, "19x");
    await user.tab();

    expect(year.getAttribute("aria-invalid")).toBe("true");
    const message = await screen.findByText("Année invalide");
    expect(year.getAttribute("aria-describedby")).toBe(message.id);
  });

  it("translates the date placeholders", async () => {
    setLanguage("en-US");
    await renderEditView("editable");
    expect(screen.getByPlaceholderText("DD")).toBeTruthy();
    expect(screen.getByPlaceholderText("MM")).toBeTruthy();
    expect(screen.getByPlaceholderText("YYYY")).toBeTruthy();
  });
});

describe("edit mode — dirty dialog", () => {
  it("shows discard dialog on cancel when dirty", async () => {
    await renderEditView("editable");
    const user = userEvent.setup();

    // Modify a field
    await user.type(screen.getByDisplayValue("John"), "x");

    const cancelBtn = screen.getByRole("button", { name: "Annuler" });
    await user.click(cancelBtn);

    expect(await screen.findByRole("heading", { name: /Abandonner/ })).toBeTruthy();
  });

  it("exits edit immediately on cancel when clean (no dialog)", async () => {
    // When the draft has no changes, cancel should exit edit mode without
    // showing the discard dialog — the beforeunload guard is gated on dirtiness.
    const { article } = await renderEditView("editable");
    const user = userEvent.setup();

    // Make NO changes — draft is clean
    const cancelBtn = screen.getByRole("button", { name: "Annuler" });
    await user.click(cancelBtn);

    // No discard dialog should appear; article should switch to view mode
    await waitFor(() => expect(article.getAttribute("data-mode")).toBe("view"));
  });

  it("drops the edit param from the URL when leaving edit mode", async () => {
    const { router, article } = await renderEditView("editable");
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Annuler" }));

    await waitFor(() => expect(article.getAttribute("data-mode")).toBe("view"));
    expect(router.state.location.href).toBe("/contacts/editable");
  });
});

describe("edit mode — discard dialog keyboard", () => {
  async function openDiscard() {
    await renderEditView("editable");
    const user = userEvent.setup();
    await user.type(screen.getByDisplayValue("John"), "x");
    await user.click(screen.getByRole("button", { name: "Annuler" }));
    await screen.findByRole("dialog");
    return user;
  }

  it("focuses Continuer l’édition first and keeps Tab inside the dialog", async () => {
    const user = await openDiscard();
    const keep = screen.getByRole("button", { name: /continuer/i });
    const abandon = screen.getByRole("button", { name: /^abandonner$/i });
    expect(document.activeElement).toBe(keep);

    await user.tab();
    expect(document.activeElement).toBe(abandon);
    await user.tab();
    expect(document.activeElement).toBe(keep);
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(abandon);
  });

  it("closes on Esc and stays in edit mode with the draft kept", async () => {
    const user = await openDiscard();
    await user.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByRole("article").getAttribute("data-mode")).toBe("edit");
    expect(screen.getByDisplayValue("Johnx")).toBeTruthy();
  });
});

describe("edit mode — beforeunload guard (review item 4)", () => {
  it("does not crash with beforeunload enabled while dirty", async () => {
    // With enableBeforeUnload now at its default (true), the component
    // registers a beforeunload listener while dirty. jsdom doesn't fire it,
    // but the registration must not throw and the blocker must still work.
    const { article } = await renderEditView("editable");

    const user = userEvent.setup();
    await user.type(screen.getByDisplayValue("John"), "x");

    // Article is still in edit mode — no crash from the listener registration
    expect(article.getAttribute("data-mode")).toBe("edit");

    // The blocker should still block navigation (cancel shows discard dialog)
    const cancelBtn = screen.getByRole("button", { name: "Annuler" });
    await user.click(cancelBtn);
    expect(await screen.findByRole("heading", { name: /Abandonner/ })).toBeTruthy();
  });
});

describe("edit mode — ignoreBlocker on intentional exit (review item 4)", () => {
  it("Abandonner closes the dialog and exits edit once (no second dialog)", async () => {
    const { article } = await renderEditView("editable");
    const user = userEvent.setup();

    // Make the draft dirty
    await user.type(screen.getByDisplayValue("John"), "x");

    // Click Cancel to open the discard dialog
    const cancelBtn = screen.getByRole("button", { name: "Annuler" });
    await user.click(cancelBtn);
    expect(await screen.findByRole("heading", { name: /Abandonner/ })).toBeTruthy();

    // Click Abandonner — navigates with ignoreBlocker: true
    const abandonBtn = screen.getByRole("button", { name: /abandonner/i });
    await user.click(abandonBtn);

    // The dialog should close and the article should switch to view mode
    await waitFor(() => {
      expect(article.getAttribute("data-mode")).toBe("view");
    });
    // No second dialog should appear
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Recharger exits edit with no discard prompt", async () => {
    mockUpdateCard.mockRejectedValueOnce(new DavError("Conflict", "CONFLICT"));
    const { article } = await renderEditView("editable");
    const user = userEvent.setup();

    // Make the draft dirty and save to trigger conflict
    await user.type(screen.getByDisplayValue("John"), "x");
    const saveBtn = screen.getByRole("button", { name: "Enregistrer" });
    await user.click(saveBtn);

    // Conflict banner should appear
    await waitFor(() => expect(screen.getByText(/modifié ailleurs/)).toBeTruthy());

    // Click Recharger — runs exitEdit which navigates with ignoreBlocker: true
    const reloadBtn = screen.getByRole("button", { name: /recharger/i });
    await user.click(reloadBtn);

    // Should exit edit mode without showing any discard dialog
    await waitFor(() => {
      expect(article.getAttribute("data-mode")).toBe("view");
    });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("edit mode — save error", () => {
  it("shows network error in the bottom bar", async () => {
    mockUpdateCard.mockRejectedValueOnce(new DavError("Network error", "NETWORK"));
    await renderEditView("editable");
    const user = userEvent.setup();

    await user.type(screen.getByDisplayValue("John"), "x");
    const saveBtn = screen.getByRole("button", { name: "Enregistrer" });
    await user.click(saveBtn);

    await waitFor(() => expect(screen.getByText(/Erreur réseau/)).toBeTruthy());
  });

  it("says the server refused a card for its size, and how large it was", async () => {
    mockUpdateCard.mockRejectedValueOnce(
      new DavError("Too large", "TOO_LARGE", undefined, 7_000_000),
    );
    const { article } = await renderEditView("editable");
    const user = userEvent.setup();

    await user.type(screen.getByDisplayValue("John"), "x");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() =>
      expect(screen.getByText(/refusé ce contact pour sa taille \(6,7\s?Mo\)/)).toBeTruthy(),
    );
    expect(article.getAttribute("data-mode")).toBe("edit");
  });

  it("hedges about the size when the connection dropped on a large card", async () => {
    mockUpdateCard.mockRejectedValueOnce(
      new DavError("Lost", "MAYBE_TOO_LARGE", undefined, 1_900_000),
    );
    const { article } = await renderEditView("editable");
    const user = userEvent.setup();

    await user.type(screen.getByDisplayValue("John"), "x");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() =>
      expect(screen.getByText(/connexion a coupé.*\(1,9\s?Mo\).*peut-être refusé/)).toBeTruthy(),
    );
    expect(screen.queryByText(/refusé ce contact pour sa taille/)).toBeNull();
    expect(article.getAttribute("data-mode")).toBe("edit");
  });
});

describe("edit mode — conflict", () => {
  it("shows conflict banner on 412", async () => {
    mockUpdateCard.mockRejectedValueOnce(new DavError("Conflict", "CONFLICT"));
    await renderEditView("editable");
    const user = userEvent.setup();

    await user.type(screen.getByDisplayValue("John"), "x");
    const saveBtn = screen.getByRole("button", { name: "Enregistrer" });
    await user.click(saveBtn);

    await waitFor(() => expect(screen.getByText(/modifié ailleurs/)).toBeTruthy());
  });

  it("shows conflict banner again on Écraser if the PUT gets a second 412", async () => {
    // First save → CONFLICT, then overwrite PUT → CONFLICT again
    mockUpdateCard.mockRejectedValue(new DavError("Conflict", "CONFLICT"));
    await renderEditView("editable");
    const user = userEvent.setup();

    // Make a change and save
    await user.type(screen.getByDisplayValue("John"), "x");
    const saveBtn = screen.getByRole("button", { name: "Enregistrer" });
    await user.click(saveBtn);

    // Conflict banner must appear
    await waitFor(() => expect(screen.getByText(/modifié ailleurs/)).toBeTruthy());

    // Click "Écraser" — the overwrite flow refetches and PUTs, which also fails
    const ecraserBtn = screen.getByRole("button", { name: /écraser/i });
    await user.click(ecraserBtn);

    // The conflict banner must still be visible (not replaced by "Erreur inattendue")
    await waitFor(() => expect(screen.getByText(/modifié ailleurs/)).toBeTruthy());
  });
});

describe("edit mode — save success", () => {
  it("returns to view mode with the saved toast, no error", async () => {
    const { article } = await renderEditView("editable");
    const user = userEvent.setup();

    await user.type(screen.getByDisplayValue("John"), "x");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() => expect(article.getAttribute("data-mode")).toBe("view"));
    expect(screen.getByRole("status").textContent).toBe("Enregistré");
    expect(screen.queryByText(/inattendue/)).toBeNull();
  });
});

describe("edit mode — background refetch", () => {
  // The list query refetches in the background (window focus after its
  // staleTime). The draft was built from the version loaded before: writes
  // must still carry that version's ETag, so the server answers 412 instead
  // of taking the draft over the other client's change.
  async function refetchWithServerChange(queryClient: ReturnType<typeof createQueryClient>) {
    mockFetchCards.mockImplementation(async (_auth, hrefs) =>
      hrefs.map((href) => {
        const uid = href.split("/").at(-1)?.replace(".vcf", "") ?? "";
        const text = CARDS[uid] ?? "";
        return {
          href,
          etag: '"e2"',
          vcardText:
            uid === "editable"
              ? text
                  .replace("+1-555-222-2222", "+1-555-999-9999")
                  .replace("END:VCARD", "X-OTHER-CLIENT:added\r\nEND:VCARD")
              : text,
        };
      }),
    );
    await act(async () => {
      await queryClient.refetchQueries();
    });
  }

  it("saves with the ETag the edit started from", async () => {
    const { queryClient } = await renderEditView("editable");
    const user = userEvent.setup();

    await refetchWithServerChange(queryClient);
    await user.type(screen.getByDisplayValue("John"), "x");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() => expect(mockUpdateCard).toHaveBeenCalled());
    const [, , etag, text] = mockUpdateCard.mock.calls[0] ?? [];
    expect(etag).toBe('"e"');
    // The draft is applied to the version it was built from, not to the
    // refetched one: nothing of the other client's version is taken over.
    expect(text).not.toContain("X-OTHER-CLIENT");
  });

  it("takes the latest version as base when edit mode starts again", async () => {
    const { article } = await renderEditView("editable");
    const user = userEvent.setup();

    await user.type(screen.getByDisplayValue("John"), "x");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));
    await waitFor(() => expect(article.getAttribute("data-mode")).toBe("view"));

    const [editButton] = screen.getAllByRole("button", { name: /^Modifier/ });
    if (editButton) await user.click(editButton);
    await waitFor(() => expect(article.getAttribute("data-mode")).toBe("edit"));
    await user.type(screen.getByDisplayValue("Johnx"), "y");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() => expect(mockUpdateCard).toHaveBeenCalledTimes(2));
    expect(mockUpdateCard.mock.calls[1]?.[2]).toBe('"new-etag"');
  });

  it("deletes with the ETag the edit started from", async () => {
    const { queryClient } = await renderEditView("editable");
    const user = userEvent.setup();

    await refetchWithServerChange(queryClient);
    await user.click(screen.getByRole("button", { name: "Supprimer le contact" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Supprimer" }));

    await waitFor(() => expect(mockDeleteCard).toHaveBeenCalled());
    expect(mockDeleteCard.mock.calls[0]?.[2]).toBe('"e"');
  });
});

describe("edit mode — delete", () => {
  const EDITABLE_HREF = "https://dav.example.org/dav/books/a/editable.vcf";

  it("asks for confirmation and sends a conditional DELETE", async () => {
    const { router } = await renderEditView("editable");
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Supprimer le contact" }));
    const dialog = screen.getByRole("dialog", { name: "Supprimer John Doe\u00a0?" });
    expect(mockDeleteCard).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "Supprimer" }));

    await waitFor(() => expect(mockDeleteCard).toHaveBeenCalledWith(AUTH, EDITABLE_HREF, '"e"'));
    await waitFor(() => expect(router.state.location.pathname).toBe("/contacts"));
    expect(screen.getByRole("status").textContent).toBe("Contact supprimé");
  });

  it("does nothing when the confirmation is cancelled", async () => {
    const { article } = await renderEditView("editable");
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Supprimer le contact" }));
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Annuler" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(mockDeleteCard).not.toHaveBeenCalled();
    expect(article.getAttribute("data-mode")).toBe("edit");
  });

  it("closes the confirmation on Esc and stays in edit mode", async () => {
    const { article } = await renderEditView("editable");
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Supprimer le contact" }));
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(article.getAttribute("data-mode")).toBe("edit");
  });

  it("shows the conflict with only a reload on 412, and stays on the contact", async () => {
    mockDeleteCard.mockRejectedValueOnce(new DavError("Conflict", "CONFLICT"));
    const { router } = await renderEditView("editable");
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Supprimer le contact" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Supprimer" }));

    await waitFor(() => expect(screen.getByText(/modifié ailleurs/)).toBeTruthy());
    expect(screen.getByRole("button", { name: "Recharger" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /écraser/i })).toBeNull();
    expect(router.state.location.pathname).toBe("/contacts/editable");
  });

  it("deletes with the loaded ETag even after edits, without the discard dialog", async () => {
    const { router } = await renderEditView("editable");
    const user = userEvent.setup();

    await user.type(screen.getByDisplayValue("John"), "x");
    await user.click(screen.getByRole("button", { name: "Supprimer le contact" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Supprimer" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/contacts"));
    expect(mockDeleteCard).toHaveBeenCalledWith(AUTH, EDITABLE_HREF, '"e"');
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("keeps Annuler and Esc from leaving edit mode while the DELETE is in flight", async () => {
    let finish: () => void = () => {};
    mockDeleteCard.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const { router } = await renderEditView("editable");
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Supprimer le contact" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Supprimer" }));
    await waitFor(() => expect(mockDeleteCard).toHaveBeenCalled());

    expect(screen.getByRole("button", { name: "Annuler" })).toHaveProperty("disabled", true);
    await user.keyboard("{Escape}");
    expect(router.state.location.pathname).toBe("/contacts/editable");

    await act(async () => finish());
    await waitFor(() => expect(router.state.location.pathname).toBe("/contacts"));
    expect(screen.getByRole("status").textContent).toBe("Contact supprimé");
  });

  it("clears the delete conflict when saving instead, so only one banner shows", async () => {
    mockDeleteCard.mockRejectedValueOnce(new DavError("Conflict", "CONFLICT"));
    mockUpdateCard.mockRejectedValueOnce(new DavError("Conflict", "CONFLICT"));
    await renderEditView("editable");
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Supprimer le contact" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Supprimer" }));
    await waitFor(() => expect(screen.getByText(/modifié ailleurs/)).toBeTruthy());

    await user.type(screen.getByDisplayValue("John"), "x");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() => expect(screen.getByRole("button", { name: /écraser/i })).toBeTruthy());
    expect(screen.getAllByText(/modifié ailleurs/)).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Recharger" })).toHaveLength(1);
  });

  it("leaves edit mode on Recharger after a delete conflict", async () => {
    mockDeleteCard.mockRejectedValueOnce(new DavError("Conflict", "CONFLICT"));
    const { article } = await renderEditView("editable");
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Supprimer le contact" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Supprimer" }));
    await user.click(await screen.findByRole("button", { name: "Recharger" }));

    await waitFor(() => expect(article.getAttribute("data-mode")).toBe("view"));
  });

  it("shows a network error in the bottom bar", async () => {
    mockDeleteCard.mockRejectedValueOnce(new DavError("Network error", "NETWORK"));
    await renderEditView("editable");
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Supprimer le contact" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Supprimer" }));

    await waitFor(() =>
      expect(screen.getByText("Erreur réseau : rien n’a été supprimé.")).toBeTruthy(),
    );
  });
});

describe("free-text birthday (VALUE=text on vCard 3.0)", () => {
  it("shows the contact and its birthday text in view mode", async () => {
    useSessionStore.setState({ auth: AUTH, selectedBook: null });
    const router = createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: ["/contacts/textbday"] }),
    });
    render(
      <QueryClientProvider client={createQueryClient()}>
        <I18nProvider>
          <RouterProvider router={router} />
        </I18nProvider>
      </QueryClientProvider>,
    );
    const article = await screen.findByRole("article", {}, { timeout: 5000 });
    expect(within(article).getByText("circa 1987")).toBeTruthy();
  });

  it("Écraser refetches and PUTs the card with the birthday intact", async () => {
    mockUpdateCard
      .mockRejectedValueOnce(new DavError("Conflict", "CONFLICT"))
      .mockResolvedValueOnce({ href: "textbday", etag: '"new-etag"' });
    await renderEditView("textbday");
    const user = userEvent.setup();

    await user.type(screen.getByDisplayValue("Text"), "x");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));
    await waitFor(() => expect(screen.getByText(/modifié ailleurs/)).toBeTruthy());

    await user.click(screen.getByRole("button", { name: /écraser/i }));

    await waitFor(() => expect(mockUpdateCard).toHaveBeenCalledTimes(2));
    expect(mockFetchCard).toHaveBeenCalled();
    const [, , etag, vcardText] = mockUpdateCard.mock.calls[1] ?? [];
    expect(etag).toBe('"e"');
    expect(vcardText).toContain("BDAY;VALUE=TEXT:circa 1987");
    expect(screen.queryByText(/inattendue/)).toBeNull();
  });
});

describe("contact page without a session", () => {
  it("renders nothing when auth is missing", () => {
    useSessionStore.setState({ auth: null });
    const { container } = render(
      <I18nProvider>
        <ContactPage
          contacts={[parse(CARD_MINIMAL, "minimal.vcf", '"e"')]}
          groupCards={[]}
          id="minimal"
        />
      </I18nProvider>,
    );
    expect(container.innerHTML).toBe("");
  });
});

describe("toast timing", () => {
  it("gives a repeated toast its own full display time", async () => {
    useSessionStore.setState({ auth: AUTH, selectedBook: null });
    const router = createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: ["/contacts/editable"] }),
    });
    render(
      <QueryClientProvider client={createQueryClient()}>
        <I18nProvider>
          <RouterProvider router={router} />
        </I18nProvider>
      </QueryClientProvider>,
    );
    const article = await screen.findByRole("article", {}, { timeout: 5000 });
    const user = userEvent.setup();
    const copy = within(article).getAllByRole("button", { name: "Copier le numéro" })[0];
    if (!copy) throw new Error("no copy button");

    const advance = (ms: number) =>
      act(async () => {
        vi.advanceTimersByTime(ms);
      });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      await user.click(copy);
      await screen.findByText("Copié");
      await advance(2000);
      await user.click(copy);
      await advance(1000);
      // 3 s after the first toast, but only 1 s after the second one.
      expect(screen.queryByText("Copié")).not.toBeNull();
      await advance(2000);
      expect(screen.queryByText("Copié")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("edit mode — cancel during an in-flight save", () => {
  it("drops a conflict that settles after leaving edit mode", async () => {
    let rejectPut: (err: unknown) => void = () => {};
    mockUpdateCard.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectPut = reject;
        }),
    );
    const { router, article } = await renderEditView("editable");
    const user = userEvent.setup();

    await user.type(screen.getByDisplayValue("John"), "x");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));
    await user.click(screen.getByRole("button", { name: "Annuler" }));
    await user.click(await screen.findByRole("button", { name: /^abandonner$/i }));
    await waitFor(() => expect(article.getAttribute("data-mode")).toBe("view"));

    await act(async () => {
      rejectPut(new DavError("Conflict", "CONFLICT"));
    });
    await act(async () => {
      await router.navigate({
        to: "/contacts/$id",
        params: { id: "editable" },
        search: { edit: true },
      });
    });

    await waitFor(() => expect(article.getAttribute("data-mode")).toBe("edit"));
    expect(screen.queryByText(/modifié ailleurs/)).toBeNull();
    expect(screen.getByRole("button", { name: "Enregistrer" })).toHaveProperty("disabled", false);
  });
});

describe("view mode — E shortcut", () => {
  // Lets a navigation the key may have triggered land before asserting.
  const settle = () => act(() => new Promise((r) => setTimeout(r, 100)));

  async function renderView() {
    useSessionStore.setState({ auth: AUTH, selectedBook: null });
    const router = createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: ["/contacts/editable"] }),
    });
    render(
      <QueryClientProvider client={createQueryClient()}>
        <I18nProvider>
          <RouterProvider router={router} />
        </I18nProvider>
      </QueryClientProvider>,
    );
    return screen.findByRole("article", {}, { timeout: 5000 });
  }

  it("opens the form on a section from its pencil, focused on its first value", async () => {
    const article = await renderView();
    const user = userEvent.setup();
    await user.click(within(article).getByRole("button", { name: "Modifier les téléphones" }));

    await waitFor(() => expect(article.getAttribute("data-mode")).toBe("edit"));
    await waitFor(() =>
      expect(document.activeElement).toBe(within(article).getByDisplayValue("+1-555-111-1111")),
    );
  });

  it("offers a Modifier pill in the mobile top bar, even on a name-only card", async () => {
    useSessionStore.setState({ auth: AUTH, selectedBook: null });
    const router = createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: ["/contacts/minimal"] }),
    });
    render(
      <QueryClientProvider client={createQueryClient()}>
        <I18nProvider>
          <RouterProvider router={router} />
        </I18nProvider>
      </QueryClientProvider>,
    );
    const article = await screen.findByRole("article", {}, { timeout: 5000 });

    await userEvent.setup().click(within(article).getByRole("button", { name: "Modifier" }));

    await waitFor(() => expect(article.getAttribute("data-mode")).toBe("edit"));
    expect(within(article).getAllByText("Modification").length).toBeGreaterThan(0);
  });

  it("enters edit mode on a plain E", async () => {
    const article = await renderView();
    await userEvent.setup().keyboard("e");
    await waitFor(() => expect(article.getAttribute("data-mode")).toBe("edit"));
  });

  it.each(["{Control>}e{/Control}", "{Meta>}e{/Meta}", "{Alt>}e{/Alt}"])(
    "ignores %s",
    async (keys) => {
      const article = await renderView();
      await userEvent.setup().keyboard(keys);
      await settle();
      expect(article.getAttribute("data-mode")).toBe("view");
    },
  );

  it("ignores auto-repeat", async () => {
    const article = await renderView();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "e", repeat: true }));
    await settle();
    expect(article.getAttribute("data-mode")).toBe("view");
  });
});

describe("switching contacts", () => {
  it("shows the new contact's values when moving between contacts in edit mode", async () => {
    const { router } = await renderEditView("editable");
    expect(screen.getByDisplayValue("John")).toBeTruthy();

    await act(async () => {
      await router.navigate({
        to: "/contacts/$id",
        params: { id: "minimal" },
        search: { edit: true },
      });
    });

    await waitFor(() => expect(screen.getByDisplayValue("Minimal")).toBeTruthy());
    expect(screen.queryByDisplayValue("John")).toBeNull();
  });
});

describe("edit mode — Écraser keeps changes made elsewhere", () => {
  it("PUTs the server's fresh card with only the user's changed fields applied", async () => {
    mockUpdateCard
      .mockRejectedValueOnce(new DavError("Conflict", "CONFLICT"))
      .mockResolvedValueOnce({ href: "editable", etag: '"new-etag"' });
    mockFetchCard.mockImplementation(async (_auth, href) => ({
      href,
      etag: '"fresh"',
      vcardText: CARD_EDITABLE.replace("+1-555-222-2222", "+1-555-999-9999"),
    }));
    await renderEditView("editable");
    const user = userEvent.setup();

    await user.type(screen.getByDisplayValue("John"), "ny");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));
    await waitFor(() => expect(screen.getByText(/modifié ailleurs/)).toBeTruthy());
    await user.click(screen.getByRole("button", { name: /écraser/i }));

    await waitFor(() => expect(mockUpdateCard).toHaveBeenCalledTimes(2));
    const [, , etag, vcardText] = mockUpdateCard.mock.calls[1] ?? [];
    expect(etag).toBe('"fresh"');
    expect(vcardText).toContain("N:Doe;Johnny;;;");
    expect(vcardText).toContain("TEL;TYPE=WORK:+1-555-999-9999");
    expect(vcardText).not.toContain("+1-555-222-2222");
  });
});

describe("edit mode — leaving for the settings, where signing out is, with unsaved changes", () => {
  it("asks first, and keeping the edit keeps the session", async () => {
    const { router } = await renderEditView("editable");
    const user = userEvent.setup();
    await user.type(screen.getByDisplayValue("John"), "x");

    await user.click(screen.getByRole("link", { name: "Paramètres" }));
    expect(await screen.findByRole("heading", { name: /Abandonner/ })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Continuer l’édition" }));
    expect(useSessionStore.getState().auth).toEqual(AUTH);
    expect(router.state.location.pathname).toBe("/contacts/editable");
    expect(screen.getByDisplayValue("Johnx")).toBeTruthy();
  });

  it("signs out once the changes are discarded", async () => {
    const { router, queryClient } = await renderEditView("editable");
    const user = userEvent.setup();
    await user.type(screen.getByDisplayValue("John"), "x");

    await user.click(screen.getByRole("link", { name: "Paramètres" }));
    await user.click(await screen.findByRole("button", { name: "Abandonner" }));
    await user.click(await screen.findByRole("button", { name: "Se déconnecter" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
    expect(useSessionStore.getState().auth).toBeNull();
    await waitFor(() => expect(queryClient.getQueryCache().getAll()).toHaveLength(0));
  });
});
