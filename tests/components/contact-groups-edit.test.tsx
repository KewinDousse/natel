/**
 * Component tests for group editing paths the e2e servers can't reach: a
 * contact without UID (Radicale refuses such cards) and a group card write
 * failing mid-save. Real router and vCard code; only src/dav is mocked.
 */

import { QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DavError } from "@/dav";
import type { DavAddressBook, DavAuth } from "@/dav/types";
import { I18nProvider } from "@/i18n/react";
import { contactIdOf } from "@/lib/contact-list";
import { createQueryClient } from "@/queries";
import { routeTree } from "@/routeTree.gen";
import { useGroupFormats } from "@/store/group-formats";
import { useSessionStore } from "@/store/session";
import { parse } from "@/vcard";
import bytes from "../vcard/photo-bytes.json";

const mocks = vi.hoisted(() => ({
  discoverAddressBooks: vi.fn(),
  listContacts: vi.fn(),
  fetchCards: vi.fn(),
  fetchCard: vi.fn(),
  updateCard: vi.fn(),
  createCard: vi.fn(),
  deleteCard: vi.fn(),
}));

vi.mock("@/dav", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/dav")>()),
  ...mocks,
}));

const AUTH: DavAuth = { username: "alice" };
const BOOK: DavAddressBook = { href: "https://dav.example.org/books/a/", displayName: "Perso" };

const card = (lines: string[]) =>
  ["BEGIN:VCARD", "VERSION:3.0", ...lines, "END:VCARD", ""].join("\r\n");

let cards: Record<string, string>;
let client: ReturnType<typeof createQueryClient>;

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
  useGroupFormats.setState({ formats: {} });
  vi.resetAllMocks();
  cards = {};
  mocks.discoverAddressBooks.mockResolvedValue([BOOK]);
  mocks.listContacts.mockImplementation(async () =>
    Object.keys(cards).map((href) => ({ href, etag: '"e"' })),
  );
  mocks.fetchCards.mockImplementation(async (_a: DavAuth, hrefs: string[]) =>
    hrefs.map((href) => ({ href, etag: '"e"', vcardText: cards[href] ?? "" })),
  );
  mocks.fetchCard.mockImplementation(async (_a: DavAuth, href: string) => ({
    href,
    etag: '"fresh"',
    vcardText: cards[href] ?? "",
  }));
  mocks.updateCard.mockImplementation(
    async (_a: DavAuth, href: string, _etag: string, vcardText: string) => ({
      href,
      etag: '"new"',
      vcardText,
    }),
  );
  mocks.createCard.mockImplementation(async (_a: DavAuth, href: string, vcardText: string) => ({
    href,
    etag: '"created"',
    vcardText,
  }));
});

async function renderEdit(href: string) {
  const id = contactIdOf(parse(cards[href] ?? "", href, '"e"'));
  const path = `/contacts/a/${id}?edit=true`;
  useSessionStore.setState({ auth: AUTH, selectedBook: BOOK });
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  client = createQueryClient();
  render(
    <QueryClientProvider client={client}>
      <I18nProvider>
        <RouterProvider router={router} />
      </I18nProvider>
    </QueryClientProvider>,
  );
  await screen.findByRole("button", { name: "Enregistrer" });
  return router;
}

const groupInput = () => screen.getByRole("combobox", { name: "Ajouter un groupe" });
const findQuestion = () => screen.findByRole("dialog", { name: /Comment stocker les groupes/ });

async function addGroup(name: string) {
  const user = userEvent.setup();
  await user.type(groupInput(), `${name}{Enter}`);
  return user;
}

const FORMATS = { cards: /^Fiches de groupe/, categories: /^Catégories sur chaque contact/ };

/** Answer the group format question (ADR 052, rule 4). */
async function chooseFormat(user: UserEvent, format: keyof typeof FORMATS) {
  const dialog = await findQuestion();
  await user.click(within(dialog).getByRole("radio", { name: FORMATS[format] }));
  await user.click(within(dialog).getByRole("button", { name: "Utiliser ce format" }));
}

function photoInput() {
  const input = document.querySelector<HTMLInputElement>('input[type="file"][accept="image/*"]');
  if (!input) throw new Error("no photo input");
  return input;
}

