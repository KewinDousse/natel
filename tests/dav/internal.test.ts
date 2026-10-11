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
import { createDavSession, __testing as internalTesting } from "@/dav/internal";

// DavError is needed for AUTH-eviction tests.
import { DavError } from "@/dav/types";

// Get references to the mocked functions for per-test setup.
const tsdavModule = await import("tsdav");
const mockCreateDAVClient = tsdavModule.createDAVClient as ReturnType<typeof vi.fn>;

type MockClient = {
  davRequest: ReturnType<typeof vi.fn>;
  propfind: ReturnType<typeof vi.fn>;
  addressBookMultiGet: ReturnType<typeof vi.fn>;
  [key: string]: ReturnType<typeof vi.fn>;
};

/** Where the mocked server's discovery leads: principal, then home. */
const PRINCIPAL_PATH = "/principals/alice/";
const HOME_PATH = "/books/";

/** Answer the discovery PROPFINDs session creation sends. */
function discoveryResponse(props: Record<string, unknown>): DAVResponse[] | undefined {
  if ("d:current-user-principal" in props) {
    return [davResp({ href: "/", props: { currentUserPrincipal: { href: PRINCIPAL_PATH } } })];
  }
  if ("card:addressbook-home-set" in props) {
    return [davResp({ href: PRINCIPAL_PATH, props: { addressbookHomeSet: { href: HOME_PATH } } })];
  }
  return undefined;
}

/**
 * A tsdav client whose propfind answers discovery itself and forwards every
 * other call to the `propfind` override, so tests only see their own calls.
 */
function mockClient(overrides: Partial<MockClient> = {}): MockClient {
  const { propfind: operationPropfind = vi.fn(), ...rest } = overrides;
  const forward = operationPropfind as (args: unknown) => unknown;
  return {
    davRequest: vi.fn(),
    addressBookMultiGet: vi.fn(),
    ...rest,
    propfind: vi.fn(async (args: { props: Record<string, unknown> }) => {
      return discoveryResponse(args.props) ?? forward(args);
    }),
  };
}

const AUTH = {
  username: "alice",
  password: "secret",
};

function davResp(overrides: Partial<DAVResponse>): DAVResponse {
  return { status: 200, statusText: "OK", ok: true, ...overrides } as DAVResponse;
}

