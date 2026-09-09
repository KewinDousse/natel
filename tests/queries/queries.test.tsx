/**
 * Tests for src/queries/ — TanStack Query hooks that orchestrate dav + vcard.
 *
 * Mocks src/dav and src/vcard to isolate the orchestration logic.
 *
 * Notes for reviewers:
 * - `isSuccess` is true immediately when placeholderData is set (TanStack Query v5).
 *   We wait for `!isFetching` to confirm the fetch actually completed.
 * - Mutations have `retry: false` configured via the test QueryClient defaultOptions.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DavAddressBook, DavAuth } from "@/dav/types";
import type { Contact } from "@/model/contact";

// ---------------------------------------------------------------------------
// Hoisted mock factories
// ---------------------------------------------------------------------------

const {
  mockDiscoverAddressBooks,
  mockListContacts,
  mockFetchCard,
  mockCreateCard,
  mockUpdateCard,
  mockDeleteCard,
  mockParse,
  mockSerialise,
} = vi.hoisted(() => ({
  mockDiscoverAddressBooks: vi.fn<(auth: DavAuth) => Promise<DavAddressBook[]>>(),
  mockListContacts:
    vi.fn<(auth: DavAuth, bookHref: string) => Promise<{ href: string; etag: string }[]>>(),
  mockFetchCard:
    vi.fn<
      (auth: DavAuth, href: string) => Promise<{ href: string; etag: string; vcardText: string }>
    >(),
  mockCreateCard:
    vi.fn<
      (
        auth: DavAuth,
        bookHref: string,
        vcardText: string,
      ) => Promise<{
        href: string;
        etag: string;
      }>
    >(),
  mockUpdateCard:
    vi.fn<
      (
        auth: DavAuth,
        href: string,
        etag: string,
        vcardText: string,
      ) => Promise<{
        href: string;
        etag: string;
      }>
    >(),
  mockDeleteCard: vi.fn<(auth: DavAuth, href: string, etag: string) => Promise<void>>(),
  mockParse: vi.fn<(text: string, href?: string, etag?: string) => Contact>(),
  mockSerialise: vi.fn<(contact: Contact) => string>(),
}));

vi.mock("@/dav", () => ({
  discoverAddressBooks: mockDiscoverAddressBooks,
  listContacts: mockListContacts,
  fetchCard: mockFetchCard,
  createCard: mockCreateCard,
  updateCard: mockUpdateCard,
  deleteCard: mockDeleteCard,
}));

vi.mock("@/vcard", () => ({
  parse: mockParse,
  serialise: mockSerialise,
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { DavError } from "@/dav/types";
import {
  loadFullBook,
  useAddressBooks,
  useContacts,
  useCreateContact,
  useDeleteContact,
  useUpdateContact,
} from "@/queries/index";

// Reset mock call counts between tests so later tests' assertions are
// unaffected by calls made by earlier ones.
beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MOCK_AUTH: DavAuth = {
  serverUrl: "https://dav.example.com",
  username: "alice",
  password: "secret",
};

const MOCK_BOOK: DavAddressBook = {
  href: "https://dav.example.com/dav/books/default/",
  displayName: "Default",
};

function createTestClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false, retryDelay: 0 },
    },
  });
}

function wrapper(client: QueryClient): ({ children }: { children: ReactNode }) => ReactNode {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

function makeContact(overrides: Partial<Contact> = {}): Contact {
  return {
    href: "https://dav.example.com/dav/books/default/1.vcf",
    etag: '"e1"',
    uid: "uid-1",
    fields: {
      fn: "Alice",
      n: { family: "A", given: "B", additional: "", prefix: "", suffix: "" },
      tel: [],
      email: [],
    },
    raw: { toString: () => "vcard" } as unknown as Contact["raw"],
    ...overrides,
  };
}

/** Wait until the query has fetched real data (not just placeholder). */
async function waitForFetchComplete<T>(result: {
  current: { isFetching: boolean; data: T | undefined };
}) {
  await waitFor(() => expect(result.current.isFetching).toBe(false));
}

// ---------------------------------------------------------------------------
// useAddressBooks
// ---------------------------------------------------------------------------

describe("useAddressBooks", () => {
  it("returns empty array when auth is undefined (not logged in)", () => {
    const client = createTestClient();
    const { result } = renderHook(() => useAddressBooks(undefined), {
      wrapper: wrapper(client),
    });
    expect(result.current.data).toEqual([]);
  });

  it("calls discoverAddressBooks when auth is provided", async () => {
    const books: DavAddressBook[] = [{ href: "/book1/", displayName: "Personal" }];
    mockDiscoverAddressBooks.mockResolvedValue(books);

    const client = createTestClient();
    const { result } = renderHook(() => useAddressBooks(MOCK_AUTH), {
      wrapper: wrapper(client),
    });

    await waitForFetchComplete(result);
    expect(result.current.data).toEqual(books);
    expect(mockDiscoverAddressBooks).toHaveBeenCalledWith(MOCK_AUTH);
  });
});

