/**
 * Integration tests for src/dav/internal.ts with tsdav mocked.
 *
 * Unlike helpers.test.ts (pure functions) and dav.test.ts (seam tests at the
 * index.ts level), these tests mock tsdav's createDAVClient directly to pin
 * the exact wire shapes sent to propfind / addressBookMultiGet / davRequest
 * (props, depth, headers, body, objectUrls), that book responses are excluded
 * from members, that hrefs are absolutised, and that fetchCard URL-matches
 * entries from multiget responses.
 */

import type { DAVResponse } from "tsdav";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock tsdav at the module level. vi.mock is hoisted above imports.
vi.mock("tsdav", () => {
  const mockCreateDAVClient = vi.fn();
  return {
    createDAVClient: mockCreateDAVClient,
    __esModule: true,
  };
});

// Import after mock — internal.ts's dependency on tsdav resolves to the mock.
import { createDavSession } from "@/dav/internal";

// Get references to the mocked functions for per-test setup.
const tsdavModule = await import("tsdav");
const mockCreateDAVClient = tsdavModule.createDAVClient as ReturnType<typeof vi.fn>;

type MockClient = {
  davRequest: ReturnType<typeof vi.fn>;
  propfind: ReturnType<typeof vi.fn>;
  addressBookMultiGet: ReturnType<typeof vi.fn>;
  fetchAddressBooks: ReturnType<typeof vi.fn>;
  [key: string]: ReturnType<typeof vi.fn>;
};

function mockClient(overrides: Partial<MockClient> = {}): MockClient {
  return {
    davRequest: vi.fn(),
    propfind: vi.fn(),
    addressBookMultiGet: vi.fn(),
    fetchAddressBooks: vi.fn(),
    ...overrides,
  };
}

const AUTH = {
  serverUrl: "https://dav.example.com",
  username: "alice",
  password: "secret",
};

