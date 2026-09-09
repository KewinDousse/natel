/**
 * Internal tsdav adapter.
 *
 * The ONLY file in src/dav/ that imports tsdav. Exports a `createDavSession`
 * function that returns a minimal typed interface over tsdav client operations.
 *
 * Two test seams exist:
 * - tests/dav/dav.test.ts mocks this module (`@/dav/internal`) to exercise the
 *   public API in index.ts.
 * - tests/dav/internal.test.ts mocks tsdav itself (`createDAVClient`) to pin
 *   the exact wire shapes (props, depth, headers, body) sent to tsdav.
 */

import type { DAVAddressBook, DAVResponse } from "tsdav";
import { createDAVClient } from "tsdav";
import { DavError } from "./types";

type DAVClient = Awaited<ReturnType<typeof createDAVClient>>;

// ---------------------------------------------------------------------------
// Props for tsdav calls (ElementCompact inner maps)
//
// tsdav's propfind() wraps the props object inside
//   { propfind: { _attributes: ..., prop: <props> } }
// and addressBookMultiGet() wraps it inside
//   { "addressbook-multiget": { _attributes: ..., "d:prop": <props>, "d:href": <objectUrls> } }
// So we only pass the inner prop map — NOT a full xml-js body.
// Evidence: tsdav@2.3.1 `propfind` (src/request.ts) and `addressBookMultiGet`
// (src/addressBook.ts).
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
// Evidence: tsdav@2.3.1 `davRequest` (src/request.ts).
// ---------------------------------------------------------------------------

/** Extract ETag from a DAVResponse props map. */
function extractEtag(response: DAVResponse): string | undefined {
  const etagProp = response.props?.getetag;
  if (etagProp == null) return undefined;
  if (typeof etagProp === "object") {
    // xml-js compact mode can wrap text in _text / _cdata; a neither case has
    // no ETag value we can trust.
    const inner = etagProp as Record<string, unknown>;
    const cdata = inner._cdata;
    if (cdata != null) {
      const val = String(cdata);
      return val.length > 0 ? val : undefined;
    }
    const text = inner._text;
    if (text != null) {
      const val = String(text);
      return val.length > 0 ? val : undefined;
    }
    return undefined;
  }
  const val = String(etagProp);
  return val.length > 0 ? val : undefined;
}

/**
 * Extract address-data from a DAVResponse props map.
 *
 * tsdav reads this as:
 *   res.props?.addressData?._cdata ?? res.props?.addressData
 * Evidence: tsdav@2.3.1 `fetchVCards` / `smartCollectionSync` (src/addressBook.ts,
 * src/collection.ts).
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
 * Evidence: tsdav@2.3.1 `fetchAddressBooks` (src/addressBook.ts).
 */