// ---------------------------------------------------------------------------
// useContacts
// ---------------------------------------------------------------------------

describe("useContacts", () => {
  it("returns empty array when auth or book is undefined", () => {
    const client = createTestClient();

    const { result: noAuth } = renderHook(() => useContacts(undefined, MOCK_BOOK), {
      wrapper: wrapper(client),
    });
    expect(noAuth.current.data).toEqual([]);

    const { result: noBook } = renderHook(() => useContacts(MOCK_AUTH, undefined), {
      wrapper: wrapper(client),
    });
    expect(noBook.current.data).toEqual([]);
  });

  it("loads the full book (list + fetch + parse)", async () => {
    const summaries = [
      { href: "https://dav.example.com/dav/books/default/1.vcf", etag: '"e1"' },
      { href: "https://dav.example.com/dav/books/default/2.vcf", etag: '"e2"' },
    ];
    mockListContacts.mockResolvedValue(summaries);
    mockFetchCard
      .mockResolvedValueOnce({
        href: summaries[0]!.href,
        etag: '"e1"',
        vcardText: "VCARD1",
      })
      .mockResolvedValueOnce({
        href: summaries[1]!.href,
        etag: '"e2"',
        vcardText: "VCARD2",
      });

    const contact1 = makeContact({ href: summaries[0]!.href, etag: '"e1"' });
    const contact2 = makeContact({ href: summaries[1]!.href, etag: '"e2"' });
    mockParse.mockReturnValueOnce(contact1).mockReturnValueOnce(contact2);

    const client = createTestClient();
    const { result } = renderHook(() => useContacts(MOCK_AUTH, MOCK_BOOK), {
      wrapper: wrapper(client),
    });

    await waitForFetchComplete(result);
    expect(result.current.data).toHaveLength(2);
    expect(mockParse).toHaveBeenCalledWith("VCARD1", summaries[0]!.href, '"e1"');
    expect(mockParse).toHaveBeenCalledWith("VCARD2", summaries[1]!.href, '"e2"');
  });

  it("isolates a corrupt card without breaking the book", async () => {
    const summaries = [
      { href: "https://dav.example.com/dav/books/default/1.vcf", etag: '"e1"' },
      { href: "https://dav.example.com/dav/books/default/2.vcf", etag: '"e2"' },
    ];
    mockListContacts.mockResolvedValue(summaries);
    mockFetchCard
      .mockResolvedValueOnce({
        href: summaries[0]!.href,
        etag: '"e1"',
        vcardText: "GOOD",
      })
      .mockResolvedValueOnce({
        href: summaries[1]!.href,
        etag: '"e2"',
        vcardText: "CORRUPT",
      });

    const goodContact = makeContact({ href: summaries[0]!.href, etag: '"e1"' });
    mockParse.mockReturnValueOnce(goodContact).mockImplementationOnce(() => {
      throw new Error("parse error");
    });

    const client = createTestClient();
    const { result } = renderHook(() => useContacts(MOCK_AUTH, MOCK_BOOK), {
      wrapper: wrapper(client),
    });

    await waitForFetchComplete(result);
    expect(result.current.data!.length).toBe(1);
    expect(result.current.data![0]?.href).toBe(summaries[0]!.href);
  });

  it("isolates a fetch failure without breaking the book", async () => {
    const summaries = [
      { href: "https://dav.example.com/dav/books/default/1.vcf", etag: '"e1"' },
      { href: "https://dav.example.com/dav/books/default/2.vcf", etag: '"e2"' },
    ];
    mockListContacts.mockResolvedValue(summaries);
    mockFetchCard
      .mockResolvedValueOnce({
        href: summaries[0]!.href,
        etag: '"e1"',
        vcardText: "GOOD",
      })
      .mockRejectedValueOnce(new Error("network error"));

    const goodContact = makeContact({ href: summaries[0]!.href, etag: '"e1"' });
    mockParse.mockReturnValue(goodContact);

    const client = createTestClient();
    const { result } = renderHook(() => useContacts(MOCK_AUTH, MOCK_BOOK), {
      wrapper: wrapper(client),
    });

    await waitForFetchComplete(result);
    expect(result.current.data!.length).toBe(1);
    expect(result.current.data![0]?.href).toBe(summaries[0]!.href);
  });
});

// ---------------------------------------------------------------------------
// loadFullBook (plain function — no React)
// ---------------------------------------------------------------------------

