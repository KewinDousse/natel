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
// Minimal XML builders (xml-js ElementCompact)
// ---------------------------------------------------------------------------

/** PROPFIND body requesting getetag + resourcetype (for listing contacts). */
const PROPFIND_LIST_PROPS = {
  propfind: {
    _attributes: { xmlns: "DAV:" },
    prop: { getetag: {}, resourcetype: {} },
  },
};

/** addressbook-multiget REPORT body requesting getetag + address-data. */
function multigetProps(objectUrls: string[]) {
  return {
    "card:addressbook-multiget": {
      _attributes: {
        "xmlns:card": "urn:ietf:params:xml:ns:carddav",
        xmlns: "DAV:",
      },
      prop: { getetag: {}, "card:address-data": {} },
      href: objectUrls.map((u) => ({ _text: u })),
    },
  };
}

// ---------------------------------------------------------------------------
// Response parsing helpers
// ---------------------------------------------------------------------------

/** Extract ETag from a DAVResponse props map. */
function extractEtag(response: DAVResponse): string | undefined {
  const etagProp = response.props?.getetag as { value: string } | string | undefined;
  if (!etagProp) return undefined;
  if (typeof etagProp === "object" && "value" in etagProp) return etagProp.value;
  return String(etagProp);
}

/** Extract address-data from a DAVResponse props map. */
function extractAddressData(response: DAVResponse): string | undefined {
  const dataProp = response.props?.["card:address-data"] as { value: string } | string | undefined;
  if (!dataProp) return undefined;
  if (typeof dataProp === "object" && "value" in dataProp) return dataProp.value;
  return String(dataProp);
}

/** Extract displayname from a DAVAddressBook, returning href as fallback. */
function extractDisplayName(book: DAVAddressBook, fallback: string): string {
  const dn = book.displayName;
  if (typeof dn === "string" && dn.length > 0) return dn;
  return fallback;
}

// ---------------------------------------------------------------------------
// Error mapping
// ---------------------------------------------------------------------------

/** Map a thrown tsdav error to our DavError. */
function mapDavError(err: unknown, context: string): never {
  if (err instanceof DavError) throw err;

  const message = err instanceof Error ? err.message : String(err);

  if (message.includes("401") || message.includes("Unauthorized") || message.includes("auth")) {
    throw new DavError(`CardDAV authentication failed: ${context}`, "AUTH", err);
  }
  if (message.includes("404") || message.includes("Not Found")) {
    throw new DavError(`CardDAV resource not found: ${context}`, "NOT_FOUND", err);
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
            props: PROPFIND_LIST_PROPS,
            depth: "1",
          }),
        `listing contacts in ${bookHref}`,
      );

      // Filter out the collection itself (status !== 200 or resourcetype
      // indicates a collection) and any non-200 responses.
      return responses
        .filter((r) => {
          if (!r.ok && r.status !== 200) return false;
          const rt = r.props?.resourcetype;
          if (!rt) return true; // no resourcetype = not a collection
          return false; // has resourcetype = it is a collection (the book itself)
        })
        .map((r) => ({
          href: r.href ?? "",
          etag: extractEtag(r) ?? "",
        }))
        .filter((s) => s.href.length > 0 && s.etag.length > 0);
    },

    async fetchCard(href: string) {
      // We need the parent address book URL to use addressBookMultiGet.
      // Derive it from href: strip the last path segment.
      const bookUrl = deriveBookUrl(href);

      const responses = await wrap(
        () =>
          client.addressBookMultiGet({
            url: bookUrl,
            props: multigetProps([href]),
            depth: "1",
            objectUrls: [href],
          }),
        `fetching card ${href}`,
      );

      const match = responses.find((r) => r.href === href || r.href === href.replace(/\/+$/, ""));
      if (!match) {
        throw new DavError(`Card not found at ${href}`, "NOT_FOUND");
      }

      const vcardText = extractAddressData(match) ?? "";
      const etag = extractEtag(match) ?? "";

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
