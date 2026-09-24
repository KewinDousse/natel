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
  };
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const AUTH: DavAuth = {
  serverUrl: "https://dav.example.ch",
  username: "alice",
  password: "secret",
};

const BOOK_A: DavAddressBook = {
  href: "https://dav.example.ch/dav/books/a/",
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
  "EMAIL;TYPE=WORK:john@work.com",
  "EMAIL;TYPE=HOME:john@home.com",
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

const CARDS: Record<string, string> = {
  editable: CARD_EDITABLE,
  minimal: CARD_MINIMAL,
  textbday: CARD_TEXT_BDAY,
};

// ---------------------------------------------------------------------------
// Setup helpers
// ---------------------------------------------------------------------------

function setLanguage(lang: string) {
  Object.defineProperty(window.navigator, "language", {
    get: () => lang,
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
          href: `https://dav.example.ch/dav/books/a/${uid}.vcf`,
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
}

beforeEach(async () => {
  cleanup();
  // Give async React cleanup time to settle
  await new Promise((r) => setTimeout(r, 50));
  setLanguage("fr-FR");
  shimMatchMedia();
  localStorage.clear();
  useSessionStore.setState({ auth: null, selectedBook: null, serverUrl: "" });
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
  render(
    <QueryClientProvider client={createQueryClient()}>
      <I18nProvider>
        <RouterProvider router={router} />
      </I18nProvider>
    </QueryClientProvider>,
  );
  const article = await screen.findByRole("article", {}, { timeout: 5000 });
  return { router, article };
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
  it("shows add phone button and adds a row", async () => {
    const { article } = await renderEditView("editable");
    const addBtn = within(article).getByText("+ Ajouter un téléphone");
    const user = userEvent.setup();
    await user.click(addBtn);
    const telInputs = article.querySelectorAll('input[type="tel"]');
    expect(telInputs.length).toBe(3);
  });

  it("shows add email button and adds a row", async () => {
    const { article } = await renderEditView("editable");
    const addBtn = within(article).getByText("+ Ajouter un e-mail");
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
    expect(within(article).getByText("+ Ajouter une adresse")).toBeTruthy();
  });

  it("shows add birthday button when no birthday", async () => {
    const { article } = await renderEditView("minimal");
    expect(within(article).getByText("+ Ajouter un anniversaire")).toBeTruthy();
  });
});

describe("edit mode — validation", () => {
  it("rejects invalid email on save", async () => {
    await renderEditView("editable");
    const user = userEvent.setup();

    const emailInputs = await screen.findAllByDisplayValue("john@work.com");
    const firstEmail = emailInputs[0];
    if (!firstEmail) return;
    await user.clear(firstEmail);
    await user.type(firstEmail, "not-an-email");
    await user.tab();

    const saveBtn = screen.getByRole("button", { name: "Enregistrer" });
    await user.click(saveBtn);

    expect(await screen.findByText("Adresse e-mail invalide")).toBeTruthy();
    expect(mockUpdateCard).not.toHaveBeenCalled();
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
        <ContactPage contacts={[parse(CARD_MINIMAL, "minimal.vcf", '"e"')]} id="minimal" />
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