describe("loadFullBook", () => {
  it("assembles list + fetch + parse correctly", async () => {
    const summaries = [{ href: "https://dav.example.com/dav/books/default/1.vcf", etag: '"e1"' }];
    mockListContacts.mockResolvedValue(summaries);
    mockFetchCard.mockResolvedValue({
      href: summaries[0]!.href,
      etag: '"e1"',
      vcardText: "VCARD",
    });
    const contact = makeContact({ href: summaries[0]!.href, etag: '"e1"' });
    mockParse.mockReturnValue(contact);

    const result = await loadFullBook(MOCK_AUTH, "https://dav.example.com/dav/books/default/");

    expect(result).toHaveLength(1);
    expect(mockListContacts).toHaveBeenCalledWith(
      MOCK_AUTH,
      "https://dav.example.com/dav/books/default/",
    );
    expect(mockFetchCard).toHaveBeenCalledWith(MOCK_AUTH, summaries[0]!.href);
    expect(mockParse).toHaveBeenCalledWith("VCARD", summaries[0]!.href, '"e1"');
  });
});

// ---------------------------------------------------------------------------
// useCreateContact
// ---------------------------------------------------------------------------

describe("useCreateContact", () => {
  it("serialises and creates a card, then invalidates contacts", async () => {
    mockSerialise.mockReturnValue("SERIALISED_VCARD");
    mockCreateCard.mockResolvedValue({
      href: "https://dav.example.com/dav/books/default/new.vcf",
      etag: '"new-e"',
    });

    const contact = makeContact({ etag: "", href: "" });
    const client = createTestClient();
    const { result } = renderHook(() => useCreateContact(MOCK_AUTH, MOCK_BOOK.href), {
      wrapper: wrapper(client),
    });

    result.current.mutate(contact);
    await waitFor(() => expect(result.current.isSuccess).toBe(true), { timeout: 5000 });

    expect(mockSerialise).toHaveBeenCalledWith(contact);
    expect(mockCreateCard).toHaveBeenCalledWith(MOCK_AUTH, MOCK_BOOK.href, "SERIALISED_VCARD");
  });
});

// ---------------------------------------------------------------------------
// useUpdateContact
// ---------------------------------------------------------------------------

describe("useUpdateContact", () => {
  it("serialises with the correct etag and updates cache via setQueriesData", async () => {
    mockSerialise.mockReturnValue("SERIALISED_VCARD");
    mockUpdateCard.mockResolvedValue({
      href: "https://dav.example.com/dav/books/default/1.vcf",
      etag: '"new-etag"',
    });

    // Pre-populate the contacts cache.
    const oldContact = makeContact({ etag: '"e1"' });
    const client = createTestClient();
    client.setQueryData(
      ["contacts", MOCK_AUTH.serverUrl, MOCK_AUTH.username, MOCK_BOOK.href],
      [oldContact],
    );

    const { result } = renderHook(() => useUpdateContact(MOCK_AUTH), {
      wrapper: wrapper(client),
    });

    const updatedContact = makeContact({
      etag: '"e1"',
      fields: { ...oldContact.fields, fn: "Alice Updated" },
    });
    result.current.mutate(updatedContact);
    await waitFor(() => expect(result.current.isSuccess).toBe(true), { timeout: 5000 });

    // The cache should have the new etag.
    const cached = client.getQueryData<Contact[]>([
      "contacts",
      MOCK_AUTH.serverUrl,
      MOCK_AUTH.username,
      MOCK_BOOK.href,
    ]);
    expect(cached).toHaveLength(1);
    expect(cached![0]!.etag).toBe('"new-etag"');

    // The serialised vcard and the original etag were passed to updateCard.
    expect(mockUpdateCard).toHaveBeenCalledWith(
      MOCK_AUTH,
      updatedContact.href,
      '"e1"',
      "SERIALISED_VCARD",
    );
  });

  it("patches the cache with the submitted contact fields (not the stale cached ones)", async () => {
    mockSerialise.mockReturnValue("SERIALISED_VCARD");
    mockUpdateCard.mockResolvedValue({
      href: "https://dav.example.com/dav/books/default/1.vcf",
      etag: '"new-etag"',
    });

    // Pre-populate cache with a contact.
    const oldContact = makeContact({ etag: '"e1"' });
    const client = createTestClient();
    client.setQueryData(
      ["contacts", MOCK_AUTH.serverUrl, MOCK_AUTH.username, MOCK_BOOK.href],
      [oldContact],
    );

    const { result } = renderHook(() => useUpdateContact(MOCK_AUTH), {
      wrapper: wrapper(client),
    });

    // Copy-edit pattern: spread the contact, change a field, pass the copy.
    const editedContact = {
      ...oldContact,
      fields: { ...oldContact.fields, fn: "Alice Updated" },
    };
    result.current.mutate(editedContact);
    await waitFor(() => expect(result.current.isSuccess).toBe(true), { timeout: 5000 });

    // The cache should carry the edited fields AND the new etag — a regression
    // test against spreading the stale cached copy instead of the submitted one.
    const cached = client.getQueryData<Contact[]>([
      "contacts",
      MOCK_AUTH.serverUrl,
      MOCK_AUTH.username,
      MOCK_BOOK.href,
    ]);
    expect(cached).toHaveLength(1);
    expect(cached![0]!.etag).toBe('"new-etag"');
    expect(cached![0]!.fields.fn).toBe("Alice Updated");
  });

  it("exposes CONFLICT DavError to the caller", async () => {
    mockSerialise.mockReturnValue("SERIALISED");
    mockUpdateCard.mockRejectedValue(new DavError("conflict", "CONFLICT"));

    const client = createTestClient();
    const { result } = renderHook(() => useUpdateContact(MOCK_AUTH), {
      wrapper: wrapper(client),
    });

    result.current.mutate(makeContact());
    await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 5000 });
    expect(result.current.error).toBeInstanceOf(DavError);
    expect((result.current.error as DavError).code).toBe("CONFLICT");
  });
});