export function isMemberResponse(response: DAVResponse): boolean {
  if (!response.ok) return false;
  const rt = response.props?.resourcetype;
  // Has resourcetype with at least one key = a collection, skip it
  if (rt && typeof rt === "object" && Object.keys(rt).length > 0) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Error mapping
//
// tsdav@2.3.1 throws errors with status codes embedded in known formats:
//   "Collection query failed: 401 Unauthorized. Raw response: ..."  (collectionQuery)
//   "Invalid credentials: PROPFIND ... returned 401 Unauthorized"   (fetchPrincipalUrl)
// Network failures surface as native TypeError ("fetch failed", Safari's
// "Load failed"); there is no status in such messages.
// ---------------------------------------------------------------------------

/**
 * Extract an HTTP status code from a tsdav error message, if any.
 *
 * Only the formats tsdav actually emits are recognized, so unrelated "412"
 * digits in a raw response body cannot false-positive.
 */
function extractStatusFromMessage(message: string): number | null {
  const match = message.match(/(?:failed|returned)[ :]+([45]\d{2})/);
  if (match?.[1]) return Number.parseInt(match[1], 10);
  return null;
}

/** Map a thrown tsdav error to our DavError. */
function mapDavError(err: unknown, context: string): never {
  if (err instanceof DavError) throw err;

  const message = err instanceof Error ? err.message : String(err);
  const status = extractStatusFromMessage(message);

  // Browsers (notably Safari) reject failed fetches with a bare TypeError
  // such as "Load failed". Treat any TypeError as a network failure.
  if (err instanceof TypeError) {
    throw new DavError(`CardDAV network error: ${context}`, "NETWORK", err);
  }

  if (status === 412) {
    throw new DavError(
      `CardDAV conflict: ${context} — resource changed on server`,
      "CONFLICT",
      err,
    );
  }
  if (status === 401 || status === 403) {
    throw new DavError(`CardDAV authentication failed: ${context}`, "AUTH", err);
  }
  if (status === 404) {
    throw new DavError(`CardDAV resource not found: ${context}`, "NOT_FOUND", err);
  }
  if (status !== null && status >= 500) {
    throw new DavError(`CardDAV unexpected error: ${context} — HTTP ${status}`, "UNEXPECTED", err);
  }

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
// Write responses
//
// tsdav's PUT/DELETE helpers (createVCard, updateVCard, deleteVCard) build
// the conditional headers from a vCard object, so the exact If-Match /
// If-None-Match values could not be pinned from outside. We therefore go
// through client.davRequest directly with explicit headers. davRequest only
// returns { href, ok, status, statusText, raw } — response headers are
// consumed inside tsdav and never surfaced, so after a successful write the
// fresh ETag must come from a follow-up PROPFIND (ARCHITECTURE.md §Write path).
// Evidence: tsdav@2.3.1 `davRequest` (src/request.ts) returns parsed response
// objects without headers for non-XML bodies.
// ---------------------------------------------------------------------------

/**
 * Throw the right DavError for a non-ok write response.
 *
 * 412 → CONFLICT (the caller decides the conflict UX: it is the queries layer
 * that re-fetches the server version). Other statuses map like reads do.
 */
function assertWriteOk(
  response: DAVResponse | undefined,
  context: string,
): asserts response is DAVResponse {
  if (!response) {
    throw new DavError(
      `CardDAV unexpected error: ${context} — no response from server`,
      "UNEXPECTED",
    );
  }
  if (response.ok) return;
  if (response.status === 412) {
    throw new DavError(
      `CardDAV conflict: ${context} — resource changed on server`,
      "CONFLICT",
      response,
    );
  }
  if (response.status === 401 || response.status === 403) {
    throw new DavError(`CardDAV authentication failed: ${context}`, "AUTH", response);
  }
  if (response.status === 404) {
    throw new DavError(`CardDAV resource not found: ${context}`, "NOT_FOUND", response);
  }
  throw new DavError(
    `CardDAV unexpected error: ${context} — HTTP ${response.status}`,
    "UNEXPECTED",
    response,
  );
}

/**
 * Re-read a card's ETag after a successful write (server may not include it
 * in the PUT/DELETE response, and tsdav never surfaces response headers).
 */
async function fetchFreshEtag(client: DAVClient, href: string): Promise<string> {
  const bookUrl = deriveBookUrl(href);
  const responses = await wrap(
    () =>
      client.propfind({
        url: href,
        props: { "d:getetag": {} },
        depth: "0",
      }),
    `refetching etag for ${href}`,
  );
  const match = findResponseByHref(responses, href, bookUrl);

  // If the response is non-ok (e.g. 404 after deletion, 500 from server),
  // throw a mapped DavError with the status included — mirroring the
  // approach in listMembers for the book response.
  if (match && !match.ok) {
    const status = match.status ?? 0;
    if (status === 404) {
      throw new DavError(`CardDAV resource not found: refetching etag for ${href}`, "NOT_FOUND");
    }
    if (status === 401 || status === 403) {
      throw new DavError(`CardDAV authentication failed: refetching etag for ${href}`, "AUTH");
    }
    throw new DavError(
      `CardDAV unexpected error: refetching etag for ${href} — HTTP ${status}`,
      "UNEXPECTED",
    );
  }

  const etag = match ? extractEtag(match) : undefined;
  if (etag === undefined) {
    throw new DavError(
      `Contact ${href} is missing an ETag after write — data integrity risk`,
      "UNEXPECTED",
    );
  }
  return etag;
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
  /** Update a card with a conditional PUT (If-Match); returns the new etag. */
  updateCard(
    href: string,
    etag: string,
    vcardText: string,
  ): Promise<{ href: string; etag: string }>;
  /** Create a card with a conditional PUT (If-None-Match: *); returns href + etag. */
  createCard(bookHref: string, vcardText: string): Promise<{ href: string; etag: string }>;
  /** Delete a card with a conditional DELETE (If-Match). */
  deleteCard(href: string, etag: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// createDavSession
// ---------------------------------------------------------------------------

/**
 * Session cache keyed on (serverUrl, username) to avoid redundant tsdav
 * discovery across concurrent hook mounts. The password is deliberately
 * excluded from the key (and never persisted outside memory) — AGENTS.md
 * invariant 3.
 * If a session creation fails, the cache entry is evicted so the next caller
 * retries rather than getting a stale rejected promise.
 */

/** Build a session cache key from auth credentials (excludes password). */
function sessionKey(auth: { serverUrl: string; username: string }): string {
  return `${auth.serverUrl}|${auth.username}`;
}
const sessionCache = new Map<string, Promise<DavSession>>();

/**
 * Create (or reuse) a tsdav client session for the given credentials.
 *
 * Credentials are held in the local client object and never stored externally.
 */
export async function createDavSession(auth: {
  serverUrl: string;
  username: string;
  password: string;
}): Promise<DavSession> {
  const key = sessionKey(auth);
  const cached = sessionCache.get(key);
  if (cached) return cached;
  const promise = makeSession(auth).catch((err) => {
    sessionCache.delete(key);
    throw err;
  });
  sessionCache.set(key, promise);
  return promise;
}

async function makeSession(auth: {
  serverUrl: string;
  username: string;
  password: string;
}): Promise<DavSession> {
  const key = sessionKey(auth);
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

  /**
   * Wrap an operation so that if it throws DavError with code AUTH, the
   * session cache entry is evicted. This lets a corrected login get a fresh
   * session without a page reload (MAJOR 1 from task/queries review).
   */
  async function withAuthEviction<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof DavError && err.code === "AUTH") {
        sessionCache.delete(key);
      }
      throw err;
    }
  }

  return {
    async discoverAddressBooks() {
      return withAuthEviction(async () => {
        const books = await wrap(() => client.fetchAddressBooks(), "discovering address books");
        return books.map((b) => ({
          href: b.url,
          displayName: extractDisplayName(b, b.url),
        }));
      });
    },

    async listMembers(bookHref: string) {
      return withAuthEviction(async () => {
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

        // Filter out the collection and non-ok responses.
        // Uses isMemberResponse (exported for testing).
        return responses
          .filter(isMemberResponse)
          .map((r) => ({
            href: r.href ? absolutizeHref(r.href, bookHref) : "",
            etag: extractEtag(r) ?? "",
          }))
          .filter((s) => {
            if (s.href.length === 0) return false;
            // Throw on a missing etag instead of silently dropping the contact:
            // a later conditional write would otherwise be impossible.
            if (s.etag.length === 0) {
              throw new DavError(
                `Contact ${s.href} is missing an ETag — data integrity risk`,
                "UNEXPECTED",
              );
            }
            return true;
          });
      });
    },

    async fetchCard(href: string) {
      return withAuthEviction(async () => {
        // The multiget must run against the parent address book collection;
        // derive it from href by stripping the last path segment.
        const bookUrl = deriveBookUrl(href);

        const responses = await wrap(
          () =>
            client.addressBookMultiGet({
              url: bookUrl,
              props: MULTIGET_PROPS,
              depth: "1",
              // tsdav's fetchVCards sends pathname + search, not the absolute
              // URL — same practice here for the objectUrls.
              objectUrls: [pathnamePlusSearch(href)],
            }),
          `fetching card ${href}`,
        );

        // Match on normalized (absolute) URLs to handle href format differences
        // between PROPFIND (server-relative) and multiget responses.
        const match = findResponseByHref(responses, href, bookUrl);
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
      });
    },

    async updateCard(href: string, etag: string, vcardText: string) {
      return withAuthEviction(async () => {
        // Guards: a falsy/empty etag would be silently stripped by tsdav's
        // cleanupFalsy (tsdav@2.3.1, src/util.ts), making the PUT unconditional and
        // violating the lost-update invariant (AGENTS.md §5). Throw before any
        // davRequest call as a safety net.
        if (!etag) {
          throw new DavError(
            `Cannot update ${href}: missing or empty ETag — conditional write impossible`,
            "UNEXPECTED",
          );
        }
        const responses = await wrap(
          () =>
            client.davRequest({
              url: href,
              init: {
                method: "PUT",
                headers: { "Content-Type": "text/vcard; charset=utf-8", "If-Match": etag },
                body: vcardText,
              },
              convertIncoming: false,
              parseOutgoing: false,
            }),
          `updating card ${href}`,
        );

        assertWriteOk(responses[0], `updating card ${href}`);
        const newEtag = await fetchFreshEtag(client, href);
        return { href, etag: newEtag };
      });
    },

    async createCard(bookHref: string, vcardText: string) {
      return withAuthEviction(async () => {
        const href = absolutizeHref(generateCardFilename(), bookHref);
        const responses = await wrap(
          () =>
            client.davRequest({
              url: href,
              init: {
                method: "PUT",
                headers: { "Content-Type": "text/vcard; charset=utf-8", "If-None-Match": "*" },
                body: vcardText,
              },
              convertIncoming: false,
              parseOutgoing: false,
            }),
          `creating card in ${bookHref}`,
        );

        assertWriteOk(responses[0], `creating card ${href}`);
        const newEtag = await fetchFreshEtag(client, href);
        return { href, etag: newEtag };
      });
    },

    async deleteCard(href: string, etag: string) {
      return withAuthEviction(async () => {
        // Guards: a falsy/empty etag would be silently stripped by tsdav's
        // cleanupFalsy (tsdav@2.3.1, src/util.ts), making the DELETE unconditional and
        // violating the lost-update invariant (AGENTS.md §5). Throw before any
        // davRequest call as a safety net.
        if (!etag) {
          throw new DavError(
            `Cannot delete ${href}: missing or empty ETag — conditional write impossible`,
            "UNEXPECTED",
          );
        }
        const responses = await wrap(
          () =>
            client.davRequest({
              url: href,
              init: {
                method: "DELETE",
                headers: { "If-Match": etag },
                body: undefined,
              },
              convertIncoming: false,
              parseOutgoing: false,
            }),
          `deleting card ${href}`,
        );

        assertWriteOk(responses[0], `deleting card ${href}`);
      });
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolve an href against a base, mapping malformed input to a DavError
 * instead of a raw TypeError from `new URL`.
 */
function absolutizeHref(href: string, base: string): string {
  try {
    return new URL(href, base).href;
  } catch {
    throw new DavError(`Invalid DAV href ${href} against base ${base}`, "UNEXPECTED");
  }
}

/** Path + query of a URL, as tsdav's fetchVCards uses for multiget objectUrls. */
function pathnamePlusSearch(href: string): string {
  const url = new URL(href);
  return `${url.pathname}${url.search}`;
}

/**
 * Find the DAVResponse whose href resolves to the given absolute URL.
 *
 * Handles servers returning relative vs absolute hrefs.
 */
function findResponseByHref(
  responses: DAVResponse[],
  href: string,
  baseUrl: string,
): DAVResponse | undefined {
  return responses.find((r) => {
    if (!r.href) return false;
    try {
      return new URL(r.href, baseUrl).href === new URL(href).href;
    } catch {
      return false;
    }
  });
}

/**
 * Derive the parent collection (address book) URL from a vCard's href.
 *
 * Strips the last path segment. Assumes the vCard is a direct child of the
 * address book collection. Maps malformed input to a DavError.
 */
function deriveBookUrl(href: string): string {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    throw new DavError(`Invalid card href: ${href}`, "UNEXPECTED");
  }
  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length > 0) segments.pop(); // remove vCard filename
  url.pathname = segments.length > 0 ? `/${segments.join("/")}/` : "/";
  return url.toString();
}

/**
 * Generate a unique vCard filename for creation (RFC 6352 PUT to a new href).
 *
 * Prefers crypto.randomUUID (secure contexts, Node ≥ 19); non-secure
 * browsers expose getRandomValues but not randomUUID, so fall back to that.
 */
function generateCardFilename(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${crypto.randomUUID()}.vcf`;
  }
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    return `${hex}.vcf`;
  }
  // Last resort: Math.random (non-cryptographic, but avoids a hard crash).
  // In practice every modern browser and Node.js has crypto.getRandomValues.
  const fallback = Math.random().toString(36).slice(2, 10);
  return `${fallback}.vcf`;
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
  /** Clear the in-memory session cache (needed between tests with mocked tsdav). */
  clearSessionCache(): void {
    sessionCache.clear();
  },
};
