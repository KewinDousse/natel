/**
 * CardDAV client — public API.
 *
 * Wraps tsdav via src/dav/internal.ts. The ONLY entry point for UI/query code
 * to make CardDAV requests. Returns raw vCard text + href + ETag; parsing is
 * the caller's job (src/vcard).
 *
 * All functions take credentials as explicit arguments (no ambient state).
 * Credentials are never stored outside the function scope.
 */

import { createDavSession } from "./internal";
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

export type { DavAddressBook, DavAuth, DavContactDetail, DavContactSummary } from "./types";
export { DavError };