// ---------------------------------------------------------------------------
// useDeleteContact
// ---------------------------------------------------------------------------

describe("useDeleteContact", () => {
  it("calls deleteCard and removes the contact from cache", async () => {
    mockDeleteCard.mockResolvedValue(undefined);

    const contact = makeContact({
      href: "https://dav.example.com/dav/books/default/1.vcf",
      etag: '"e1"',
    });
    const otherContact = makeContact({
      href: "https://dav.example.com/dav/books/default/2.vcf",
      etag: '"e2"',
    });

    const client = createTestClient();
    client.setQueryData(
      ["contacts", MOCK_AUTH.serverUrl, MOCK_AUTH.username, MOCK_BOOK.href],
      [contact, otherContact],
    );

    const { result } = renderHook(() => useDeleteContact(MOCK_AUTH), {
      wrapper: wrapper(client),
    });

    result.current.mutate(contact);
    await waitFor(() => expect(result.current.isSuccess).toBe(true), { timeout: 5000 });

    expect(mockDeleteCard).toHaveBeenCalledWith(MOCK_AUTH, contact.href, contact.etag);

    const cached = client.getQueryData<Contact[]>([
      "contacts",
      MOCK_AUTH.serverUrl,
      MOCK_AUTH.username,
      MOCK_BOOK.href,
    ]);
    expect(cached).toHaveLength(1);
    expect(cached![0]?.href).toBe(otherContact.href);
  });

  it("exposes CONFLICT DavError to the caller", async () => {
    mockDeleteCard.mockRejectedValue(new DavError("conflict", "CONFLICT"));

    const client = createTestClient();
    const { result } = renderHook(() => useDeleteContact(MOCK_AUTH), {
      wrapper: wrapper(client),
    });

    result.current.mutate(makeContact());
    await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 5000 });
    expect((result.current.error as DavError).code).toBe("CONFLICT");
  });
});

// ---------------------------------------------------------------------------
// Mutation retry — invariant 5: mutations must not retry
// ---------------------------------------------------------------------------

describe("mutation retry behaviour", () => {
  it("does not retry a failed create mutation", async () => {
    mockSerialise.mockReturnValue("VCARD");
    mockCreateCard.mockRejectedValue(new DavError("authentication failed", "AUTH"));

    const client = createTestClient();
    const { result } = renderHook(() => useCreateContact(MOCK_AUTH, MOCK_BOOK.href), {
      wrapper: wrapper(client),
    });

    result.current.mutate(makeContact({ etag: "", href: "" }));
    await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 5000 });
    expect(result.current.error).toBeInstanceOf(DavError);
    expect(mockCreateCard).toHaveBeenCalledTimes(1);
  });

  it("does not retry a failed update mutation", async () => {
    mockSerialise.mockReturnValue("VCARD");
    mockUpdateCard.mockRejectedValue(new DavError("conflict", "CONFLICT"));

    const client = createTestClient();
    const { result } = renderHook(() => useUpdateContact(MOCK_AUTH), {
      wrapper: wrapper(client),
    });

    result.current.mutate(makeContact());
    await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 5000 });
    expect(mockUpdateCard).toHaveBeenCalledTimes(1);
  });

  it("does not retry a failed delete mutation", async () => {
    mockDeleteCard.mockRejectedValue(new DavError("not found", "NOT_FOUND"));

    const client = createTestClient();
    const { result } = renderHook(() => useDeleteContact(MOCK_AUTH), {
      wrapper: wrapper(client),
    });

    result.current.mutate(makeContact());
    await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 5000 });
    expect(mockDeleteCard).toHaveBeenCalledTimes(1);
  });
});
