/**
 * Tests for src/dav/ — CardDAV client.
 *
 * The internal.ts module (the tsdav adapter) is mocked. The seam is clean:
 * we test the orchestration in index.ts (error mapping, response shaping) with
 * controlled data from the mock. No real network I/O.
 *
 * Pure helper functions (extractEtag, mapDavError, etc.) are tested directly
 * in helpers.test.ts via the __testing export.
 */

import { describe, expect, it, vi } from "vitest";
import type { DavSession } from "@/dav/internal";

// Mock the internal module before importing the public API.
vi.mock("@/dav/internal", () => {
  const createSessionMock = vi.fn();
  return {
    createDavSession: createSessionMock,
    __esModule: true,
  };
});

// Import after mock — these are the functions under test.
import {
  createCard,
  DavError,
  deleteCard,
  discoverAddressBooks,
  fetchCard,
  listContacts,
  updateCard,
} from "@/dav/index";
import type { DavAuth } from "@/dav/types";

// Also grab the mock for setup.
const { createDavSession } = await import("@/dav/internal");

const mockAuth: DavAuth = {
  username: "alice",
};

function mockSession(overrides: Partial<DavSession> = {}): DavSession {
  const defaultSession: DavSession = {
    discoverAddressBooks: vi
      .fn()
      .mockResolvedValue([{ href: "/dav/books/default/", displayName: "Default Address Book" }]),
    listMembers: vi.fn().mockResolvedValue([
      { href: "/dav/books/default/1.vcf", etag: '"abc123"' },
      { href: "/dav/books/default/2.vcf", etag: '"def456"' },
    ]),
    fetchCard: vi.fn().mockResolvedValue({
      vcardText: "BEGIN:VCARD\nVERSION:3.0\nFN:Alice\nEND:VCARD\n",
      etag: '"abc123"',
    }),
    fetchCards: vi.fn().mockResolvedValue([
      {
        href: "/dav/books/default/1.vcf",
        vcardText: "BEGIN:VCARD\nVERSION:3.0\nFN:Alice\nEND:VCARD\n",
        etag: '"abc123"',
      },
    ]),
    updateCard: vi.fn().mockResolvedValue({
      href: "/dav/books/default/1.vcf",
      etag: '"new-etag"',
    }),
    createCard: vi.fn().mockResolvedValue({
      href: "/dav/books/default/new-uuid.vcf",
      etag: '"e"',
    }),
    deleteCard: vi.fn().mockResolvedValue(undefined),
  };
  return { ...defaultSession, ...overrides };
}

// ---------------------------------------------------------------------------
// discoverAddressBooks
// ---------------------------------------------------------------------------

