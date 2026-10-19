/**
 * CardDAV client — public API.
 *
 * Wraps tsdav via src/dav/internal.ts. The ONLY entry point for UI/query code
 * to make CardDAV requests. Returns raw vCard text + href + ETag; parsing is
 * the caller's job (src/vcard).
 *
 * All functions take the signed-in user as an explicit argument. Requests
 * carry the session cookie, never the password (src/dav/session.ts).
 *
 * All write operations are conditional (If-Match / If-None-Match: *) and throw
 * DavError with code CONFLICT on HTTP 412. The queries layer handles the
 * conflict UX — this module never auto-retries or auto-merges.
 */

import { absolutizeHref, clearCachedDavSessions, createDavSession } from "./internal";
import type { DavAddressBook, DavAuth, DavContactDetail, DavContactSummary } from "./types";
import { DavError } from "./types";

/**
 * Discover all address books for the given principal.
 *
 * Throws DavError on network/auth failures.
 */
export async function discoverAddressBooks(auth: DavAuth): Promise<DavAddressBook[]> {
  const session = await createDavSession(auth);
  return await session.discoverAddressBooks();
}

/**
 * List all contacts in a given address book (href + etag only).
 *
 * `bookHref` is the address book URL as returned by `discoverAddressBooks`.
 * Throws DavError on network/auth failures.
 */
export async function listContacts(auth: DavAuth, bookHref: string): Promise<DavContactSummary[]> {
  const session = await createDavSession(auth);
  return await session.listMembers(bookHref);
}

/**
 * Fetch a single vCard by its resource URL.
 *
 * Returns the raw vCard text along with its ETag. The caller should pass the
 * text to src/vcard/parse() for structured access.
 * Throws DavError on network/auth/not-found failures.
 */
export async function fetchCard(auth: DavAuth, href: string): Promise<DavContactDetail> {
  const session = await createDavSession(auth);
  const { vcardText, etag } = await session.fetchCard(href);
  return { href, etag, vcardText };
}

/**
 * Fetch multiple vCards in a single addressbook-multiget REPORT.
 *
 * Returns only the hrefs that were successfully fetched; any missing or
 * unparseable responses are silently omitted (the caller can compare with
 * the requested hrefs to surface partial-load warnings).
 */
export async function fetchCards(auth: DavAuth, hrefs: string[]): Promise<DavContactDetail[]> {
  const session = await createDavSession(auth);
  return await session.fetchCards(hrefs);
}

/**
 * Update an existing card with a conditional PUT.
 *
 * `etag` must be the last-known ETag (from fetchCard / listContacts). On HTTP
 * 412 the server version has changed — throws DavError with code CONFLICT.
 * Returns the version the write left, whose text may not be the one sent.
 */
export async function updateCard(
  auth: DavAuth,
  href: string,
  etag: string,
  vcardText: string,
): Promise<DavContactDetail> {
  const session = await createDavSession(auth);
  return await session.updateCard(href, etag, vcardText);
}

/**
 * The href a new card with this UID gets in a book: `<uid>.vcf`. Naming the
 * resource after the UID makes a retried create land on the same href.
 */
export function cardHref(bookHref: string, uid: string): string {
  return absolutizeHref(`${encodeURIComponent(uid)}.vcf`, bookHref);
}

/**
 * Create a new card at `href` (see cardHref) with PUT and If-None-Match: *.
 *
 * On HTTP 412 something already exists there — throws DavError with code
 * CONFLICT. Returns the version created, as updateCard does.
 */
export async function createCard(
  auth: DavAuth,
  href: string,
  vcardText: string,
): Promise<DavContactDetail> {
  const session = await createDavSession(auth);
  return await session.createCard(href, vcardText);
}

/**
 * Delete a card with a conditional DELETE.
 *
 * `etag` must be the last-known ETag. On HTTP 412 the server version has
 * changed — throws DavError with code CONFLICT.
 */
export async function deleteCard(auth: DavAuth, href: string, etag: string): Promise<void> {
  const session = await createDavSession(auth);
  return await session.deleteCard(href, etag);
}

export { closeSession, currentSession, openSession } from "./session";
export type {
  DavAddressBook,
  DavAuth,
  DavContactDetail,
  DavContactSummary,
  DavCredentials,
} from "./types";
export { clearCachedDavSessions, DavError };
