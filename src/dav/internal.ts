/**
 * Internal tsdav adapter.
 *
 * The ONLY file in src/dav/ that imports tsdav. Exports a `createDavSession`
 * function that returns a minimal typed interface over tsdav client operations.
 *
 * This module is the dependency-injection seam for unit tests: tests stub
 * the exported functions via `vi.mock` rather than mocking tsdav directly.
 */

import type { DAVAddressBook, DAVResponse } from "tsdav";
import { createDAVClient } from "tsdav";
import { DavError } from "./types";

// ---------------------------------------------------------------------------
// Props for tsdav calls (ElementCompact inner maps)
//
// tsdav's propfind() wraps the props object inside
//   { propfind: { _attributes: ..., prop: <props> } }
// and addressBookMultiGet() wraps it inside
//   { "addressbook-multiget": { _attributes: ..., "d:prop": <props>, "d:href": <objectUrls> } }
// So we only pass the inner prop map — NOT a full xml-js body.
// Evidence: node_modules/tsdav/dist/tsdav.js lines 2662-2686 (propfind),
//           3018-3033 (addressBookMultiGet), 3095-3101 (fetchVCards example).
// ---------------------------------------------------------------------------

/** Props for PROPFIND listing members (getetag + resourcetype). */
const PROPFIND_MEMBER_PROPS = {
  "d:getetag": {},
  "d:resourcetype": {},
};

/** Props for addressbook-multiget (getetag + address-data). */
const MULTIGET_PROPS = {
  "d:getetag": {},
  "card:address-data": {},
};

// ---------------------------------------------------------------------------
// Response parsing helpers
//
// tsdav parses XML with elementNameFn:
//   (name) => camelCase(name.replace(/^.+:/, ""))
// so "d:getetag" → "getetag", "card:address-data" → "addressData".
// Evidence: node_modules/tsdav/dist/tsdav.js line 2610.
// ---------------------------------------------------------------------------

/** Extract ETag from a DAVResponse props map. */
function extractEtag(response: DAVResponse): string | undefined {
  const etagProp = response.props?.getetag;
  if (etagProp == null) return undefined;
  return String(etagProp);
}

/**
 * Extract address-data from a DAVResponse props map.
 *
 * tsdav reads this as:
 *   res.props?.addressData?._cdata ?? res.props?.addressData
 * Evidence: node_modules/tsdav/dist/tsdav.js line 3121.
 */
function extractAddressData(response: DAVResponse): string | undefined {
  const dataProp = response.props?.addressData;
  if (dataProp == null) return undefined;
  if (typeof dataProp === "object" && "_cdata" in dataProp) {
    return String((dataProp as Record<string, unknown>)._cdata);
  }
  if (typeof dataProp !== "object") return String(dataProp);
  return undefined;
}

/** Extract displayname from a DAVAddressBook, returning href as fallback. */
function extractDisplayName(book: DAVAddressBook, fallback: string): string {
  const dn = book.displayName;
  if (typeof dn === "string" && dn.length > 0) return dn;
  return fallback;
}

/**
 * Predicate that filters a PROPFIND response array to keep only individual
 * member (vCard) entries, excluding the collection itself and non-ok entries.
 *
 * tsdav checks resourcetype by Object.keys: a collection has keys
 * (e.g. { collection: '', addressbook: '' }), a member has none.
 * Evidence: node_modules/tsdav/dist/tsdav.js lines 3054, 3084-3093.
 */
export function isMemberResponse(response: DAVResponse): boolean {
  if (!response.ok && response.status !== 200) return false;
  const rt = response.props?.resourcetype;
  // Has resourcetype with at least one key = a collection, skip it
  if (rt && typeof rt === "object" && Object.keys(rt).length > 0) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Error mapping
//
// tsdav throws errors with numeric status codes in messages:
//   "Collection query failed: 401 Unauthorized. Raw response: ..."
//   "Invalid credentials: PROPFIND ... returned 401 Unauthorized"
// Evidence: node_modules/tsdav/dist/tsdav.js lines 2776-2777, 3637.
// Network errors are native TypeError with messages like "fetch failed".
// ---------------------------------------------------------------------------

/** Extract a 3-digit HTTP status code from an error message, if any. */
function extractStatusFromMessage(message: string): number | null {
  const match = message.match(/\b(4\d{2})\b/);
  if (match?.[1]) return Number.parseInt(match[1], 10);
  return null;
}

/** Map a thrown tsdav error to our DavError. */
function mapDavError(err: unknown, context: string): never {
  if (err instanceof DavError) throw err;

  const message = err instanceof Error ? err.message : String(err);
  const status = extractStatusFromMessage(message);

  if (status === 401 || status === 403) {
    throw new DavError(`CardDAV authentication failed: ${context}`, "AUTH", err);
  }
  if (status === 404) {
    throw new DavError(`CardDAV resource not found: ${context}`, "NOT_FOUND", err);
  }

  // Network errors (native fetch TypeError or custom)
  if (
    message.includes("fetch") ||
    message.includes("network") ||
    message.includes("ENOTFOUND") ||
    message.includes("ECONNREFUSED") ||
    message.includes("NetworkError")
  ) {
    throw new DavError(`CardDAV network error: ${context}`, "NETWORK", err);
  }

  throw new DavError(`CardDAV unexpected error: ${context} — ${message}`, "UNEXPECTED", err);
}

/** Promise wrapper that catches raw tsdav errors and maps them. */
async function wrap<T>(fn: () => Promise<T>, context: string): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    return mapDavError(err, context);
  }
}