beforeEach(() => {
  vi.clearAllMocks();
  // Clear the session cache so each test gets a fresh tsdav client from the
  // per-test mock setup. Without this, the cache would return the first test's
  // session for all subsequent tests (same username key), breaking
  // the mocked per-test client configuration.
  internalTesting.clearSessionCache();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// createDavSession — session creation
// ---------------------------------------------------------------------------

describe("createDavSession", () => {
  it("points tsdav at the same-origin proxy and leaves discovery to us", async () => {
    mockCreateDAVClient.mockResolvedValue(mockClient());

    await createDavSession(AUTH);

    expect(mockCreateDAVClient).toHaveBeenCalledWith({
      serverUrl: "http://localhost:3000/dav/",
      credentials: { username: "alice", password: "secret" },
      authMethod: "Basic",
      fetchOptions: { mode: "same-origin" },
    });
  });
});

// ---------------------------------------------------------------------------
// Discovery behind the /dav proxy
// ---------------------------------------------------------------------------

describe("discovery", () => {
  /** A client whose propfind is entirely scripted by the test. */
  function scriptedClient(propfind: ReturnType<typeof vi.fn>): MockClient {
    return { davRequest: vi.fn(), addressBookMultiGet: vi.fn(), propfind };
  }

  const BOOKS_RESPONSE = [
    davResp({ href: "/dav.php/addressbooks/alice/", props: { resourcetype: { collection: "" } } }),
    davResp({
      href: "/dav.php/addressbooks/alice/default/",
      props: { resourcetype: { collection: "", addressbook: "" }, displayname: "Contacts" },
    }),
    davResp({
      href: "/dav.php/addressbooks/alice/work/",
      props: { resourcetype: { collection: "", addressbook: "" } },
    }),
    davResp({
      href: "/dav.php/addressbooks/alice/inbox/",
      props: { resourcetype: { collection: "" } },
    }),
  ];

  const NOT_FOUND = [davResp({ ok: false, status: 404, statusText: "Not Found" })];

  it("starts at the well-known URL and maps every href into /dav", async () => {
    const pfind = vi
      .fn()
      .mockResolvedValueOnce([
        davResp({
          href: "/",
          props: { currentUserPrincipal: { href: "/dav.php/principals/alice/" } },
        }),
      ])
      .mockResolvedValueOnce([
        davResp({
          href: "/dav.php/principals/alice/",
          props: { addressbookHomeSet: { href: "/dav.php/addressbooks/alice/" } },
        }),
      ])
      .mockResolvedValueOnce(BOOKS_RESPONSE);
    mockCreateDAVClient.mockResolvedValue(scriptedClient(pfind));

    const session = await createDavSession(AUTH);
    const books = await session.discoverAddressBooks();

    // The browser follows the well-known redirect, which the proxy maps under /dav.
    expect(pfind.mock.calls.map(([args]) => [args.url, args.depth])).toEqual([
      ["http://localhost:3000/dav/.well-known/carddav", "0"],
      ["http://localhost:3000/dav/dav.php/principals/alice/", "0"],
      ["http://localhost:3000/dav/dav.php/addressbooks/alice/", "1"],
    ]);
    expect(books).toEqual([
      {
        href: "http://localhost:3000/dav/dav.php/addressbooks/alice/default/",
        displayName: "Contacts",
      },
      {
        href: "http://localhost:3000/dav/dav.php/addressbooks/alice/work/",
        displayName: "http://localhost:3000/dav/dav.php/addressbooks/alice/work/",
      },
    ]);
  });

  it("falls back to the server root without a well-known redirect", async () => {
    const pfind = vi
      .fn()
      .mockResolvedValueOnce(NOT_FOUND)
      .mockResolvedValueOnce([
        davResp({ href: "/", props: { currentUserPrincipal: { href: "/alice/" } } }),
      ])
      .mockResolvedValueOnce([
        davResp({ href: "/alice/", props: { addressbookHomeSet: { href: "/alice/" } } }),
      ]);
    mockCreateDAVClient.mockResolvedValue(scriptedClient(pfind));

    await createDavSession(AUTH);

    expect(pfind.mock.calls.map(([args]) => args.url)).toEqual([
      "http://localhost:3000/dav/.well-known/carddav",
      "http://localhost:3000/dav/",
      "http://localhost:3000/dav/alice/",
    ]);
  });

  it("falls back to Baïkal's /dav.php/ root last", async () => {
    const pfind = vi
      .fn()
      .mockResolvedValueOnce(NOT_FOUND)
      // Baïkal's web root is an HTML page: 200, no DAV properties.
      .mockResolvedValueOnce([davResp({ href: "http://localhost:3000/dav/" })])
      .mockResolvedValueOnce([
        davResp({
          href: "/dav.php/",
          props: { currentUserPrincipal: { href: "/dav.php/principals/alice/" } },
        }),
      ])
      .mockResolvedValueOnce([
        davResp({
          href: "/dav.php/principals/alice/",
          props: { addressbookHomeSet: { href: "/dav.php/addressbooks/alice/" } },
        }),
      ])
      .mockResolvedValueOnce(BOOKS_RESPONSE);
    mockCreateDAVClient.mockResolvedValue(scriptedClient(pfind));

    const session = await createDavSession(AUTH);
    const books = await session.discoverAddressBooks();

    expect(pfind.mock.calls.map(([args]) => args.url)).toEqual([
      "http://localhost:3000/dav/.well-known/carddav",
      "http://localhost:3000/dav/",
      "http://localhost:3000/dav/dav.php/",
      "http://localhost:3000/dav/dav.php/principals/alice/",
      "http://localhost:3000/dav/dav.php/addressbooks/alice/",
    ]);
    expect(books).toHaveLength(2);
  });

  it("stops at the first root that rejects the credentials", async () => {
    const pfind = vi
      .fn()
      .mockResolvedValue([davResp({ ok: false, status: 401, statusText: "Unauthorized" })]);
    mockCreateDAVClient.mockResolvedValue(scriptedClient(pfind));

    await expect(createDavSession(AUTH)).rejects.toMatchObject({ code: "AUTH" });
    expect(pfind).toHaveBeenCalledTimes(1);
  });

  it("rejects with the last root's error when no root has a principal", async () => {
    const pfind = vi
      .fn()
      .mockResolvedValueOnce(NOT_FOUND)
      .mockResolvedValueOnce([davResp({ href: "http://localhost:3000/dav/" })])
      .mockResolvedValueOnce(NOT_FOUND);
    mockCreateDAVClient.mockResolvedValue(scriptedClient(pfind));

    await expect(createDavSession(AUTH)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(pfind).toHaveBeenCalledTimes(3);
  });
});

// ---------------------------------------------------------------------------
// Session cache semantics
// ---------------------------------------------------------------------------

describe("session cache", () => {
  beforeEach(() => {
    mockCreateDAVClient.mockResolvedValue(mockClient());
  });

  it("dedupes concurrent calls — createDAVClient called once", async () => {
    const [s1, s2] = await Promise.all([createDavSession(AUTH), createDavSession(AUTH)]);
    expect(mockCreateDAVClient).toHaveBeenCalledTimes(1);
    // Both resolve to sessions (they are the same underlying promise).
    expect(s1).toBeDefined();
    expect(s2).toBeDefined();
  });

  it("reuses cached session on sequential calls", async () => {
    const s1 = await createDavSession(AUTH);
    const s2 = await createDavSession(AUTH);
    expect(mockCreateDAVClient).toHaveBeenCalledTimes(1);
    expect(s1).toBeDefined();
    expect(s2).toBeDefined();
  });

  it("evicts on creation rejection so a corrected password gets a fresh session", async () => {
    mockCreateDAVClient.mockReset();
    mockCreateDAVClient.mockRejectedValueOnce(new Error("Connection refused"));
    await expect(createDavSession(AUTH)).rejects.toThrow();

    // Second attempt should retry createDAVClient (cache was evicted).
    mockCreateDAVClient.mockResolvedValueOnce(mockClient());
    const session = await createDavSession(AUTH);
    expect(mockCreateDAVClient).toHaveBeenCalledTimes(2);
    expect(session).toBeDefined();
  });

  it("evicts on operation AUTH error so the next call creates a fresh session", async () => {
    // Set up a client whose discoverAddressBooks fails with AUTH.
    const brokenClient = mockClient({
      propfind: vi.fn().mockRejectedValue(new DavError("auth failed", "AUTH")),
    });
    mockCreateDAVClient.mockReset();
    mockCreateDAVClient.mockResolvedValue(brokenClient);

    const session = await createDavSession(AUTH);
    expect(mockCreateDAVClient).toHaveBeenCalledTimes(1);

    // Operation throws AUTH → cache entry evicted.
    await expect(session.discoverAddressBooks()).rejects.toMatchObject({ code: "AUTH" });

    // Now set up a working client for the next createDavSession call.
    const workingClient = mockClient();
    mockCreateDAVClient.mockResolvedValue(workingClient);

    const session2 = await createDavSession(AUTH);
    // createDAVClient was called again because the AUTH eviction cleared the cache.
    expect(mockCreateDAVClient).toHaveBeenCalledTimes(2);
    expect(session2).toBeDefined();
  });

  it("checks another password against the server rather than reusing the open session", async () => {
    await createDavSession(AUTH);

    const rejecting = mockClient();
    rejecting.propfind.mockRejectedValue(new Error("Invalid credentials: PROPFIND returned 401"));
    mockCreateDAVClient.mockResolvedValueOnce(rejecting);

    await expect(createDavSession({ ...AUTH, password: "wrong" })).rejects.toMatchObject({
      code: "AUTH",
    });
    expect(mockCreateDAVClient).toHaveBeenLastCalledWith(
      expect.objectContaining({ credentials: { username: "alice", password: "wrong" } }),
    );
  });

  it("leaves a newer session in place when an older one for the same user fails", async () => {
    let failWrong: (err: Error) => void = () => {};
    mockCreateDAVClient.mockReturnValueOnce(
      new Promise((_resolve, reject) => {
        failWrong = reject;
      }),
    );
    const wrong = createDavSession({ ...AUTH, password: "wrong" });
    const right = await createDavSession(AUTH);

    failWrong(new Error("Invalid credentials: PROPFIND returned 401"));
    await expect(wrong).rejects.toThrow();

    expect(await createDavSession(AUTH)).toBe(right);
    expect(mockCreateDAVClient).toHaveBeenCalledTimes(2);
  });

  it("leaves the session opened after a logout when one from before it fails", async () => {
    let failOld: (err: Error) => void = () => {};
    mockCreateDAVClient.mockReturnValueOnce(
      new Promise((_resolve, reject) => {
        failOld = reject;
      }),
    );
    const old = createDavSession(AUTH);
    internalTesting.clearSessionCache();
    const fresh = await createDavSession(AUTH);

    failOld(new Error("Connection refused"));
    await expect(old).rejects.toThrow();

    expect(await createDavSession(AUTH)).toBe(fresh);
    expect(mockCreateDAVClient).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// listMembers — PROPFIND
// ---------------------------------------------------------------------------

describe("DAV operation URL boundaries", () => {
  const unsafe = [
    "https://outside.example/dav/books/default/1.vcf",
    "http://localhost:3001/dav/books/default/1.vcf",
    "http://localhost:3000/settings",
    "http://localhost:3000/davious/1.vcf",
    "http://localhost:3000/dav/books/../../../settings",
    "http://user:pass@localhost:3000/dav/books/default/1.vcf",
    "not a URL",
  ];
  const operations = [
    "listMembers",
    "fetchCard",
    "fetchCards",
    "updateCard",
    "createCard",
    "deleteCard",
  ] as const;
  it.each(operations)("rejects unsafe input before I/O in %s", async (operation) => {
    for (const href of unsafe) {
      const client = mockClient({
        propfind: vi
          .fn()
          .mockResolvedValue([
            davResp({ href: "/books/default/1.vcf", props: { getetag: '"etag"' } }),
          ]),
        addressBookMultiGet: vi.fn().mockResolvedValue([
          davResp({
            href: "/books/default/1.vcf",
            props: { getetag: '"etag"', addressData: "VCARD" },
          }),
        ]),
        davRequest: vi.fn().mockResolvedValue([davResp({})]),
      });
      internalTesting.clearSessionCache();
      mockCreateDAVClient.mockResolvedValue(client);
      const session = await createDavSession(AUTH);
      client.propfind.mockClear();
      const request =
        operation === "fetchCards"
          ? session.fetchCards([href])
          : operation === "updateCard"
            ? session.updateCard(href, '"etag"', "VCARD")
            : operation === "deleteCard"
              ? session.deleteCard(href, '"etag"')
              : operation === "createCard"
                ? session.createCard(href, "VCARD")
                : session[operation](href);
      await expect(request, href).rejects.toMatchObject({ code: "UNEXPECTED" });
      expect(client.propfind, href).not.toHaveBeenCalled();
      expect(client.addressBookMultiGet, href).not.toHaveBeenCalled();
      expect(client.davRequest, href).not.toHaveBeenCalled();
    }
  });

  it("validates every href of a batch before sending it", async () => {
    const client = mockClient();
    mockCreateDAVClient.mockResolvedValue(client);
    const session = await createDavSession(AUTH);
    await expect(
      session.fetchCards([
        "http://localhost:3000/dav/books/default/1.vcf",
        "https://outside.example/dav/books/default/2.vcf",
      ]),
    ).rejects.toMatchObject({ code: "UNEXPECTED" });
    expect(client.addressBookMultiGet).not.toHaveBeenCalled();
  });
});

describe("DAV derived collection boundaries", () => {
  it.each(["http://localhost:3000/dav/", "http://localhost:3000/dav/card.vcf/../"])(
    "refuses a card whose parent is outside the proxy: %s",
    async (href) => {
      const client = mockClient();
      mockCreateDAVClient.mockResolvedValue(client);
      const session = await createDavSession(AUTH);
      await expect(session.fetchCard(href)).rejects.toMatchObject({ code: "UNEXPECTED" });
      await expect(session.fetchCards([href])).rejects.toMatchObject({ code: "UNEXPECTED" });
      expect(client.addressBookMultiGet).not.toHaveBeenCalled();
    },
  );
});

describe("listMembers", () => {
  it("calls propfind with the member props literal and depth 1", async () => {
    const pfind = vi.fn().mockResolvedValue([
      davResp({
        href: "https://dav.example.com/books/default/",
        props: { resourcetype: { collection: "", addressbook: "" } },
      }),
      davResp({
        href: "https://dav.example.com/books/default/1.vcf",
        props: { getetag: '"e1"' },
      }),
    ]);
    mockCreateDAVClient.mockResolvedValue(mockClient({ propfind: pfind }));

    const session = await createDavSession(AUTH);
    await session.listMembers("http://localhost:3000/dav/books/default/");

    expect(pfind).toHaveBeenCalledWith({
      url: "http://localhost:3000/dav/books/default/",
      props: { "d:getetag": {}, "d:resourcetype": {} },
      depth: "1",
    });
  });

  it("excludes the collection response from members", async () => {
    const pfind = vi.fn().mockResolvedValue([
      davResp({
        href: "https://dav.example.com/books/default/",
        props: { resourcetype: { collection: "", addressbook: "" } },
      }),
      davResp({
        href: "https://dav.example.com/books/default/1.vcf",
        props: { getetag: '"e1"' },
      }),
    ]);
    mockCreateDAVClient.mockResolvedValue(mockClient({ propfind: pfind }));

    const session = await createDavSession(AUTH);
    const members = await session.listMembers("http://localhost:3000/dav/books/default/");

    expect(members).toHaveLength(1);
    expect(members[0]?.href).toBe("http://localhost:3000/dav/books/default/1.vcf");
  });

  it("absolutises relative hrefs using bookHref", async () => {
    const pfind = vi.fn().mockResolvedValue([
      davResp({
        href: "https://dav.example.com/books/default/",
        props: { resourcetype: { collection: "", addressbook: "" } },
      }),
      davResp({ href: "/books/default/1.vcf", props: { getetag: '"e1"' } }),
      davResp({ href: "2.vcf", props: { getetag: '"e2"' } }),
    ]);
    mockCreateDAVClient.mockResolvedValue(mockClient({ propfind: pfind }));

    const session = await createDavSession(AUTH);
    const members = await session.listMembers("http://localhost:3000/dav/books/default/");

    expect(members).toHaveLength(2);
    expect(members[0]?.href).toBe("http://localhost:3000/dav/books/default/1.vcf");
    expect(members[1]?.href).toBe("http://localhost:3000/dav/books/default/2.vcf");
  });

  it("excludes non-ok responses from members", async () => {
    const pfind = vi.fn().mockResolvedValue([
      davResp({
        href: "https://dav.example.com/books/default/",
        props: { resourcetype: { collection: "", addressbook: "" } },
      }),
      davResp({
        href: "https://dav.example.com/books/default/1.vcf",
        props: { getetag: '"e1"' },
        ok: false,
        status: 404,
      }),
    ]);
    mockCreateDAVClient.mockResolvedValue(mockClient({ propfind: pfind }));

    const session = await createDavSession(AUTH);
    const members = await session.listMembers("http://localhost:3000/dav/books/default/");

    expect(members).toHaveLength(0);
  });

  it("throws NOT_FOUND when the book PROPFIND returns 404", async () => {
    const pfind = vi.fn().mockResolvedValue([
      davResp({
        href: "https://dav.example.com/books/default/",
        props: { resourcetype: { collection: "", addressbook: "" } },
        ok: false,
        status: 404,
        statusText: "Not Found",
      }),
    ]);
    mockCreateDAVClient.mockResolvedValue(mockClient({ propfind: pfind }));

    const session = await createDavSession(AUTH);
    await expect(
      session.listMembers("http://localhost:3000/dav/books/default/"),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("throws AUTH when the book PROPFIND returns 401", async () => {
    const pfind = vi.fn().mockResolvedValue([
      davResp({
        href: "https://dav.example.com/books/default/",
        props: { resourcetype: { collection: "", addressbook: "" } },
        ok: false,
        status: 401,
        statusText: "Unauthorized",
      }),
    ]);
    mockCreateDAVClient.mockResolvedValue(mockClient({ propfind: pfind }));

    const session = await createDavSession(AUTH);
    await expect(
      session.listMembers("http://localhost:3000/dav/books/default/"),
    ).rejects.toMatchObject({ code: "AUTH" });
  });

  it("throws UNEXPECTED when the book PROPFIND returns 500", async () => {
    const pfind = vi.fn().mockResolvedValue([
      davResp({
        href: "https://dav.example.com/books/default/",
        props: { resourcetype: { collection: "", addressbook: "" } },
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      }),
    ]);
    mockCreateDAVClient.mockResolvedValue(mockClient({ propfind: pfind }));

    const session = await createDavSession(AUTH);
    await expect(
      session.listMembers("http://localhost:3000/dav/books/default/"),
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
        href: "/books/default/1.vcf",
        props: { getetag: '"e1"', addressData: "BEGIN:VCARD\nEND:VCARD" },
      }),
    ]);
    mockCreateDAVClient.mockResolvedValue(mockClient({ addressBookMultiGet: multiget }));

    const session = await createDavSession(AUTH);
    await session.fetchCard("http://localhost:3000/dav/books/default/1.vcf");

    expect(multiget).toHaveBeenCalledWith({
      url: "http://localhost:3000/dav/books/default/",
      props: { "d:getetag": {}, "card:address-data": {} },
      depth: "1",
      objectUrls: ["/books/default/1.vcf"],
    });
  });

  it("URL-matches the response by absolute href", async () => {
    const multiget = vi.fn().mockResolvedValue([
      davResp({
        href: "/books/default/1.vcf",
        props: { getetag: '"e1"', addressData: "BEGIN:VCARD\nFN:Alice\nEND:VCARD" },
      }),
    ]);
    mockCreateDAVClient.mockResolvedValue(mockClient({ addressBookMultiGet: multiget }));

    const session = await createDavSession(AUTH);
    const result = await session.fetchCard("http://localhost:3000/dav/books/default/1.vcf");

    expect(result.vcardText).toBe("BEGIN:VCARD\nFN:Alice\nEND:VCARD");
    expect(result.etag).toBe('"e1"');
  });

  it("finds the card when multiget returns relative + absolute hrefs", async () => {
    const multiget = vi.fn().mockResolvedValue([
      davResp({
        href: "/books/default/1.vcf",
        props: { getetag: '"e1"', addressData: "BEGIN:VCARD\nFN:Alice\nEND:VCARD" },
      }),
      davResp({
        href: "https://other.example.com/foo.vcf",
        props: { getetag: '"e2"', addressData: "BEGIN:VCARD\nFN:Bob\nEND:VCARD" },
      }),
    ]);
    mockCreateDAVClient.mockResolvedValue(mockClient({ addressBookMultiGet: multiget }));

    const session = await createDavSession(AUTH);
    const result = await session.fetchCard("http://localhost:3000/dav/books/default/1.vcf");

    expect(result.vcardText).toBe("BEGIN:VCARD\nFN:Alice\nEND:VCARD");
  });

  it("throws NOT_FOUND when the response lists the card as 404", async () => {
    const multiget = vi
      .fn()
      .mockResolvedValue([
        davResp({ href: "/books/default/1.vcf", status: 404, statusText: "Not Found", ok: false }),
      ]);
    mockCreateDAVClient.mockResolvedValue(mockClient({ addressBookMultiGet: multiget }));

    const session = await createDavSession(AUTH);
    await expect(
      session.fetchCard("http://localhost:3000/dav/books/default/1.vcf"),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("throws NOT_FOUND when no response href matches", async () => {
    const multiget = vi.fn().mockResolvedValue([
      davResp({
        href: "/books/default/2.vcf",
        props: { getetag: '"e2"', addressData: "BEGIN:VCARD\nFN:Bob\nEND:VCARD" },
      }),
    ]);
    mockCreateDAVClient.mockResolvedValue(mockClient({ addressBookMultiGet: multiget }));

    const session = await createDavSession(AUTH);
    await expect(
      session.fetchCard("http://localhost:3000/dav/books/default/1.vcf"),
    ).rejects.toThrow(/Card not found/);
  });
});

// ---------------------------------------------------------------------------
// fetchCards — batched addressBookMultiGet
// ---------------------------------------------------------------------------

describe("fetchCards", () => {
  it("calls addressBookMultiGet once with all objectUrls as path-only URLs", async () => {
    const multiget = vi.fn().mockResolvedValue([
      davResp({
        href: "/books/default/1.vcf",
        props: { getetag: '"e1"', addressData: "VCARD1" },
      }),
      davResp({
        href: "/books/default/2.vcf",
        props: { getetag: '"e2"', addressData: "VCARD2" },
      }),
    ]);
    mockCreateDAVClient.mockResolvedValue(mockClient({ addressBookMultiGet: multiget }));

    const session = await createDavSession(AUTH);
    const results = await session.fetchCards([
      "http://localhost:3000/dav/books/default/1.vcf",
      "http://localhost:3000/dav/books/default/2.vcf",
    ]);

    // Single multiget call with all hrefs as path-only URLs.
    expect(multiget).toHaveBeenCalledTimes(1);
    expect(multiget).toHaveBeenCalledWith({
      url: "http://localhost:3000/dav/books/default/",
      props: { "d:getetag": {}, "card:address-data": {} },
      depth: "1",
      objectUrls: ["/books/default/1.vcf", "/books/default/2.vcf"],
    });
    expect(results).toHaveLength(2);
  });

  it("matches responses out of order (response order != request order)", async () => {
    // Responses come back in reverse order.
    const multiget = vi.fn().mockResolvedValue([
      davResp({
        href: "/books/default/2.vcf",
        props: { getetag: '"e2"', addressData: "VCARD2" },
      }),
      davResp({
        href: "/books/default/1.vcf",
        props: { getetag: '"e1"', addressData: "VCARD1" },
      }),
    ]);
    mockCreateDAVClient.mockResolvedValue(mockClient({ addressBookMultiGet: multiget }));

    const session = await createDavSession(AUTH);
    const results = await session.fetchCards([
      "http://localhost:3000/dav/books/default/1.vcf",
      "http://localhost:3000/dav/books/default/2.vcf",
    ]);

    expect(results).toHaveLength(2);
    // Results are returned in request order.
    expect(results[0]?.href).toBe("http://localhost:3000/dav/books/default/1.vcf");
    expect(results[1]?.href).toBe("http://localhost:3000/dav/books/default/2.vcf");
  });

  it("skips responses missing address-data", async () => {
    const multiget = vi.fn().mockResolvedValue([
      davResp({
        href: "/books/default/1.vcf",
        props: { getetag: '"e1"' }, // no addressData
      }),
      davResp({
        href: "/books/default/2.vcf",
        props: { getetag: '"e2"', addressData: "VCARD2" },
      }),
    ]);
    mockCreateDAVClient.mockResolvedValue(mockClient({ addressBookMultiGet: multiget }));

    const session = await createDavSession(AUTH);
    const results = await session.fetchCards([
      "http://localhost:3000/dav/books/default/1.vcf",
      "http://localhost:3000/dav/books/default/2.vcf",
    ]);

    expect(results).toHaveLength(1);
    expect(results[0]?.href).toBe("http://localhost:3000/dav/books/default/2.vcf");
  });

  it("skips responses missing etag", async () => {
    const multiget = vi.fn().mockResolvedValue([
      davResp({
        href: "/books/default/1.vcf",
        props: { getetag: '"e1"', addressData: "VCARD1" },
      }),
      davResp({
        href: "/books/default/2.vcf",
        props: { addressData: "VCARD2" }, // no getetag
      }),
    ]);
    mockCreateDAVClient.mockResolvedValue(mockClient({ addressBookMultiGet: multiget }));

    const session = await createDavSession(AUTH);
    const results = await session.fetchCards([
      "http://localhost:3000/dav/books/default/1.vcf",
      "http://localhost:3000/dav/books/default/2.vcf",
    ]);

    expect(results).toHaveLength(1);
    expect(results[0]?.href).toBe("http://localhost:3000/dav/books/default/1.vcf");
  });

  it("returns empty array when hrefs is empty (short-circuit)", async () => {
    const multiget = vi.fn();
    mockCreateDAVClient.mockResolvedValue(mockClient({ addressBookMultiGet: multiget }));

    const session = await createDavSession(AUTH);
    const results = await session.fetchCards([]);

    // No call to addressBookMultiGet at all.
    expect(multiget).not.toHaveBeenCalled();
    expect(results).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// updateCard — conditional PUT via davRequest + re-PROPFIND
// ---------------------------------------------------------------------------

describe("updateCard", () => {
  const VCARD = "BEGIN:VCARD\nVERSION:3.0\nFN:Alice\nEND:VCARD\n";
  const CARD_HREF = "http://localhost:3000/dav/books/default/1.vcf";

  it("calls davRequest with PUT, If-Match etag, vcard body, and text/vcard content-type", async () => {
    const davId = vi.fn().mockResolvedValue([davResp({ ok: true, status: 200 })]);
    const pfind = vi
      .fn()
      .mockResolvedValue([
        davResp({ href: "/books/default/1.vcf", props: { getetag: '"new-etag"' } }),
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
        davResp({ href: "/books/default/1.vcf", props: { getetag: '"new-etag"' } }),
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
      .mockResolvedValue([davResp({ href: "/books/default/1.vcf", props: { getetag: '"e"' } })]);
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

  it("throws TOO_LARGE when PUT returns 413, on an update or a creation", async () => {
    const davId = vi
      .fn()
      .mockResolvedValue([davResp({ ok: false, status: 413, statusText: "Payload Too Large" })]);
    mockCreateDAVClient.mockResolvedValue(mockClient({ davRequest: davId }));

    const session = await createDavSession(AUTH);
    const bytes = new TextEncoder().encode(VCARD).length;
    await expect(session.updateCard(CARD_HREF, '"old"', VCARD)).rejects.toMatchObject({
      code: "TOO_LARGE",
      bytes,
    });
    await expect(session.createCard(CARD_HREF, VCARD)).rejects.toMatchObject({
      code: "TOO_LARGE",
      bytes,
    });
  });

  it("leaves a 413 on a DELETE, not a PUT, as unexpected", async () => {
    const davId = vi
      .fn()
      .mockResolvedValue([davResp({ ok: false, status: 413, statusText: "Payload Too Large" })]);
    mockCreateDAVClient.mockResolvedValue(mockClient({ davRequest: davId }));

    const session = await createDavSession(AUTH);
    await expect(session.deleteCard(CARD_HREF, '"old"')).rejects.toMatchObject({
      code: "UNEXPECTED",
    });
  });

  it("reads a lost connection as MAYBE_TOO_LARGE only for a card over 1 MB", async () => {
    const davId = vi.fn().mockRejectedValue(new TypeError("Load failed"));
    mockCreateDAVClient.mockResolvedValue(mockClient({ davRequest: davId }));

    const session = await createDavSession(AUTH);
    const large = VCARD.replace("END:VCARD", `NOTE:${"é".repeat(600_000)}\r\nEND:VCARD`);
    await expect(session.updateCard(CARD_HREF, '"old"', large)).rejects.toMatchObject({
      code: "MAYBE_TOO_LARGE",
      bytes: new TextEncoder().encode(large).length,
    });
    await expect(session.updateCard(CARD_HREF, '"old"', VCARD)).rejects.toMatchObject({
      code: "NETWORK",
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

  it("throws UNEXPECTED with no davRequest call when etag is empty string", async () => {
    const davId = vi.fn();
    mockCreateDAVClient.mockResolvedValue(mockClient({ davRequest: davId }));

    const session = await createDavSession(AUTH);
    await expect(session.updateCard(CARD_HREF, "", VCARD)).rejects.toMatchObject({
      code: "UNEXPECTED",
      message: expect.stringContaining("missing or empty ETag"),
    });
    expect(davId).not.toHaveBeenCalled();
  });

  it("throws UNEXPECTED when davRequest returns an empty multistatus (no response from server)", async () => {
    const davId = vi.fn().mockResolvedValue([]);
    mockCreateDAVClient.mockResolvedValue(mockClient({ davRequest: davId }));

    const session = await createDavSession(AUTH);
    await expect(session.updateCard(CARD_HREF, '"old"', VCARD)).rejects.toMatchObject({
      code: "UNEXPECTED",
      message: expect.stringContaining("no response from server"),
    });
  });

  it("throws UNEXPECTED when re-PROPFIND returns a response without etag", async () => {
    const davId = vi.fn().mockResolvedValue([davResp({ ok: true, status: 200 })]);
    const pfind = vi
      .fn()
      .mockResolvedValue([davResp({ href: "/books/default/1.vcf", props: { getetag: "" } })]);
    mockCreateDAVClient.mockResolvedValue(mockClient({ davRequest: davId, propfind: pfind }));

    const session = await createDavSession(AUTH);
    await expect(session.updateCard(CARD_HREF, '"old"', VCARD)).rejects.toMatchObject({
      code: "UNEXPECTED",
      message: expect.stringContaining("missing an ETag after write"),
    });
  });
});

// ---------------------------------------------------------------------------
// createCard — conditional PUT with If-None-Match: * + re-PROPFIND
// ---------------------------------------------------------------------------

describe("createCard", () => {
  const VCARD = "BEGIN:VCARD\nVERSION:3.0\nFN:Bob\nEND:VCARD\n";
  const CARD_HREF =
    "http://localhost:3000/dav/books/default/00000000-0000-4000-8000-000000000000.vcf";

  it("PUTs the given href with If-None-Match: * and the raw vcard body", async () => {
    const davId = vi.fn().mockResolvedValue([davResp({ ok: true, status: 201 })]);
    const pfind = vi.fn().mockResolvedValue([
      davResp({
        href: "/books/default/00000000-0000-4000-8000-000000000000.vcf",
        props: { getetag: '"e"' },
      }),
    ]);
    mockCreateDAVClient.mockResolvedValue(mockClient({ davRequest: davId, propfind: pfind }));

    const session = await createDavSession(AUTH);
    await session.createCard(CARD_HREF, VCARD);

    expect(davId).toHaveBeenCalledWith({
      url: CARD_HREF,
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
        href: "/books/default/00000000-0000-4000-8000-000000000000.vcf",
        props: { getetag: '"new-e"' },
      }),
    ]);
    mockCreateDAVClient.mockResolvedValue(mockClient({ davRequest: davId, propfind: pfind }));

    const session = await createDavSession(AUTH);
    const result = await session.createCard(CARD_HREF, VCARD);

    expect(result).toEqual({
      href: CARD_HREF,
      etag: '"new-e"',
    });
  });

  it("throws CONFLICT when PUT returns 412", async () => {
    const davId = vi
      .fn()
      .mockResolvedValue([davResp({ ok: false, status: 412, statusText: "Precondition Failed" })]);
    mockCreateDAVClient.mockResolvedValue(mockClient({ davRequest: davId }));

    const session = await createDavSession(AUTH);
    await expect(session.createCard(CARD_HREF, VCARD)).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("throws AUTH when PUT returns 401", async () => {
    const davId = vi
      .fn()
      .mockResolvedValue([davResp({ ok: false, status: 401, statusText: "Unauthorized" })]);
    mockCreateDAVClient.mockResolvedValue(mockClient({ davRequest: davId }));

    const session = await createDavSession(AUTH);
    await expect(session.createCard(CARD_HREF, VCARD)).rejects.toMatchObject({ code: "AUTH" });
  });

  it("throws AUTH when PUT returns 403", async () => {
    const davId = vi
      .fn()
      .mockResolvedValue([davResp({ ok: false, status: 403, statusText: "Forbidden" })]);
    mockCreateDAVClient.mockResolvedValue(mockClient({ davRequest: davId }));

    const session = await createDavSession(AUTH);
    await expect(session.createCard(CARD_HREF, VCARD)).rejects.toMatchObject({ code: "AUTH" });
  });

  it("throws NOT_FOUND when PUT returns 404", async () => {
    const davId = vi
      .fn()
      .mockResolvedValue([davResp({ ok: false, status: 404, statusText: "Not Found" })]);
    mockCreateDAVClient.mockResolvedValue(mockClient({ davRequest: davId }));

    const session = await createDavSession(AUTH);
    await expect(session.createCard(CARD_HREF, VCARD)).rejects.toMatchObject({
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
    await expect(session.createCard(CARD_HREF, VCARD)).rejects.toMatchObject({
      code: "UNEXPECTED",
      message: expect.stringContaining("HTTP 500"),
    });
  });
});

// ---------------------------------------------------------------------------
// deleteCard — conditional DELETE with If-Match
// ---------------------------------------------------------------------------

describe("deleteCard", () => {
  const CARD_HREF = "http://localhost:3000/dav/books/default/1.vcf";

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

  it("throws AUTH when DELETE returns 403", async () => {
    const davId = vi
      .fn()
      .mockResolvedValue([davResp({ ok: false, status: 403, statusText: "Forbidden" })]);
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

  it("throws UNEXPECTED with no davRequest call when etag is empty string", async () => {
    const davId = vi.fn();
    mockCreateDAVClient.mockResolvedValue(mockClient({ davRequest: davId }));

    const session = await createDavSession(AUTH);
    await expect(session.deleteCard(CARD_HREF, "")).rejects.toMatchObject({
      code: "UNEXPECTED",
      message: expect.stringContaining("missing or empty ETag"),
    });
    expect(davId).not.toHaveBeenCalled();
  });
});

describe("write ETag validation", () => {
  it.each([
    "*",
    '"old", "new"',
    'W/"weak"',
    "unquoted",
    ' "spaced" ',
    '"line\nbreak"',
    '"wide\u0100"',
  ])("refuses %j before PUT or DELETE", async (etag) => {
    const client = mockClient();
    mockCreateDAVClient.mockResolvedValue(client);
    const session = await createDavSession(AUTH);
    const href = "http://localhost:3000/dav/books/default/1.vcf";
    await expect(session.updateCard(href, etag, "VCARD")).rejects.toMatchObject({
      code: "UNEXPECTED",
    });
    await expect(session.deleteCard(href, etag)).rejects.toMatchObject({ code: "UNEXPECTED" });
    expect(client.davRequest).not.toHaveBeenCalled();
  });

  it.each(['""', '"*"', '"opaque,tag"', '"opaque\\tag"', '"latin-\u00e9"'])(
    "keeps a single strong tag %j verbatim",
    async (etag) => {
      const propfind = vi
        .fn()
        .mockResolvedValue([davResp({ href: "/books/default/1.vcf", props: { getetag: etag } })]);
      const client = mockClient({ propfind, davRequest: vi.fn().mockResolvedValue([davResp({})]) });
      mockCreateDAVClient.mockResolvedValue(client);
      const session = await createDavSession(AUTH);
      const href = "http://localhost:3000/dav/books/default/1.vcf";
      await session.updateCard(href, etag, "VCARD");
      await session.deleteCard(href, etag);
      expect(
        client.davRequest.mock.calls.map(([request]) => request.init.headers["If-Match"]),
      ).toEqual([etag, etag]);
    },
  );
});
