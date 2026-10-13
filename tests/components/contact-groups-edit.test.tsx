/**
 * Component tests for group editing paths the e2e servers can't reach: a
 * contact without UID (Radicale refuses such cards) and a group card write
 * failing mid-save. Real router and vCard code; only src/dav is mocked.
 */

import { QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DavError } from "@/dav";
import type { DavAddressBook, DavAuth } from "@/dav/types";
import { I18nProvider } from "@/i18n/react";
import { contactIdOf } from "@/lib/contact-list";
import { createQueryClient } from "@/queries";
import { routeTree } from "@/routeTree.gen";
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
  mocks.updateCard.mockImplementation(async (_a: DavAuth, href: string) => ({
    href,
    etag: '"new"',
  }));
  mocks.createCard.mockImplementation(async (_a: DavAuth, href: string) => ({
    href,
    etag: '"created"',
  }));
});

async function renderEdit(href: string) {
  const id = contactIdOf(parse(cards[href] ?? "", href, '"e"'));
  const path = `/contacts/${id}?edit=true`;
  useSessionStore.setState({ auth: AUTH, selectedBook: BOOK });
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
  await screen.findByRole("button", { name: "Enregistrer" }, { timeout: 5000 });
  return router;
}

async function addGroup(name: string) {
  const user = userEvent.setup();
  await user.type(screen.getByRole("combobox", { name: "Ajouter un groupe" }), `${name}{Enter}`);
  return user;
}

const GRACE = `${BOOK.href}grace.vcf`;

describe("a contact without UID", () => {
  beforeEach(() => {
    cards[GRACE] = card(["FN:Grace Hopper", "N:Hopper;Grace;;;"]);
  });

  it("gets a UID for its first group, and the page follows it", async () => {
    const router = await renderEdit(GRACE);
    const user = await addGroup("Club");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    await screen.findByText("Enregistré");
    const written = mocks.updateCard.mock.calls[0]?.[3] as string;
    const uid = /UID:([^\r\n]+)/.exec(written)?.[1] ?? "";
    expect(uid).not.toBe("");
    expect(mocks.createCard.mock.calls[0]?.[2]).toContain(
      `X-ADDRESSBOOKSERVER-MEMBER:urn:uuid:${uid}`,
    );
    await waitFor(() => expect(router.state.location.pathname).toBe(`/contacts/${uid}`));
    expect(screen.queryByText(/introuvable/i)).toBeNull();
  });

  it("keeps a failed group pending across the new id, and creates it once on retry", async () => {
    mocks.createCard.mockRejectedValueOnce(new DavError("offline", "NETWORK"));
    const router = await renderEdit(GRACE);
    const user = await addGroup("Club");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    await screen.findByText(/ces groupes n’ont pas été mis à jour/);
    expect(screen.getByText(/^Club · erreur réseau/)).toBeTruthy();
    const uid = /UID:([^\r\n]+)/.exec(mocks.updateCard.mock.calls[0]?.[3] as string)?.[1];
    await waitFor(() => expect(router.state.location.pathname).toBe(`/contacts/${uid}`));
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

    await user.type(screen.getByRole("combobox", { name: "Ajouter un groupe" }), "Club{Enter}");
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

describe("Écraser on the contact, then a failed group", () => {
  const ADA = `${BOOK.href}ada.vcf`;

  it("keeps what the overwrite took from the server when the group is retried", async () => {
    cards[ADA] = card(["UID:ada", "FN:Ada Lovelace", "N:Lovelace;Ada;;;", "CATEGORIES:Travail"]);
    mocks.updateCard.mockRejectedValueOnce(new DavError("412", "CONFLICT"));
    mocks.createCard.mockRejectedValueOnce(new DavError("offline", "NETWORK"));
    await renderEdit(ADA);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Retirer de «\s?Travail\s?»/ }));
    await user.type(screen.getByRole("combobox", { name: "Ajouter un groupe" }), "Club{Enter}");
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
    let land: (value: { href: string; etag: string }) => void = () => {};
    mocks.createCard.mockImplementationOnce(
      (_a: DavAuth, href: string) =>
        new Promise((resolve) => {
          land = () => resolve({ href, etag: '"created"' });
        }),
    );
    await renderEdit(ADA);
    const user = await addGroup("Club");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));
    await waitFor(() => expect(mocks.createCard).toHaveBeenCalled());

    await user.click(screen.getByRole("button", { name: "Annuler" }));
    await user.click(await screen.findByRole("button", { name: "Abandonner" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Enregistrer" })).toBeNull());
    expect(screen.queryByText("Club")).toBeNull();

    land({ href: "", etag: "" });
    await screen.findByText("Club");
  });
});

describe("the save shortcut", () => {
  const ADA = `${BOOK.href}ada.vcf`;

  it("saves a group name still typed in the input", async () => {
    cards[ADA] = card(["UID:ada", "FN:Ada Lovelace", "N:Lovelace;Ada;;;"]);
    await renderEdit(ADA);
    const user = userEvent.setup();
    await user.type(screen.getByRole("combobox", { name: "Ajouter un groupe" }), "Club");
    await user.keyboard("{Control>}{Enter}{/Control}");

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
    await user.type(screen.getByRole("combobox", { name: "Ajouter un groupe" }), "Club{Enter}");
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