// ---------------------------------------------------------------------------
// Public types for the adapter
// ---------------------------------------------------------------------------

export interface DavSession {
  /** Discover all address books for the current principal. */
  discoverAddressBooks(): Promise<Array<{ href: string; displayName: string }>>;
  /** List vCard members of an address book (href + etag, no body). */
  listMembers(bookHref: string): Promise<Array<{ href: string; etag: string }>>;
  /** Fetch a single vCard body by href, returning text + etag. */
  fetchCard(href: string): Promise<{ vcardText: string; etag: string }>;
}

// ---------------------------------------------------------------------------
// createDavSession
// ---------------------------------------------------------------------------

/**
 * Create a tsdav client session for the given credentials.
 *
 * Credentials are held in the local client object and never stored externally.
 */
export async function createDavSession(auth: {
  serverUrl: string;
  username: string;
  password: string;
}): Promise<DavSession> {
  const client = await wrap(
    () =>
      createDAVClient({
        serverUrl: auth.serverUrl,
        credentials: { username: auth.username, password: auth.password },
        authMethod: "Basic",
        defaultAccountType: "carddav",
      }),
    "creating session",
  );

  return {
    async discoverAddressBooks() {
      const books = await wrap(() => client.fetchAddressBooks(), "discovering address books");
      return books.map((b) => ({
        href: b.url,
        displayName: extractDisplayName(b, b.url),
      }));
    },

    async listMembers(bookHref: string) {
      const responses = await wrap(
        () =>
          client.propfind({
            url: bookHref,
            props: PROPFIND_MEMBER_PROPS,
            depth: "1",
          }),
        `listing contacts in ${bookHref}`,
      );

      // Check that the book itself was found (first response is the collection).
      const bookResponse = responses[0];
      if (!bookResponse?.ok) {
        const status = bookResponse?.status ?? 0;
        if (status === 404) {
          throw new DavError(`Address book not found: ${bookHref}`, "NOT_FOUND");
        }
        if (status === 401 || status === 403) {
          throw new DavError(
            `CardDAV authentication failed: listing contacts in ${bookHref}`,
            "AUTH",
          );
        }
        throw new DavError(
          `CardDAV unexpected error: listing contacts in ${bookHref} — HTTP ${status}`,
          "UNEXPECTED",
        );
      }

      // Filter out the collection and non-200 responses.
      // Uses isMemberResponse (exported for testing).
      return responses
        .filter(isMemberResponse)
        .map((r) => ({
          href: r.href ? new URL(r.href, bookHref).href : "",
          etag: extractEtag(r) ?? "",
        }))
        .filter((s) => {
          if (s.href.length === 0) return false;
          // MAJOR 2: throw on missing etag instead of silently dropping
          if (s.etag.length === 0) {
            throw new DavError(
              `Contact ${s.href} is missing an ETag — data integrity risk`,
              "UNEXPECTED",
            );
          }
          return true;
        });
    },

    async fetchCard(href: string) {
      // We need the parent address book URL to use addressBookMultiGet.
      // Derive it from href: strip the last path segment.
      const bookUrl = deriveBookUrl(href);

      const responses = await wrap(
        () =>
          client.addressBookMultiGet({
            url: bookUrl,
            props: MULTIGET_PROPS,
            depth: "1",
            objectUrls: [href],
          }),
        `fetching card ${href}`,
      );

      // Match on normalized (absolute) URLs to handle href format differences
      // between PROPFIND (server-relative) and multiget responses.
      // Evidence: node_modules/tsdav/dist/tsdav.js lines 3059, 3090, 3119.
      const match = responses.find((r) => {
        if (!r.href) return false;
        try {
          return new URL(r.href, bookUrl).href === new URL(href).href;
        } catch {
          return false;
        }
      });
      if (!match) {
        throw new DavError(`Card not found at ${href}`, "NOT_FOUND");
      }

      const vcardText = extractAddressData(match);
      if (vcardText === undefined) {
        throw new DavError(`Contact ${href} has no address-data in response`, "UNEXPECTED");
      }
      const etag = extractEtag(match);
      if (etag === undefined) {
        throw new DavError(
          `Contact ${href} is missing an ETag — data integrity risk`,
          "UNEXPECTED",
        );
      }

      return { vcardText, etag };
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Derive the parent collection (address book) URL from a vCard's href.
 *
 * Strips the last path segment. Assumes the vCard is a direct child of the
 * address book collection.
 */
function deriveBookUrl(href: string): string {
  const url = new URL(href);
  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length > 0) segments.pop(); // remove vCard filename
  url.pathname = segments.length > 0 ? `/${segments.join("/")}/` : "/";
  return url.toString();
}

// ---------------------------------------------------------------------------
// Test-only exports
// ---------------------------------------------------------------------------

/** Exported for unit testing only — not part of the public API. */
export const __testing = {
  extractEtag,
  extractAddressData,
  isMemberResponse,
  mapDavError,
  deriveBookUrl,
  PROPFIND_MEMBER_PROPS,
  MULTIGET_PROPS,
};