describe("discoverAddressBooks", () => {
  it("returns mapped address books", async () => {
    (createDavSession as ReturnType<typeof vi.fn>).mockResolvedValue(mockSession());

    const books = await discoverAddressBooks(mockAuth);
    expect(books).toHaveLength(1);
    expect(books[0]).toEqual({
      href: "/dav/books/default/",
      displayName: "Default Address Book",
    });
  });

  it("throws on session creation failure", async () => {
    (createDavSession as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("connection refused"),
    );

    await expect(discoverAddressBooks(mockAuth)).rejects.toThrow(Error);
  });

  it("throws on session creation failure with any error type", async () => {
    (createDavSession as ReturnType<typeof vi.fn>).mockRejectedValue("string error");

    await expect(discoverAddressBooks(mockAuth)).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// listContacts
// ---------------------------------------------------------------------------

describe("listContacts", () => {
  it("returns contact summaries with href + etag", async () => {
    (createDavSession as ReturnType<typeof vi.fn>).mockResolvedValue(mockSession());

    const contacts = await listContacts(mockAuth, "/dav/books/default/");
    expect(contacts).toHaveLength(2);
    expect(contacts[0]).toEqual({
      href: "/dav/books/default/1.vcf",
      etag: '"abc123"',
    });
    expect(contacts[1]).toEqual({
      href: "/dav/books/default/2.vcf",
      etag: '"def456"',
    });
  });

  it("passes bookHref to the session", async () => {
    const listMembers = vi.fn().mockResolvedValue([]);
    (createDavSession as ReturnType<typeof vi.fn>).mockResolvedValue(mockSession({ listMembers }));

    await listContacts(mockAuth, "/dav/books/work/");
    expect(listMembers).toHaveBeenCalledWith("/dav/books/work/");
  });

  it("throws on session creation failure", async () => {
    (createDavSession as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("failure"));

    await expect(listContacts(mockAuth, "/dav/books/default/")).rejects.toThrow(Error);
  });
});

// ---------------------------------------------------------------------------
// fetchCard
// ---------------------------------------------------------------------------

describe("fetchCard", () => {
  it("returns contact detail with href, etag, and vcardText", async () => {
    (createDavSession as ReturnType<typeof vi.fn>).mockResolvedValue(mockSession());

    const card = await fetchCard(mockAuth, "/dav/books/default/1.vcf");
    expect(card).toEqual({
      href: "/dav/books/default/1.vcf",
      etag: '"abc123"',
      vcardText: "BEGIN:VCARD\nVERSION:3.0\nFN:Alice\nEND:VCARD\n",
    });
  });

  it("passes href to the session", async () => {
    const fetchCardMock = vi.fn().mockResolvedValue({
      vcardText: "BEGIN:VCARD\nVERSION:3.0\nFN:Bob\nEND:VCARD\n",
      etag: '"xyz789"',
    });
    (createDavSession as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockSession({ fetchCard: fetchCardMock }),
    );

    await fetchCard(mockAuth, "/dav/books/work/42.vcf");
    expect(fetchCardMock).toHaveBeenCalledWith("/dav/books/work/42.vcf");
  });

  it("sets href on the result to the requested href", async () => {
    (createDavSession as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockSession({ fetchCard: vi.fn().mockResolvedValue({ vcardText: "", etag: '"e"' }) }),
    );

    const card = await fetchCard(mockAuth, "/dav/books/x/1.vcf");
    expect(card.href).toBe("/dav/books/x/1.vcf");
  });

  it("throws on session creation failure", async () => {
    (createDavSession as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("failure"));

    await expect(fetchCard(mockAuth, "/dav/books/default/1.vcf")).rejects.toThrow(Error);
  });
});

// ---------------------------------------------------------------------------
// updateCard
// ---------------------------------------------------------------------------

describe("updateCard", () => {
  it("passes href, etag, and vcardText to the session", async () => {
    const updateCardMock = vi
      .fn()
      .mockResolvedValue({ href: "/dav/books/default/1.vcf", etag: '"new"' });
    (createDavSession as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockSession({ updateCard: updateCardMock }),
    );

    const result = await updateCard(
      mockAuth,
      "/dav/books/default/1.vcf",
      '"old"',
      "BEGIN:VCARD\nEND:VCARD",
    );

    expect(updateCardMock).toHaveBeenCalledWith(
      "/dav/books/default/1.vcf",
      '"old"',
      "BEGIN:VCARD\nEND:VCARD",
    );
    expect(result).toEqual({ href: "/dav/books/default/1.vcf", etag: '"new"' });
  });

  it("passes through DavError from the session", async () => {
    (createDavSession as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockSession({
        updateCard: vi.fn().mockRejectedValue(new DavError("conflict", "CONFLICT")),
      }),
    );

    await expect(
      updateCard(mockAuth, "/dav/books/default/1.vcf", '"old"', "vcard"),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

// ---------------------------------------------------------------------------
// createCard
// ---------------------------------------------------------------------------

describe("createCard", () => {
  it("passes the card href and vcardText to the session", async () => {
    const createCardMock = vi
      .fn()
      .mockResolvedValue({ href: "/dav/books/default/x.vcf", etag: '"e"' });
    (createDavSession as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockSession({ createCard: createCardMock }),
    );

    const result = await createCard(mockAuth, "/dav/books/default/x.vcf", "BEGIN:VCARD\nEND:VCARD");

    expect(createCardMock).toHaveBeenCalledWith(
      "/dav/books/default/x.vcf",
      "BEGIN:VCARD\nEND:VCARD",
    );
    expect(result).toEqual({ href: "/dav/books/default/x.vcf", etag: '"e"' });
  });

  it("passes through DavError from the session", async () => {
    (createDavSession as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockSession({
        createCard: vi.fn().mockRejectedValue(new DavError("auth", "AUTH")),
      }),
    );

    await expect(createCard(mockAuth, "/dav/books/default/x.vcf", "vcard")).rejects.toMatchObject({
      code: "AUTH",
    });
  });
});

// ---------------------------------------------------------------------------
// deleteCard
// ---------------------------------------------------------------------------

describe("deleteCard", () => {
  it("passes href and etag to the session", async () => {
    const deleteCardMock = vi.fn().mockResolvedValue(undefined);
    (createDavSession as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockSession({ deleteCard: deleteCardMock }),
    );

    await deleteCard(mockAuth, "/dav/books/default/1.vcf", '"e"');

    expect(deleteCardMock).toHaveBeenCalledWith("/dav/books/default/1.vcf", '"e"');
  });

  it("passes through DavError from the session", async () => {
    (createDavSession as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockSession({
        deleteCard: vi.fn().mockRejectedValue(new DavError("conflict", "CONFLICT")),
      }),
    );

    await expect(deleteCard(mockAuth, "/dav/books/default/1.vcf", '"e"')).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });
});

// ---------------------------------------------------------------------------
// DavError class
// ---------------------------------------------------------------------------

describe("DavError", () => {
  it("has name, code, message, and optional cause", () => {
    const cause = new Error("original");
    const err = new DavError("something went wrong", "NETWORK", cause);

    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("DavError");
    expect(err.code).toBe("NETWORK");
    expect(err.message).toContain("something went wrong");
    expect(err.cause).toBe(cause);
  });

  it("defaults cause to undefined", () => {
    const err = new DavError("oops", "UNEXPECTED");
    expect(err.cause).toBeUndefined();
  });
});