const GRACE = `${BOOK.href}grace.vcf`;

describe("a contact without UID", () => {
  beforeEach(() => {
    cards[GRACE] = card(["FN:Grace Hopper", "N:Hopper;Grace;;;"]);
  });

  it("gets a UID for its first group, and the page follows it", async () => {
    const router = await renderEdit(GRACE);
    const user = await addGroup("Club");
    await chooseFormat(user, "cards");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    await screen.findByText("Enregistré");
    const written = mocks.updateCard.mock.calls[0]?.[3] as string;
    const uid = /UID:([^\r\n]+)/.exec(written)?.[1] ?? "";
    expect(uid).not.toBe("");
    expect(mocks.createCard.mock.calls[0]?.[2]).toContain(
      `X-ADDRESSBOOKSERVER-MEMBER:urn:uuid:${uid}`,
    );
    await waitFor(() => expect(router.state.location.pathname).toBe(`/contacts/a/${uid}`));
    expect(screen.queryByText(/introuvable/i)).toBeNull();
  });

  it("keeps a failed group pending across the new id, and creates it once on retry", async () => {
    mocks.createCard.mockRejectedValueOnce(new DavError("offline", "NETWORK"));
    const router = await renderEdit(GRACE);
    const user = await addGroup("Club");
    await chooseFormat(user, "cards");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    await screen.findByText(/ces groupes n’ont pas été mis à jour/);
    expect(screen.getByText(/^Club · erreur réseau/)).toBeTruthy();
    const uid = /UID:([^\r\n]+)/.exec(mocks.updateCard.mock.calls[0]?.[3] as string)?.[1];
    await waitFor(() => expect(router.state.location.pathname).toBe(`/contacts/a/${uid}`));
    expect(screen.getByRole("button", { name: "Enregistrer" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Enregistrer" }));
    await screen.findByText("Enregistré");
    const [first, second] = mocks.createCard.mock.calls;
    expect(second?.[1]).toBe(first?.[1]);
    expect(mocks.updateCard).toHaveBeenCalledTimes(1);
  });
});

describe("Écraser on a group card", () => {
  const ADA = `${BOOK.href}ada.vcf`;
  const FAMILY = `${BOOK.href}family.vcf`;

  beforeEach(() => {
    cards[ADA] = card(["UID:ada", "FN:Ada Lovelace", "N:Lovelace;Ada;;;"]);
    cards[FAMILY] = card(["UID:family", "FN:Famille", "X-ADDRESSBOOKSERVER-KIND:group"]);
  });

  it("keeps the edits made since the failure", async () => {
    mocks.updateCard.mockRejectedValueOnce(new DavError("412", "CONFLICT"));
    await renderEdit(ADA);
    const user = await addGroup("Famille");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));
    await screen.findByText(/ces groupes n’ont pas été mis à jour/);

    await user.type(groupInput(), "Club{Enter}");
    await user.click(screen.getByRole("button", { name: "Écraser avec ma version" }));

    await waitFor(() => expect(screen.queryByText(/ces groupes n’ont pas été/)).toBeNull());
    expect(mocks.updateCard).toHaveBeenLastCalledWith(
      AUTH,
      FAMILY,
      '"fresh"',
      expect.stringContaining("urn:uuid:ada"),
    );
    // Club is still to save: the page stays in edit mode.
    expect(screen.getByRole("button", { name: "Enregistrer" })).toBeTruthy();
    expect(screen.queryByText("Enregistré")).toBeNull();
  });
});

describe("group failures and conflicts", () => {
  const ADA = `${BOOK.href}ada.vcf`;
  const FAMILY = `${BOOK.href}family.vcf`;

  beforeEach(() => {
    cards[ADA] = card(["UID:ada", "FN:Ada Lovelace", "N:Lovelace;Ada;;;", "CATEGORIES:Travail"]);
    cards[FAMILY] = card(["UID:family", "FN:Famille", "X-ADDRESSBOOKSERVER-KIND:group"]);
  });

  it("drops a failed group the user took back, on Écraser", async () => {
    mocks.updateCard.mockRejectedValueOnce(new DavError("412", "CONFLICT"));
    await renderEdit(ADA);
    const user = await addGroup("Famille");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));
    await screen.findByText(/ces groupes n’ont pas été mis à jour/);

    await user.click(screen.getByRole("button", { name: /Retirer de «\s?Famille\s?»/ }));
    await user.click(screen.getByRole("button", { name: "Écraser avec ma version" }));
    await screen.findByText("Enregistré");
    expect(mocks.fetchCard).not.toHaveBeenCalled();
    expect(mocks.updateCard).toHaveBeenCalledTimes(1);
  });

  it("drops the pending group changes on Recharger", async () => {
    mocks.updateCard.mockRejectedValueOnce(new DavError("412", "CONFLICT"));
    await renderEdit(ADA);
    const user = await addGroup("Famille");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));
    await screen.findByText(/ces groupes n’ont pas été mis à jour/);

    await user.click(screen.getByRole("button", { name: "Recharger" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Enregistrer" })).toBeNull());
    expect(mocks.updateCard).toHaveBeenCalledTimes(1);
  });

  it("carries a CATEGORIES removal onto the fresh card when overwriting the contact", async () => {
    mocks.updateCard.mockRejectedValueOnce(new DavError("412", "CONFLICT"));
    await renderEdit(ADA);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Retirer de «\s?Travail\s?»/ }));
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));
    await screen.findByRole("button", { name: "Écraser avec ma version" });

    cards[ADA] = card([
      "UID:ada",
      "FN:Ada Lovelace",
      "N:Lovelace;Ada;;;",
      "CATEGORIES:Travail,Club",
      "NOTE:changed elsewhere",
    ]);
    await user.click(screen.getByRole("button", { name: "Écraser avec ma version" }));
    await screen.findByText("Enregistré");
    const text = mocks.updateCard.mock.calls[1]?.[3] as string;
    expect(text).toContain("NOTE:changed elsewhere");
    expect(text).toMatch(/CATEGORIES:Club\r?\n/);
  });
});

