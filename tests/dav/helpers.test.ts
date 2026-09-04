/**
 * Tests for src/dav/internal.ts helpers in isolation.
 *
 * Tests pure functions (extractEtag, extractAddressData, mapDavError,
 * deriveBookUrl) with realistic tsdav response shapes. No mocks — these are
 * pure functions tested directly via the __testing export.
 */

import type { DAVResponse } from "tsdav";
import { describe, expect, it } from "vitest";
import { __testing } from "@/dav/internal";
import { DavError } from "@/dav/types";

const { extractEtag, extractAddressData, isMemberResponse, mapDavError, deriveBookUrl } = __testing;

/**
 * Create a minimal DAVResponse-like object for testing.
 *
 * Only sets the fields needed by the helper under test. Uses
 * `as unknown as DAVResponse` to avoid `noExplicitAny`.
 */
function resp(props: Record<string, unknown>): DAVResponse {
  return { status: 200, statusText: "OK", ok: true, props } as unknown as DAVResponse;
}

function emptyResp(): DAVResponse {
  return { status: 200, statusText: "OK", ok: true } as unknown as DAVResponse;
}

// ---------------------------------------------------------------------------
// extractEtag
// ---------------------------------------------------------------------------

describe("extractEtag", () => {
  it("returns the etag string when present", () => {
    expect(extractEtag(resp({ getetag: '"abc123"' }))).toBe('"abc123"');
  });

  it("returns undefined when etag is null", () => {
    expect(extractEtag(resp({ getetag: null }))).toBeUndefined();
  });

  it("returns undefined when props is missing", () => {
    expect(extractEtag(emptyResp())).toBeUndefined();
  });

  it("returns undefined when getetag is missing from props", () => {
    expect(extractEtag(resp({}))).toBeUndefined();
  });

  it("coerces number etag to string", () => {
    expect(extractEtag(resp({ getetag: 123 }))).toBe("123");
  });

  it("coerces object etag (from xml-js) to string", () => {
    expect(extractEtag(resp({ getetag: { _text: '"abc"' } }))).toBe("[object Object]");
  });
});

// ---------------------------------------------------------------------------
// extractAddressData
// ---------------------------------------------------------------------------

