/**
 * Integration tests for src/dav/internal.ts with tsdav mocked.
 *
 * Unlike helpers.test.ts (pure functions) and dav.test.ts (seam tests at the
 * index.ts level), these tests mock tsdav's createDAVClient directly to verify
 * that the real PROPFIND_MEMBER_PROPS / MULTIGET_PROPS constants are passed,
 * that book responses are excluded from members, that hrefs are absolutised,
 * and that fetchCard URL-matches entries from multiget responses.
 */

import type { DAVResponse } from "tsdav";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { __testing } from "@/dav/internal";

const { PROPFIND_MEMBER_PROPS, MULTIGET_PROPS } = __testing;

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
// eslint-disable-next-line @typescript-eslint/no-require-imports
const tsdavModule = await import("tsdav");
const mockCreateDAVClient = tsdavModule.createDAVClient as ReturnType<typeof vi.fn>;

type MockClient = {
  propfind: ReturnType<typeof vi.fn>;
  addressBookMultiGet: ReturnType<typeof vi.fn>;
  fetchAddressBooks: ReturnType<typeof vi.fn>;
  [key: string]: ReturnType<typeof vi.fn>;
};

function mockClient(overrides: Partial<MockClient> = {}): MockClient {
  return {
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
  it("calls propfind with PROPFIND_MEMBER_PROPS props and depth 1", async () => {
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
      props: PROPFIND_MEMBER_PROPS,
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
});

// ---------------------------------------------------------------------------
// fetchCard — addressBookMultiGet
// ---------------------------------------------------------------------------

describe("fetchCard", () => {
  it("calls addressBookMultiGet with MULTIGET_PROPS props and absolute objectUrl", async () => {
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
      props: MULTIGET_PROPS,
      depth: "1",
      objectUrls: ["https://dav.example.com/dav/books/default/1.vcf"],
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
