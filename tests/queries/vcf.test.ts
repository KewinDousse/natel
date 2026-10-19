/**
 * Tests for the .vcf import and export orchestration (ADR 020), with src/dav
 * mocked and the real vCard helpers.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DavError } from "@/dav/types";
import { EmptyImportError, exportVcf, IncompleteExportError, importVcf } from "@/queries";

const { mockCreateCard, mockListContacts, mockFetchCards } = vi.hoisted(() => ({
  mockCreateCard: vi.fn(),
  mockListContacts: vi.fn(),
  mockFetchCards: vi.fn(),
}));

vi.mock("@/dav", () => ({
  cardHref: (book: string, uid: string) => `${book}${uid}.vcf`,
  createCard: mockCreateCard,
  listContacts: mockListContacts,
  fetchCards: mockFetchCards,
}));

const AUTH = { username: "u" };
const BOOK = "/dav/u/contacts/";

function card(lines: string[]): string {
  return `${["BEGIN:VCARD", "VERSION:3.0", ...lines, "END:VCARD"].join("\r\n")}\r\n`;
}

function run(file: string, bookUids: string[] = []) {
  const created: string[] = [];
  const progress: [number, number][] = [];
  const done = importVcf(AUTH, BOOK, file, new Set(bookUids), {
    onProgress: (d, t) => progress.push([d, t]),
    onCreated: (uid) => created.push(uid),
  });
  return { done, created, progress };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCreateCard.mockImplementation(async (_auth, href: string, vcardText: string) => ({
    href,
    etag: '"1"',
    vcardText,
  }));
});

describe("importVcf", () => {
  it("creates each card from its original text at <uid>.vcf", async () => {
    const ada = card(["UID:ada", "FN:Ada", "X-KEEP:yes"]);
    const { done, created, progress } = run(ada);
    expect(await done).toEqual({ imported: 1, existing: 0, failed: [] });
    expect(mockCreateCard).toHaveBeenCalledWith(AUTH, `${BOOK}ada.vcf`, ada);
    expect(created).toEqual(["ada"]);
    expect(progress).toEqual([
      [0, 1],
      [1, 1],
    ]);
  });

  it("gives a card without UID a new one", async () => {
    const { done, created } = run(card(["FN:Bob"]));
    await done;
    const [, href, text] = mockCreateCard.mock.calls[0] ?? [];
    expect(created).toHaveLength(1);
    expect(href).toBe(`${BOOK}${created[0]}.vcf`);
    expect(text).toContain(`UID:${created[0]}\r\nEND:VCARD`);
  });

  it("skips a card the book already has, and counts it", async () => {
    const { done } = run(card(["UID:ada", "FN:Ada"]) + card(["UID:bob", "FN:Bob"]), ["ada"]);
    expect(await done).toEqual({ imported: 1, existing: 1, failed: [] });
    expect(mockCreateCard).toHaveBeenCalledTimes(1);
  });

  it("changes nothing when the same file is imported twice", async () => {
    const file = card(["UID:ada", "FN:Ada"]);
    const first = run(file);
    await first.done;
    const second = run(file, first.created);
    expect(await second.done).toEqual({ imported: 0, existing: 1, failed: [] });
  });

  it("keeps going after failures, and names each one", async () => {
    mockCreateCard.mockImplementation(async (_auth, href: string, vcardText: string) => {
      if (href.endsWith("c412.vcf")) throw new DavError("412", "CONFLICT");
      if (href.endsWith("cnet.vcf")) throw new DavError("net", "NETWORK");
      if (href.endsWith("c403.vcf")) throw new DavError("403", "UNEXPECTED");
      if (href.endsWith("c413.vcf")) throw new DavError("413", "TOO_LARGE");
      if (href.endsWith("cbig.vcf")) throw new DavError("lost", "MAYBE_TOO_LARGE");
      return { href, etag: '"1"', vcardText };
    });
    const file = ["BEGIN:VCARD\r\nFN:cut short\r\n"].join("");
    const { done } = run(
      card(["UID:c412", "FN:Taken"]) +
        card(["UID:cnet", "FN:Offline"]) +
        card(["UID:c403", "FN:Refused"]) +
        card(["UID:ok", "FN:Fine"]) +
        card(["UID:ok", "FN:Again"]) +
        file +
        card(["UID:c413", "FN:Heavy"]) +
        card(["UID:cbig", "FN:Dropped"]),
    );
    expect(await done).toEqual({
      imported: 1,
      existing: 0,
      failed: [
        { name: "Taken", position: 1, reason: "conflict" },
        { name: "Offline", position: 2, reason: "network" },
        { name: "Refused", position: 3, reason: "refused" },
        { name: "Again", position: 5, reason: "duplicate" },
        { name: "", position: 6, reason: "unreadable" },
        { name: "Heavy", position: 7, reason: "too_large" },
        { name: "Dropped", position: 8, reason: "maybe_too_large" },
      ],
    });
  });

  it("fails a card with a blank UID rather than give it a second one", async () => {
    const { done } = run(card(["UID: ", "FN:Blank"]));
    expect(await done).toEqual({
      imported: 0,
      existing: 0,
      failed: [{ name: "Blank", position: 1, reason: "unreadable" }],
    });
    expect(mockCreateCard).not.toHaveBeenCalled();
  });

  it("imports the cards after one cut short", async () => {
    const { done } = run(`BEGIN:VCARD\r\nFN:Cut\r\n${card(["UID:ada", "FN:Ada"])}`);
    expect(await done).toEqual({
      imported: 1,
      existing: 0,
      failed: [{ name: "", position: 1, reason: "unreadable" }],
    });
  });

  it("rejects a file with no card", async () => {
    await expect(run("hello").done).rejects.toBeInstanceOf(EmptyImportError);
  });
});

describe("exportVcf", () => {
  it("joins the cards as the server returned them", async () => {
    mockListContacts.mockResolvedValue([
      { href: "/a.vcf", etag: "1" },
      { href: "/b.vcf", etag: "2" },
    ]);
    mockFetchCards.mockResolvedValue([
      { href: "/a.vcf", etag: "1", vcardText: "BEGIN:VCARD\r\nX-ODD\r\nEND:VCARD\r\n" },
      { href: "/b.vcf", etag: "2", vcardText: "BEGIN:VCARD\nEND:VCARD" },
    ]);
    expect(await exportVcf(AUTH, BOOK)).toBe(
      "BEGIN:VCARD\r\nX-ODD\r\nEND:VCARD\r\nBEGIN:VCARD\nEND:VCARD\r\n",
    );
  });

  it("fails rather than leave out a card it couldn't fetch", async () => {
    mockListContacts.mockResolvedValue([
      { href: "/a.vcf", etag: "1" },
      { href: "/b.vcf", etag: "2" },
    ]);
    mockFetchCards.mockResolvedValue([{ href: "/a.vcf", etag: "1", vcardText: "x" }]);
    await expect(exportVcf(AUTH, BOOK)).rejects.toEqual(new IncompleteExportError(1));
  });
});