function davResp(overrides: Partial<DAVResponse>): DAVResponse {
  return { status: 200, statusText: "OK", ok: true, ...overrides } as DAVResponse;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// createDavSession — session creation
// ---------------------------------------------------------------------------

describe("createDavSession", () => {
  it("passes serverUrl, credentials, authMethod, and defaultAccountType", async () => {
    mockCreateDAVClient.mockResolvedValue(mockClient());

    await createDavSession(AUTH);

    expect(mockCreateDAVClient).toHaveBeenCalledWith({
      serverUrl: "https://dav.example.com",
      credentials: { username: "alice", password: "secret" },
      authMethod: "Basic",
      defaultAccountType: "carddav",
    });
  });
});

// ---------------------------------------------------------------------------
// listMembers — PROPFIND
// ---------------------------------------------------------------------------

describe("listMembers", () => {
  it("calls propfind with the member props literal and depth 1", async () => {
    const pfind = vi.fn().mockResolvedValue([
      davResp({
        href: "https://dav.example.com/dav/books/default/",
        props: { resourcetype: { collection: "", addressbook: "" } },
      }),
      davResp({
        href: "https://dav.example.com/dav/books/default/1.vcf",
        props: { getetag: '"e1"' },
      }),
    ]);
    mockCreateDAVClient.mockResolvedValue(mockClient({ propfind: pfind }));

    const session = await createDavSession(AUTH);
    await session.listMembers("https://dav.example.com/dav/books/default/");

    expect(pfind).toHaveBeenCalledWith({
      url: "https://dav.example.com/dav/books/default/",
      props: { "d:getetag": {}, "d:resourcetype": {} },
      depth: "1",
    });
  });

  it("excludes the collection response from members", async () => {
    const pfind = vi.fn().mockResolvedValue([
      davResp({
        href: "https://dav.example.com/dav/books/default/",
        props: { resourcetype: { collection: "", addressbook: "" } },
      }),
      davResp({
        href: "https://dav.example.com/dav/books/default/1.vcf",
        props: { getetag: '"e1"' },
      }),
    ]);
    mockCreateDAVClient.mockResolvedValue(mockClient({ propfind: pfind }));

    const session = await createDavSession(AUTH);
    const members = await session.listMembers("https://dav.example.com/dav/books/default/");

    expect(members).toHaveLength(1);
    expect(members[0]?.href).toBe("https://dav.example.com/dav/books/default/1.vcf");
  });

  it("absolutises relative hrefs using bookHref", async () => {
    const pfind = vi.fn().mockResolvedValue([
      davResp({
        href: "https://dav.example.com/dav/books/default/",
        props: { resourcetype: { collection: "", addressbook: "" } },
      }),
      davResp({ href: "/dav/books/default/1.vcf", props: { getetag: '"e1"' } }),
      davResp({ href: "2.vcf", props: { getetag: '"e2"' } }),
    ]);
    mockCreateDAVClient.mockResolvedValue(mockClient({ propfind: pfind }));

    const session = await createDavSession(AUTH);
    const members = await session.listMembers("https://dav.example.com/dav/books/default/");

    expect(members).toHaveLength(2);
    expect(members[0]?.href).toBe("https://dav.example.com/dav/books/default/1.vcf");
    expect(members[1]?.href).toBe("https://dav.example.com/dav/books/default/2.vcf");
  });

  it("excludes non-ok responses from members", async () => {
    const pfind = vi.fn().mockResolvedValue([
      davResp({
        href: "https://dav.example.com/dav/books/default/",
        props: { resourcetype: { collection: "", addressbook: "" } },
      }),
      davResp({
        href: "https://dav.example.com/dav/books/default/1.vcf",
        props: { getetag: '"e1"' },
        ok: false,
        status: 404,
      }),
    ]);
    mockCreateDAVClient.mockResolvedValue(mockClient({ propfind: pfind }));

    const session = await createDavSession(AUTH);
    const members = await session.listMembers("https://dav.example.com/dav/books/default/");

    expect(members).toHaveLength(0);
  });

  it("throws NOT_FOUND when the book PROPFIND returns 404", async () => {
    const pfind = vi.fn().mockResolvedValue([
      davResp({
        href: "https://dav.example.com/dav/books/default/",
        props: { resourcetype: { collection: "", addressbook: "" } },
        ok: false,
        status: 404,
        statusText: "Not Found",
      }),
    ]);
    mockCreateDAVClient.mockResolvedValue(mockClient({ propfind: pfind }));

    const session = await createDavSession(AUTH);
    await expect(
      session.listMembers("https://dav.example.com/dav/books/default/"),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("throws AUTH when the book PROPFIND returns 401", async () => {
    const pfind = vi.fn().mockResolvedValue([
      davResp({
        href: "https://dav.example.com/dav/books/default/",
        props: { resourcetype: { collection: "", addressbook: "" } },
        ok: false,
        status: 401,
        statusText: "Unauthorized",
      }),
    ]);
    mockCreateDAVClient.mockResolvedValue(mockClient({ propfind: pfind }));

    const session = await createDavSession(AUTH);
    await expect(
      session.listMembers("https://dav.example.com/dav/books/default/"),
    ).rejects.toMatchObject({ code: "AUTH" });
  });

  it("throws UNEXPECTED when the book PROPFIND returns 500", async () => {
    const pfind = vi.fn().mockResolvedValue([
      davResp({
        href: "https://dav.example.com/dav/books/default/",
        props: { resourcetype: { collection: "", addressbook: "" } },
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      }),
    ]);
    mockCreateDAVClient.mockResolvedValue(mockClient({ propfind: pfind }));

    const session = await createDavSession(AUTH);
    await expect(
      session.listMembers("https://dav.example.com/dav/books/default/"),
    ).rejects.toMatchObject({ code: "UNEXPECTED" });
  });
});

// ---------------------------------------------------------------------------
// fetchCard — addressBookMultiGet
// ---------------------------------------------------------------------------

describe("fetchCard", () => {
  it("calls addressBookMultiGet with the multiget props literal and a path-only objectUrl", async () => {
    const multiget = vi.fn().mockResolvedValue([
      davResp({
        href: "/dav/books/default/1.vcf",
        props: { getetag: '"e1"', addressData: "BEGIN:VCARD\nEND:VCARD" },
      }),
    ]);
    mockCreateDAVClient.mockResolvedValue(mockClient({ addressBookMultiGet: multiget }));

    const session = await createDavSession(AUTH);
    await session.fetchCard("https://dav.example.com/dav/books/default/1.vcf");

    expect(multiget).toHaveBeenCalledWith({
      url: "https://dav.example.com/dav/books/default/",
      props: { "d:getetag": {}, "card:address-data": {} },
      depth: "1",
      objectUrls: ["/dav/books/default/1.vcf"],
    });
  });

  it("URL-matches the response by absolute href", async () => {
    const multiget = vi.fn().mockResolvedValue([
      davResp({
        href: "/dav/books/default/1.vcf",
        props: { getetag: '"e1"', addressData: "BEGIN:VCARD\nFN:Alice\nEND:VCARD" },
      }),
    ]);
    mockCreateDAVClient.mockResolvedValue(mockClient({ addressBookMultiGet: multiget }));

    const session = await createDavSession(AUTH);
    const result = await session.fetchCard("https://dav.example.com/dav/books/default/1.vcf");

    expect(result.vcardText).toBe("BEGIN:VCARD\nFN:Alice\nEND:VCARD");
    expect(result.etag).toBe('"e1"');
  });

  it("finds the card when multiget returns relative + absolute hrefs", async () => {
    const multiget = vi.fn().mockResolvedValue([
      davResp({
        href: "/dav/books/default/1.vcf",
        props: { getetag: '"e1"', addressData: "BEGIN:VCARD\nFN:Alice\nEND:VCARD" },
      }),
      davResp({
        href: "https://other.example.com/foo.vcf",
        props: { getetag: '"e2"', addressData: "BEGIN:VCARD\nFN:Bob\nEND:VCARD" },
      }),
    ]);
    mockCreateDAVClient.mockResolvedValue(mockClient({ addressBookMultiGet: multiget }));

    const session = await createDavSession(AUTH);
    const result = await session.fetchCard("https://dav.example.com/dav/books/default/1.vcf");

    expect(result.vcardText).toBe("BEGIN:VCARD\nFN:Alice\nEND:VCARD");
  });

  it("throws NOT_FOUND when no response href matches", async () => {
    const multiget = vi.fn().mockResolvedValue([
      davResp({
        href: "/dav/books/default/2.vcf",
        props: { getetag: '"e2"', addressData: "BEGIN:VCARD\nFN:Bob\nEND:VCARD" },
      }),
    ]);
    mockCreateDAVClient.mockResolvedValue(mockClient({ addressBookMultiGet: multiget }));

    const session = await createDavSession(AUTH);
    await expect(
      session.fetchCard("https://dav.example.com/dav/books/default/1.vcf"),
    ).rejects.toThrow(/Card not found/);
  });
});

// ---------------------------------------------------------------------------
// updateCard — conditional PUT via davRequest + re-PROPFIND
// ---------------------------------------------------------------------------

describe("updateCard", () => {
  const VCARD = "BEGIN:VCARD\nVERSION:3.0\nFN:Alice\nEND:VCARD\n";
  const CARD_HREF = "https://dav.example.com/dav/books/default/1.vcf";

  it("calls davRequest with PUT, If-Match etag, vcard body, and text/vcard content-type", async () => {
    const davId = vi.fn().mockResolvedValue([davResp({ ok: true, status: 200 })]);
    const pfind = vi
      .fn()
      .mockResolvedValue([
        davResp({ href: "/dav/books/default/1.vcf", props: { getetag: '"new-etag"' } }),
      ]);
    mockCreateDAVClient.mockResolvedValue(mockClient({ davRequest: davId, propfind: pfind }));

    const session = await createDavSession(AUTH);
    await session.updateCard(CARD_HREF, '"old"', VCARD);

    expect(davId).toHaveBeenCalledWith({
      url: CARD_HREF,
      init: {
        method: "PUT",
        headers: { "Content-Type": "text/vcard; charset=utf-8", "If-Match": '"old"' },
        body: VCARD,
      },
      convertIncoming: false,
      parseOutgoing: false,
    });
  });

  it("returns the re-PROPFIND etag after a successful PUT", async () => {
    const davId = vi.fn().mockResolvedValue([davResp({ ok: true, status: 200 })]);
    const pfind = vi
      .fn()
      .mockResolvedValue([
        davResp({ href: "/dav/books/default/1.vcf", props: { getetag: '"new-etag"' } }),
      ]);
    mockCreateDAVClient.mockResolvedValue(mockClient({ davRequest: davId, propfind: pfind }));

    const session = await createDavSession(AUTH);
    const result = await session.updateCard(CARD_HREF, '"old"', VCARD);

    expect(result).toEqual({ href: CARD_HREF, etag: '"new-etag"' });
  });

  it("re-PROPFINDS depth 0 on the card href to get the fresh etag", async () => {
    const davId = vi.fn().mockResolvedValue([davResp({ ok: true, status: 200 })]);
    const pfind = vi
      .fn()
      .mockResolvedValue([
        davResp({ href: "/dav/books/default/1.vcf", props: { getetag: '"e"' } }),
      ]);
    mockCreateDAVClient.mockResolvedValue(mockClient({ davRequest: davId, propfind: pfind }));

    const session = await createDavSession(AUTH);
    await session.updateCard(CARD_HREF, '"old"', VCARD);

    expect(pfind).toHaveBeenCalledWith({
      url: CARD_HREF,
      props: { "d:getetag": {} },
      depth: "0",
    });
  });

  it("throws CONFLICT when PUT returns 412", async () => {
    const davId = vi
      .fn()
      .mockResolvedValue([davResp({ ok: false, status: 412, statusText: "Precondition Failed" })]);
    mockCreateDAVClient.mockResolvedValue(mockClient({ davRequest: davId }));

    const session = await createDavSession(AUTH);
    await expect(session.updateCard(CARD_HREF, '"old"', VCARD)).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("throws AUTH when PUT returns 401", async () => {
    const davId = vi
      .fn()
      .mockResolvedValue([davResp({ ok: false, status: 401, statusText: "Unauthorized" })]);
    mockCreateDAVClient.mockResolvedValue(mockClient({ davRequest: davId }));

    const session = await createDavSession(AUTH);
    await expect(session.updateCard(CARD_HREF, '"old"', VCARD)).rejects.toMatchObject({
      code: "AUTH",
    });
  });

  it("throws AUTH when PUT returns 403", async () => {
    const davId = vi
      .fn()
      .mockResolvedValue([davResp({ ok: false, status: 403, statusText: "Forbidden" })]);
    mockCreateDAVClient.mockResolvedValue(mockClient({ davRequest: davId }));

    const session = await createDavSession(AUTH);
    await expect(session.updateCard(CARD_HREF, '"old"', VCARD)).rejects.toMatchObject({
      code: "AUTH",
    });
  });

  it("throws NOT_FOUND when PUT returns 404", async () => {
    const davId = vi
      .fn()
      .mockResolvedValue([davResp({ ok: false, status: 404, statusText: "Not Found" })]);
    mockCreateDAVClient.mockResolvedValue(mockClient({ davRequest: davId }));

    const session = await createDavSession(AUTH);
    await expect(session.updateCard(CARD_HREF, '"old"', VCARD)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("throws UNEXPECTED with HTTP status when PUT returns 500", async () => {
    const davId = vi
      .fn()
      .mockResolvedValue([
        davResp({ ok: false, status: 500, statusText: "Internal Server Error" }),
      ]);
    mockCreateDAVClient.mockResolvedValue(mockClient({ davRequest: davId }));

    const session = await createDavSession(AUTH);
    await expect(session.updateCard(CARD_HREF, '"old"', VCARD)).rejects.toMatchObject({
      code: "UNEXPECTED",
      message: expect.stringContaining("HTTP 500"),
    });
  });

  it("throws NETWORK when davRequest rejects with a TypeError", async () => {
    const davId = vi.fn().mockRejectedValue(new TypeError("Load failed"));
    mockCreateDAVClient.mockResolvedValue(mockClient({ davRequest: davId, propfind: vi.fn() }));

    const session = await createDavSession(AUTH);
    await expect(session.updateCard(CARD_HREF, '"old"', VCARD)).rejects.toMatchObject({
      code: "NETWORK",
    });
  });
});

// ---------------------------------------------------------------------------
// createCard — conditional PUT with If-None-Match: * + re-PROPFIND
// ---------------------------------------------------------------------------

describe("createCard", () => {
  const VCARD = "BEGIN:VCARD\nVERSION:3.0\nFN:Bob\nEND:VCARD\n";
  const BOOK_HREF = "https://dav.example.com/dav/books/default/";

  beforeEach(() => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue("00000000-0000-4000-8000-000000000000");
  });

  it("PUTs a generated href with If-None-Match: * and the raw vcard body", async () => {
    const davId = vi.fn().mockResolvedValue([davResp({ ok: true, status: 201 })]);
    const pfind = vi.fn().mockResolvedValue([
      davResp({
        href: "/dav/books/default/00000000-0000-4000-8000-000000000000.vcf",
        props: { getetag: '"e"' },
      }),
    ]);
    mockCreateDAVClient.mockResolvedValue(mockClient({ davRequest: davId, propfind: pfind }));

    const session = await createDavSession(AUTH);
    await session.createCard(BOOK_HREF, VCARD);

    expect(davId).toHaveBeenCalledWith({
      url: "https://dav.example.com/dav/books/default/00000000-0000-4000-8000-000000000000.vcf",
      init: {
        method: "PUT",
        headers: { "Content-Type": "text/vcard; charset=utf-8", "If-None-Match": "*" },
        body: VCARD,
      },
      convertIncoming: false,
      parseOutgoing: false,
    });
  });

  it("returns the created href and re-PROPFIND etag", async () => {
    const davId = vi.fn().mockResolvedValue([davResp({ ok: true, status: 201 })]);
    const pfind = vi.fn().mockResolvedValue([
      davResp({
        href: "/dav/books/default/00000000-0000-4000-8000-000000000000.vcf",
        props: { getetag: '"new-e"' },
      }),
    ]);
    mockCreateDAVClient.mockResolvedValue(mockClient({ davRequest: davId, propfind: pfind }));

    const session = await createDavSession(AUTH);
    const result = await session.createCard(BOOK_HREF, VCARD);

    expect(result).toEqual({
      href: "https://dav.example.com/dav/books/default/00000000-0000-4000-8000-000000000000.vcf",
      etag: '"new-e"',
    });
  });

  it("throws CONFLICT when PUT returns 412", async () => {
    const davId = vi
      .fn()
      .mockResolvedValue([davResp({ ok: false, status: 412, statusText: "Precondition Failed" })]);
    mockCreateDAVClient.mockResolvedValue(mockClient({ davRequest: davId }));

    const session = await createDavSession(AUTH);
    await expect(session.createCard(BOOK_HREF, VCARD)).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("throws AUTH when PUT returns 401", async () => {
    const davId = vi
      .fn()
      .mockResolvedValue([davResp({ ok: false, status: 401, statusText: "Unauthorized" })]);
    mockCreateDAVClient.mockResolvedValue(mockClient({ davRequest: davId }));

    const session = await createDavSession(AUTH);
    await expect(session.createCard(BOOK_HREF, VCARD)).rejects.toMatchObject({ code: "AUTH" });
  });
});

// ---------------------------------------------------------------------------
// deleteCard — conditional DELETE with If-Match
// ---------------------------------------------------------------------------

describe("deleteCard", () => {
  const CARD_HREF = "https://dav.example.com/dav/books/default/1.vcf";

  it("calls davRequest with DELETE and If-Match etag", async () => {
    const davId = vi.fn().mockResolvedValue([davResp({ ok: true, status: 204 })]);
    mockCreateDAVClient.mockResolvedValue(mockClient({ davRequest: davId }));

    const session = await createDavSession(AUTH);
    await session.deleteCard(CARD_HREF, '"e"');

    expect(davId).toHaveBeenCalledWith({
      url: CARD_HREF,
      init: { method: "DELETE", headers: { "If-Match": '"e"' } },
      convertIncoming: false,
      parseOutgoing: false,
    });
  });

  it("does not re-PROPFIND after a successful delete", async () => {
    const davId = vi.fn().mockResolvedValue([davResp({ ok: true, status: 204 })]);
    const pfind = vi.fn();
    mockCreateDAVClient.mockResolvedValue(mockClient({ davRequest: davId, propfind: pfind }));

    const session = await createDavSession(AUTH);
    await session.deleteCard(CARD_HREF, '"e"');

    expect(pfind).not.toHaveBeenCalled();
  });

  it("throws CONFLICT when DELETE returns 412", async () => {
    const davId = vi
      .fn()
      .mockResolvedValue([davResp({ ok: false, status: 412, statusText: "Precondition Failed" })]);
    mockCreateDAVClient.mockResolvedValue(mockClient({ davRequest: davId }));

    const session = await createDavSession(AUTH);
    await expect(session.deleteCard(CARD_HREF, '"e"')).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("throws AUTH when DELETE returns 401", async () => {
    const davId = vi
      .fn()
      .mockResolvedValue([davResp({ ok: false, status: 401, statusText: "Unauthorized" })]);
    mockCreateDAVClient.mockResolvedValue(mockClient({ davRequest: davId }));

    const session = await createDavSession(AUTH);
    await expect(session.deleteCard(CARD_HREF, '"e"')).rejects.toMatchObject({ code: "AUTH" });
  });

  it("throws NOT_FOUND when DELETE returns 404", async () => {
    const davId = vi
      .fn()
      .mockResolvedValue([davResp({ ok: false, status: 404, statusText: "Not Found" })]);
    mockCreateDAVClient.mockResolvedValue(mockClient({ davRequest: davId }));

    const session = await createDavSession(AUTH);
    await expect(session.deleteCard(CARD_HREF, '"e"')).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("throws UNEXPECTED with HTTP status when DELETE returns 500", async () => {
    const davId = vi
      .fn()
      .mockResolvedValue([
        davResp({ ok: false, status: 500, statusText: "Internal Server Error" }),
      ]);
    mockCreateDAVClient.mockResolvedValue(mockClient({ davRequest: davId }));

    const session = await createDavSession(AUTH);
    await expect(session.deleteCard(CARD_HREF, '"e"')).rejects.toMatchObject({
      code: "UNEXPECTED",
      message: expect.stringContaining("HTTP 500"),
    });
  });
});