describe("extractAddressData", () => {
  it("returns plain string addressData", () => {
    expect(extractAddressData(resp({ addressData: "BEGIN:VCARD\nFN:Test\nEND:VCARD" }))).toBe(
      "BEGIN:VCARD\nFN:Test\nEND:VCARD",
    );
  });

  it("returns _cdata content when present (tsdav's CDATA shape)", () => {
    expect(
      extractAddressData(resp({ addressData: { _cdata: "BEGIN:VCARD\nFN:Alice\nEND:VCARD" } })),
    ).toBe("BEGIN:VCARD\nFN:Alice\nEND:VCARD");
  });

  it("returns undefined when addressData is null", () => {
    expect(extractAddressData(resp({ addressData: null }))).toBeUndefined();
  });

  it("returns undefined when props is missing", () => {
    expect(extractAddressData(emptyResp())).toBeUndefined();
  });

  it("returns undefined when addressData is missing from props", () => {
    expect(extractAddressData(resp({}))).toBeUndefined();
  });

  it("returns undefined for object without _cdata", () => {
    expect(extractAddressData(resp({ addressData: { unrelated: "val" } }))).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// deriveBookUrl
// ---------------------------------------------------------------------------

describe("deriveBookUrl", () => {
  it("strips the last path segment from an absolute URL", () => {
    expect(deriveBookUrl("https://dav.example.com/dav/books/default/1.vcf")).toBe(
      "https://dav.example.com/dav/books/default/",
    );
  });

  it("handles multi-segment paths", () => {
    expect(deriveBookUrl("https://example.com/a/b/c/d.vcf")).toBe("https://example.com/a/b/c/");
  });

  it("handles root-level vCard", () => {
    expect(deriveBookUrl("https://example.com/contact.vcf")).toBe("https://example.com/");
  });

  it("preserves trailing slash on bookUrl", () => {
    const result = deriveBookUrl("https://example.com/books/x/1.vcf");
    expect(result).toBe("https://example.com/books/x/");
    expect(result.endsWith("/")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// mapDavError
// ---------------------------------------------------------------------------

/**
 * Assert that a sync function throws a DavError with the expected code
 * and a message containing the expected substring.
 *
 * We catch the error and assert on properties individually because
 * `toThrow(new DavError(...))` fails on invisible differences (cause, stack).
 */
function expectDavError(fn: () => void, expectedCode: string, expectedMessageSubstring: string) {
  let thrown: unknown;
  try {
    fn();
  } catch (e) {
    thrown = e;
  }
  expect(thrown).toBeInstanceOf(DavError);
  if (thrown instanceof DavError) {
    expect(thrown.code).toBe(expectedCode);
    expect(thrown.message).toContain(expectedMessageSubstring);
  }
}

describe("mapDavError", () => {
  it("passes through DavError unchanged", () => {
    const davErr = new DavError("test", "AUTH");
    expectDavError(() => mapDavError(davErr, "ctx"), "AUTH", "test");
    // Also verify it's the same reference
    expect(() => mapDavError(davErr, "ctx")).toThrow(davErr);
  });

  // tsdav real error format: "Collection query failed: 401 Unauthorized. ..."
  describe("status-code-based classification", () => {
    it("401 → AUTH", () => {
      const err = new Error("Collection query failed: 401 Unauthorized. Raw response: ...");
      expectDavError(() => mapDavError(err, "ctx"), "AUTH", "CardDAV authentication failed: ctx");
    });

    it("403 → AUTH", () => {
      const err = new Error("Collection query failed: 403 Forbidden");
      expectDavError(() => mapDavError(err, "ctx"), "AUTH", "CardDAV authentication failed: ctx");
    });

    it("404 → NOT_FOUND", () => {
      const err = new Error("Collection query failed: 404 Not Found");
      expectDavError(() => mapDavError(err, "ctx"), "NOT_FOUND", "CardDAV resource not found: ctx");
    });

    it("unknown 4xx → UNEXPECTED", () => {
      const err = new Error("Collection query failed: 405 Method Not Allowed");
      expectDavError(
        () => mapDavError(err, "ctx"),
        "UNEXPECTED",
        "CardDAV unexpected error: ctx — Collection query failed: 405 Method Not Allowed",
      );
    });
  });

  describe("tsdav credential error", () => {
    it("Invalid credentials message → AUTH", () => {
      const err = new Error(
        "Invalid credentials: PROPFIND https://dav.example.com returned 401 Unauthorized",
      );
      expectDavError(
        () => mapDavError(err, "creating session"),
        "AUTH",
        "CardDAV authentication failed: creating session",
      );
    });
  });

  describe("network errors", () => {
    it("TypeError with 'fetch' → NETWORK", () => {
      const err = new TypeError("fetch failed");
      expectDavError(
        () => mapDavError(err, "listing"),
        "NETWORK",
        "CardDAV network error: listing",
      );
    });

    it("ENOTFOUND → NETWORK", () => {
      const err = new Error("ENOTFOUND dav.example.com");
      expectDavError(
        () => mapDavError(err, "listing"),
        "NETWORK",
        "CardDAV network error: listing",
      );
    });

    it("ECONNREFUSED → NETWORK", () => {
      const err = new Error("ECONNREFUSED 127.0.0.1:80");
      expectDavError(
        () => mapDavError(err, "listing"),
        "NETWORK",
        "CardDAV network error: listing",
      );
    });
  });

  describe("unexpected errors", () => {
    it("programming errors → UNEXPECTED", () => {
      const err = new Error("cannot find homeUrl");
      expectDavError(
        () => mapDavError(err, "discovering"),
        "UNEXPECTED",
        "CardDAV unexpected error: discovering — cannot find homeUrl",
      );
    });

    it("non-Error thrown value → UNEXPECTED", () => {
      expectDavError(
        () => mapDavError("string error", "ctx"),
        "UNEXPECTED",
        "CardDAV unexpected error: ctx — string error",
      );
    });
  });
});

// ---------------------------------------------------------------------------
// isMemberResponse (PROPFIND member filter)
// ---------------------------------------------------------------------------

describe("isMemberResponse", () => {
  it("keeps a vCard member (no resourcetype prop)", () => {
    const resp = { status: 200, statusText: "OK", ok: true } as unknown as DAVResponse;
    expect(isMemberResponse(resp)).toBe(true);
  });

  it("keeps a vCard member with empty-string resourcetype (<d:resourcetype/>)", () => {
    const resp = {
      status: 200,
      statusText: "OK",
      ok: true,
      props: { resourcetype: "" },
    } as unknown as DAVResponse;
    expect(isMemberResponse(resp)).toBe(true);
  });

  it("keeps a vCard member with empty-object resourcetype ({} — no keys)", () => {
    const resp = {
      status: 200,
      statusText: "OK",
      ok: true,
      props: { resourcetype: {} },
    } as unknown as DAVResponse;
    expect(isMemberResponse(resp)).toBe(true);
  });

  it("excludes the collection (resourcetype with keys)", () => {
    const resp = {
      status: 200,
      statusText: "OK",
      ok: true,
      props: { resourcetype: { collection: "", addressbook: "" } },
    } as unknown as DAVResponse;
    expect(isMemberResponse(resp)).toBe(false);
  });

  it("excludes a non-ok response", () => {
    const resp = { status: 404, statusText: "Not Found", ok: false } as unknown as DAVResponse;
    expect(isMemberResponse(resp)).toBe(false);
  });
});