describe("a group stored only as CATEGORIES (ADR 052, rule 1)", () => {
  const ADA = `${BOOK.href}ada.vcf`;
  const BOB = `${BOOK.href}bob.vcf`;
  const FAMILY = `${BOOK.href}family.vcf`;

  beforeEach(() => {
    cards[ADA] = card(["UID:ada", "FN:Ada Lovelace", "N:Lovelace;Ada;;;", "CATEGORIES:Travail"]);
    cards[BOB] = card(["UID:bob", "FN:Bob", "N:;Bob;;;", "CATEGORIES:Club,Famille"]);
    cards[FAMILY] = card(["UID:family", "FN:Famille", "X-ADDRESSBOOKSERVER-KIND:group"]);
  });

  it("joins the contact's CATEGORIES in its conditional save, with no group card", async () => {
    await renderEdit(ADA);
    const user = await addGroup("Club");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    await screen.findByText("Enregistré");
    expect(mocks.updateCard).toHaveBeenCalledTimes(1);
    const [, href, etag, text] = mocks.updateCard.mock.calls[0] ?? [];
    expect([href, etag]).toEqual([ADA, '"e"']);
    expect(text).toMatch(/CATEGORIES:Travail,Club\r\n/);
    expect(mocks.createCard).not.toHaveBeenCalled();
  });

  it("gives no UID to a contact without one, and the page keeps its id", async () => {
    cards[GRACE] = card(["FN:Grace Hopper", "N:Hopper;Grace;;;"]);
    const router = await renderEdit(GRACE);
    const path = router.state.location.pathname;
    const user = await addGroup("Club");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    await screen.findByText("Enregistré");
    const text = mocks.updateCard.mock.calls[0]?.[3] as string;
    expect(text).toContain("CATEGORIES:Club\r\n");
    expect(text).not.toMatch(/^UID/m);
    expect(mocks.createCard).not.toHaveBeenCalled();
    expect(router.state.location.pathname).toBe(path);
  });

  it("writes CATEGORIES once when a new group's card fails, and retries only that card", async () => {
    cards[GRACE] = card(["FN:Grace Hopper", "N:Hopper;Grace;;;"]);
    mocks.createCard.mockRejectedValueOnce(new DavError("offline", "NETWORK"));
    const router = await renderEdit(GRACE);
    const user = await addGroup("Club");
    await addGroup("Lecture");
    await chooseFormat(user, "cards");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    await screen.findByText(/ces groupes n’ont pas été mis à jour/);
    expect(screen.getByText(/^Lecture · erreur réseau/)).toBeTruthy();
    expect(screen.queryByText(/^Club ·/)).toBeNull();
    const text = mocks.updateCard.mock.calls[0]?.[3] as string;
    expect(text).toContain("CATEGORIES:Club\r\n");
    const uid = /UID:([^\r\n]+)/.exec(text)?.[1];
    expect(uid).toBeTruthy();
    await waitFor(() => expect(router.state.location.pathname).toBe(`/contacts/a/${uid}`));

    await user.click(screen.getByRole("button", { name: "Enregistrer" }));
    await screen.findByText("Enregistré");
    expect(mocks.createCard).toHaveBeenCalledTimes(2);
    expect(mocks.createCard.mock.calls[1]?.[2]).toContain("FN:Lecture");
    expect(mocks.updateCard).toHaveBeenCalledTimes(1);
  });

  it("asks for a group stored in both formats, and writes the format chosen", async () => {
    await renderEdit(ADA);
    const user = await addGroup("Famille");
    await chooseFormat(user, "cards");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    await screen.findByText("Enregistré");
    expect(mocks.updateCard).toHaveBeenCalledTimes(1);
    expect(mocks.updateCard.mock.calls[0]?.[1]).toBe(FAMILY);
    expect(mocks.updateCard.mock.calls[0]?.[3]).toContain(
      "X-ADDRESSBOOKSERVER-MEMBER:urn:uuid:ada",
    );
  });

  it("carries the CATEGORIES value onto the fresh card when overwriting the contact", async () => {
    mocks.updateCard.mockRejectedValueOnce(new DavError("412", "CONFLICT"));
    await renderEdit(ADA);
    const user = await addGroup("Club");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));
    await screen.findByRole("button", { name: "Écraser avec ma version" });

    cards[ADA] = card([
      "UID:ada",
      "FN:Ada Lovelace",
      "N:Lovelace;Ada;;;",
      "CATEGORIES:Travail,Lecture",
      "NOTE:changed elsewhere",
    ]);
    await user.click(screen.getByRole("button", { name: "Écraser avec ma version" }));
    await screen.findByText("Enregistré");
    const text = mocks.updateCard.mock.calls[1]?.[3] as string;
    expect(text).toContain("NOTE:changed elsewhere");
    expect(text).toMatch(/CATEGORIES:Travail,Lecture,Club\r\n/);
    expect(mocks.createCard).not.toHaveBeenCalled();
  });
});

