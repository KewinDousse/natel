/**
 * Tests for src/dav/ — CardDAV client.
 *
 * The internal.ts module (the tsdav adapter) is mocked. The seam is clean:
 * we test the orchestration in index.ts (error mapping, response shaping) with
 * controlled data from the mock. No real network I/O.
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
import { DavError, discoverAddressBooks, fetchCard, listContacts } from "@/dav/index";
import type { DavAuth } from "@/dav/types";

// Also grab the mock for setup.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createDavSession } = await import("@/dav/internal");

const mockAuth: DavAuth = {
  serverUrl: "https://dav.example.com",
  username: "alice",
  password: "secret",
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

  it("throws DavError(AUTH) on auth failure from session creation", async () => {
    (createDavSession as ReturnType<typeof vi.fn>).mockRejectedValue(
      new DavError("CardDAV authentication failed: creating session", "AUTH"),
    );

    await expect(discoverAddressBooks(mockAuth)).rejects.toThrow(DavError);
    await expect(discoverAddressBooks(mockAuth)).rejects.toHaveProperty("code", "AUTH");
  });

  it("throws DavError(NETWORK) on network failure", async () => {
    (createDavSession as ReturnType<typeof vi.fn>).mockRejectedValue(
      new DavError("CardDAV network error: creating session", "NETWORK"),
    );

    await expect(discoverAddressBooks(mockAuth)).rejects.toHaveProperty("code", "NETWORK");
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

  it("throws DavError on session creation failure", async () => {
    (createDavSession as ReturnType<typeof vi.fn>).mockRejectedValue(
      new DavError("CardDAV authentication failed: creating session", "AUTH"),
    );

    await expect(listContacts(mockAuth, "/dav/books/default/")).rejects.toThrow(DavError);
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

  it("throws DavError on session creation failure", async () => {
    (createDavSession as ReturnType<typeof vi.fn>).mockRejectedValue(
      new DavError("CardDAV authentication failed: creating session", "AUTH"),
    );

    await expect(fetchCard(mockAuth, "/dav/books/default/1.vcf")).rejects.toThrow(DavError);
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