describe("Écraser on the contact, then a failed group", () => {
  const ADA = `${BOOK.href}ada.vcf`;

  it("keeps what the overwrite took from the server when the group is retried", async () => {
    cards[ADA] = card(["UID:ada", "FN:Ada Lovelace", "N:Lovelace;Ada;;;", "CATEGORIES:Travail"]);
    mocks.updateCard.mockRejectedValueOnce(new DavError("412", "CONFLICT"));
    mocks.createCard.mockRejectedValueOnce(new DavError("offline", "NETWORK"));
    await renderEdit(ADA);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Retirer de «\s?Travail\s?»/ }));
    await user.type(groupInput(), "Club{Enter}");
    await chooseFormat(user, "cards");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));
    await screen.findByRole("button", { name: "Écraser avec ma version" });

    cards[ADA] = card([
      "UID:ada",
      "FN:Ada Lovelace",
      "N:Lovelace;Ada;;;",
      "CATEGORIES:Travail",
      "NOTE:changed elsewhere",
    ]);
    await user.click(screen.getByRole("button", { name: "Écraser avec ma version" }));
    await screen.findByText(/ces groupes n’ont pas été mis à jour/);
    expect(mocks.updateCard.mock.calls[1]?.[3]).toContain("NOTE:changed elsewhere");

    await user.click(screen.getByRole("button", { name: "Enregistrer" }));
    await screen.findByText("Enregistré");
    expect(mocks.createCard).toHaveBeenCalledTimes(2);
    for (const call of mocks.updateCard.mock.calls.slice(1)) {
      expect(call[3]).toContain("NOTE:changed elsewhere");
    }
  });
});

describe("leaving the edit while group cards are written", () => {
  const ADA = `${BOOK.href}ada.vcf`;

  it("still caches the group card the server took", async () => {
    cards[ADA] = card(["UID:ada", "FN:Ada Lovelace", "N:Lovelace;Ada;;;"]);
    let land: () => void = () => {};
    mocks.createCard.mockImplementationOnce(
      (_a: DavAuth, href: string, vcardText: string) =>
        new Promise((resolve) => {
          land = () => resolve({ href, etag: '"created"', vcardText });
        }),
    );
    await renderEdit(ADA);
    const user = await addGroup("Club");
    await chooseFormat(user, "cards");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));
    await waitFor(() => expect(mocks.createCard).toHaveBeenCalled());

    await user.click(screen.getByRole("button", { name: "Annuler" }));
    await user.click(await screen.findByRole("button", { name: "Abandonner" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Enregistrer" })).toBeNull());
    expect(screen.queryByText("Club")).toBeNull();

    land();
    await screen.findByText("Club");
  });
});

describe("the save shortcut", () => {
  const ADA = `${BOOK.href}ada.vcf`;

  it("saves a group name still typed in the input, once its format is chosen", async () => {
    cards[ADA] = card(["UID:ada", "FN:Ada Lovelace", "N:Lovelace;Ada;;;"]);
    await renderEdit(ADA);
    const user = userEvent.setup();
    await user.type(groupInput(), "Club");
    await user.keyboard("{Control>}{Enter}{/Control}");
    await chooseFormat(user, "cards");

    await screen.findByText("Enregistré");
    expect(mocks.createCard).toHaveBeenCalledTimes(1);
    expect(mocks.createCard.mock.calls[0]?.[2]).toContain("FN:Club");
    expect(mocks.createCard.mock.calls[0]?.[2]).toContain(
      "X-ADDRESSBOOKSERVER-MEMBER:urn:uuid:ada",
    );
  });
});

describe("a photo change saved with a failed group", () => {
  const ADA = `${BOOK.href}ada.vcf`;

  it("doesn't write the card again when the group is retried", async () => {
    cards[ADA] = card([
      "UID:ada",
      "FN:Ada Lovelace",
      "N:Lovelace;Ada;;;",
      `PHOTO;ENCODING=b;TYPE=PNG:${bytes.png}`,
    ]);
    mocks.createCard.mockRejectedValueOnce(new DavError("offline", "NETWORK"));
    await renderEdit(ADA);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Retirer la photo" }));
    await user.type(groupInput(), "Club{Enter}");
    await chooseFormat(user, "cards");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    await screen.findByText(/ces groupes n’ont pas été mis à jour/);
    expect(mocks.updateCard).toHaveBeenCalledTimes(1);
    expect(mocks.updateCard.mock.calls[0]?.[3]).not.toContain("PHOTO");

    await user.click(screen.getByRole("button", { name: "Enregistrer" }));
    await screen.findByText("Enregistré");
    expect(mocks.createCard).toHaveBeenCalledTimes(2);
    expect(mocks.updateCard).toHaveBeenCalledTimes(1);
  });
});

describe("the group format question (ADR 052, rule 4)", () => {
  const ADA = `${BOOK.href}ada.vcf`;
  const BOB = `${BOOK.href}bob.vcf`;
  const FAMILY = `${BOOK.href}family.vcf`;
  const question = () => screen.queryByRole("dialog", { name: /Comment stocker les groupes/ });

  beforeEach(() => {
    cards[ADA] = card(["UID:ada", "FN:Ada Lovelace", "N:Lovelace;Ada;;;"]);
  });

  it("asks at once in a book with no group, with group cards preselected and no badge", async () => {
    await renderEdit(ADA);
    await addGroup("Club");

    const dialog = await screen.findByRole("dialog", {
      name: /^Comment stocker les groupes de «\s?Perso\s?»\s?\?$/,
    });
    expect(dialog.textContent).toMatch(/Natel va stocker «\s?Club\s?» sur le serveur/);
    expect(dialog.textContent).toContain("Ce carnet n’a encore aucun groupe.");
    const cardsRadio = within(dialog).getByRole("radio", { name: FORMATS.cards });
    expect(cardsRadio).toHaveProperty("checked", true);
    expect(document.activeElement).toBe(cardsRadio);
    expect(within(dialog).queryByText("Recommandé")).toBeNull();
  });

  it("recommends categories in a book that has only them, and writes the answer", async () => {
    cards[BOB] = card(["UID:bob", "FN:Bob", "N:;Bob;;;", "CATEGORIES:Travail"]);
    await renderEdit(ADA);
    const user = await addGroup("Club");

    const dialog = await findQuestion();
    const categories = within(dialog).getByRole("radio", { name: FORMATS.categories });
    expect(categories).toHaveProperty("checked", true);
    expect(categories.closest("label")?.textContent).toContain("Recommandé");
    await user.click(within(dialog).getByRole("button", { name: "Utiliser ce format" }));
    expect(question()).toBeNull();
    expect(document.activeElement).toBe(groupInput());
    expect(localStorage.getItem("natel.preferences")).toMatch(
      /"groupFormats":\{"\w+":"categories"\}/,
    );

    await user.click(screen.getByRole("button", { name: "Enregistrer" }));
    await screen.findByText("Enregistré");
    expect(mocks.updateCard.mock.calls[0]?.[3]).toContain("CATEGORIES:Club\r\n");
    expect(mocks.createCard).not.toHaveBeenCalled();
  });

  it("asks only once per book: the answer applies to the next new group", async () => {
    await renderEdit(ADA);
    const user = await addGroup("Club");
    await chooseFormat(user, "cards");
    await addGroup("Lecture");
    expect(question()).toBeNull();
    expect(screen.getByRole("button", { name: /Retirer de «\s?Lecture\s?»/ })).toBeTruthy();
  });

  it("doesn't ask in a fully read book with group cards and no CATEGORIES (rule 3)", async () => {
    cards[FAMILY] = card(["UID:family", "FN:Famille", "X-ADDRESSBOOKSERVER-KIND:group"]);
    await renderEdit(ADA);
    await addGroup("Club");
    expect(question()).toBeNull();
  });

  it("takes the chip back on Annuler and keeps the other changes, storing nothing", async () => {
    await renderEdit(ADA);
    const user = userEvent.setup();
    await user.type(screen.getByRole("textbox", { name: "Prénom" }), "x");
    await addGroup("Club");
    const dialog = await findQuestion();
    await user.click(within(dialog).getByRole("button", { name: "Annuler" }));

    expect(question()).toBeNull();
    expect(screen.queryByRole("button", { name: /Retirer de «\s?Club\s?»/ })).toBeNull();
    expect(screen.getByRole("textbox", { name: "Prénom" })).toHaveProperty("value", "Adax");
    expect(document.activeElement).toBe(groupInput());
    expect(localStorage.getItem("natel.preferences")).toBeNull();
  });

  it("closes on Esc without leaving the form", async () => {
    await renderEdit(ADA);
    const user = await addGroup("Club");
    await findQuestion();
    await user.keyboard("{Escape}");

    expect(question()).toBeNull();
    expect(screen.queryByRole("button", { name: /Retirer de «\s?Club\s?»/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Enregistrer" })).toBeTruthy();
  });

  it("holds a save that commits a typed group, and stops it on a dismissal", async () => {
    await renderEdit(ADA);
    const user = userEvent.setup();
    await user.type(groupInput(), "Club");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));
    const dialog = await findQuestion();
    expect(mocks.updateCard).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "Annuler" }));

    expect(question()).toBeNull();
    expect(screen.getByRole("button", { name: "Enregistrer" })).toBeTruthy();
    expect(mocks.updateCard).not.toHaveBeenCalled();
    expect(mocks.createCard).not.toHaveBeenCalled();
  });

  it("lets a held save go on once the format is chosen", async () => {
    await renderEdit(ADA);
    const user = userEvent.setup();
    await user.type(groupInput(), "Club");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));
    await chooseFormat(user, "cards");

    await screen.findByText("Enregistré");
    expect(mocks.createCard.mock.calls[0]?.[2]).toContain("FN:Club");
  });

  it("drops a typed group without asking when Esc opens the discard dialog", async () => {
    await renderEdit(ADA);
    const user = userEvent.setup();
    await user.type(screen.getByRole("textbox", { name: "Prénom" }), "x");
    await user.type(groupInput(), "Club");
    await user.keyboard("{Escape}");

    await screen.findByRole("dialog", { name: /Abandonner les modifications/ });
    expect(question()).toBeNull();
    await user.click(screen.getByRole("button", { name: "Continuer l’édition" }));
    expect(screen.queryByRole("button", { name: /Retirer de «\s?Club\s?»/ })).toBeNull();
    expect(question()).toBeNull();
  });

  it("asks again about the waiting group when editing goes on after a navigation", async () => {
    await renderEdit(ADA);
    const user = userEvent.setup();
    await user.type(screen.getByRole("textbox", { name: "Prénom" }), "x");
    await addGroup("Club");
    await findQuestion();
    await user.click(screen.getByRole("link", { name: "Paramètres" }));

    await screen.findByRole("dialog", { name: /Abandonner les modifications/ });
    expect(question()).toBeNull();
    await user.click(screen.getByRole("button", { name: "Continuer l’édition" }));
    expect(screen.getByRole("button", { name: /Retirer de «\s?Club\s?»/ })).toBeTruthy();
    await findQuestion();
  });

  it("closes the question when a refetch gives the group a format", async () => {
    await renderEdit(ADA);
    await addGroup("Club");
    await findQuestion();
    cards[FAMILY] = card(["UID:club", "FN:Club", "X-ADDRESSBOOKSERVER-KIND:group"]);
    await act(() => client.invalidateQueries());

    await waitFor(() => expect(question()).toBeNull());
    expect(screen.getByRole("button", { name: /Retirer de «\s?Club\s?»/ })).toBeTruthy();
    expect(useGroupFormats.getState().formats).toEqual({});
    expect(document.activeElement).toBe(groupInput());
  });

  it("waits for a dialog the press opened to close before asking", async () => {
    await renderEdit(ADA);
    const user = userEvent.setup();
    await user.type(groupInput(), "Club");
    await user.click(screen.getByRole("button", { name: "Supprimer le contact" }));

    await screen.findByRole("dialog", { name: /Supprimer Ada Lovelace/ });
    expect(question()).toBeNull();
    await user.keyboard("{Escape}");
    await findQuestion();
    expect(screen.queryByRole("dialog", { name: /Supprimer Ada Lovelace/ })).toBeNull();
  });

  it("waits for a confirmed delete to fail before asking", async () => {
    let fail: (error: Error) => void = () => {};
    mocks.deleteCard.mockReturnValueOnce(
      new Promise((_, reject) => {
        fail = reject;
      }),
    );
    await renderEdit(ADA);
    const user = userEvent.setup();
    await user.type(groupInput(), "Club");
    await user.click(screen.getByRole("button", { name: "Supprimer le contact" }));
    const confirm = await screen.findByRole("dialog", { name: /Supprimer Ada Lovelace/ });
    await user.click(within(confirm).getByRole("button", { name: "Supprimer" }));

    await waitFor(() => expect(mocks.deleteCard).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 50));
    expect(question()).toBeNull();
    act(() => fail(new DavError("offline", "NETWORK")));
    await findQuestion();
  });

  it("closes the information menu when the question takes the focus", async () => {
    await renderEdit(ADA);
    const user = userEvent.setup();
    await user.type(groupInput(), "Club");
    await user.click(screen.getByRole("button", { name: "Ajouter une information" }));

    await findQuestion();
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("waits for the photo's file picker to close before asking", async () => {
    await renderEdit(ADA);
    const user = userEvent.setup();
    await user.type(groupInput(), "Club");
    await user.click(screen.getByRole("button", { name: "Ajouter une photo" }));
    await new Promise((r) => setTimeout(r, 50));
    expect(question()).toBeNull();

    photoInput().dispatchEvent(new Event("cancel", { bubbles: true }));
    await findQuestion();
  });

  it("asks once the page is pressed again where the picker fires no cancel", async () => {
    await renderEdit(ADA);
    const user = userEvent.setup();
    await user.type(groupInput(), "Club");
    await user.click(screen.getByRole("button", { name: "Ajouter une photo" }));
    await new Promise((r) => setTimeout(r, 50));
    expect(question()).toBeNull();

    await user.click(screen.getByRole("textbox", { name: "Prénom" }));
    await findQuestion();
  });

  it("waits for the dialog of a chosen photo to close before asking", async () => {
    await renderEdit(ADA);
    const user = userEvent.setup();
    await user.type(groupInput(), "Club");
    await user.click(screen.getByRole("button", { name: "Ajouter une photo" }));
    await user.upload(
      photoInput(),
      new File([new Uint8Array([1])], "x.jpg", { type: "image/jpeg" }),
    );

    await screen.findByRole("dialog", { name: "Recadrer la photo" });
    expect(question()).toBeNull();
    await user.keyboard("{Escape}");
    await findQuestion();
  });

  it("asks right away after a file was chosen in another file input", async () => {
    await renderEdit(ADA);
    const user = userEvent.setup();
    const other = document.createElement("input");
    other.type = "file";
    document.body.append(other);
    await user.upload(other, new File(["BEGIN:VCARD"], "a.vcf", { type: "text/vcard" }));
    await addGroup("Club");

    await findQuestion();
    other.remove();
  });

  it("drops a typed group when a link leaves the form, with nothing to discard", async () => {
    const router = await renderEdit(ADA);
    const user = userEvent.setup();
    await user.type(groupInput(), "Club");
    await user.click(screen.getByRole("link", { name: "Paramètres" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/settings"));
    expect(question()).toBeNull();
    expect(screen.queryByRole("dialog", { name: /Abandonner les modifications/ })).toBeNull();
  });

  it("gives the focus back to Save once a held save goes on", async () => {
    mocks.createCard.mockRejectedValueOnce(new DavError("offline", "NETWORK"));
    await renderEdit(ADA);
    const user = userEvent.setup();
    await user.type(groupInput(), "Club");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));
    await chooseFormat(user, "cards");

    await screen.findByText(/ces groupes n’ont pas été mis à jour/);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Enregistrer" }));
  });

  it("keeps the focus off the group field when the press on Save took none", async () => {
    mocks.createCard.mockRejectedValueOnce(new DavError("offline", "NETWORK"));
    await renderEdit(ADA);
    const user = userEvent.setup();
    const field = groupInput();
    await user.type(field, "Club");
    // As on Safari: the press blurs the field and focuses nothing.
    const save = screen.getByRole("button", { name: "Enregistrer" });
    fireEvent.pointerDown(save);
    act(() => field.blur());
    fireEvent.click(save);
    await chooseFormat(user, "cards");

    await screen.findByText(/ces groupes n’ont pas été mis à jour/);
    expect(document.activeElement).not.toBe(groupInput());
  });

  it("lets a waiting save go on when a refetch gives the group a format", async () => {
    mocks.updateCard.mockRejectedValueOnce(new DavError("offline", "NETWORK"));
    await renderEdit(ADA);
    const user = userEvent.setup();
    await user.type(groupInput(), "Club");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));
    await findQuestion();
    cards[FAMILY] = card(["UID:club", "FN:Club", "X-ADDRESSBOOKSERVER-KIND:group"]);
    await act(() => client.invalidateQueries());

    await screen.findByText(/ces groupes n’ont pas été mis à jour/);
    expect(question()).toBeNull();
    expect(mocks.updateCard.mock.calls[0]?.[1]).toBe(FAMILY);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Enregistrer" }));
  });

  it("gives the focus back to the group field after ⌘/Ctrl + Enter waited for the answer", async () => {
    mocks.createCard.mockRejectedValueOnce(new DavError("offline", "NETWORK"));
    await renderEdit(ADA);
    const user = userEvent.setup();
    await user.type(groupInput(), "Club");
    await user.keyboard("{Control>}{Enter}{/Control}");
    await chooseFormat(user, "cards");

    await screen.findByText(/ces groupes n’ont pas été mis à jour/);
    expect(document.activeElement).toBe(groupInput());
  });

  it("drops a typed group without asking when the form is left with Annuler", async () => {
    await renderEdit(ADA);
    const user = userEvent.setup();
    await user.type(groupInput(), "Club");
    await user.click(screen.getByRole("button", { name: "Annuler" }));

    await waitFor(() => expect(screen.queryByRole("button", { name: "Enregistrer" })).toBeNull());
    expect(question()).toBeNull();
    expect(mocks.updateCard).not.toHaveBeenCalled();
  });
});
