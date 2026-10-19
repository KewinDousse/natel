/**
 * CardDAV stand-in for the demo build (ADR 025): the same API as
 * src/dav/index.ts, over address books kept in memory for this tab. The
 * demo build aliases `@/dav` to this module; the normal build never sees it.
 *
 * Writes check ETags as a server would, and every call waits a little so
 * loading states show as they do against a real server. A reload brings the
 * seed back; signing out and in again keeps what was edited.
 */

import { DEMO_BOOKS } from "./demo-seed";
import type {
  DavAddressBook,
  DavAuth,
  DavContactDetail,
  DavContactSummary,
  DavCredentials,
} from "./types";
import { DavError } from "./types";

// Only the demo bundle holds this origin: CI checks the normal build doesn't.
const ORIGIN = "https://demo.natel.invalid";
const DELAY_MS = 150;

type StoredCard = { vcardText: string; etag: string };
type Book = { href: string; displayName: string; cards: Map<string, StoredCard> };

let books: Book[] | null = null;
let version = 0;

function nextEtag(): string {
  version += 1;
  return `"demo-${version}"`;
}

function store(): Book[] {
  if (books === null) {
    books = DEMO_BOOKS.map((book) => {
      const href = `${ORIGIN}/books/${book.slug}/`;
      const cards = new Map<string, StoredCard>();
      for (const [uid, vcardText] of Object.entries(book.cards)) {
        cards.set(cardHref(href, uid), { vcardText, etag: nextEtag() });
      }
      return { href, displayName: book.displayName, cards };
    });
  }
  return books;
}

function wait(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, DELAY_MS));
}

function bookOf(href: string): Book | undefined {
  return store().find((book) => href.startsWith(book.href));
}

function cardAt(href: string): StoredCard {
  const card = bookOf(href)?.cards.get(href);
  if (!card) throw new DavError(`CardDAV resource not found: ${href}`, "NOT_FOUND");
  return card;
}

export async function discoverAddressBooks(_auth: DavAuth): Promise<DavAddressBook[]> {
  await wait();
  return store().map(({ href, displayName }) => ({ href, displayName }));
}

export async function listContacts(_auth: DavAuth, bookHref: string): Promise<DavContactSummary[]> {
  await wait();
  const book = store().find((candidate) => candidate.href === bookHref);
  if (!book) throw new DavError(`CardDAV resource not found: ${bookHref}`, "NOT_FOUND");
  return [...book.cards].map(([href, { etag }]) => ({ href, etag }));
}

export async function fetchCard(_auth: DavAuth, href: string): Promise<DavContactDetail> {
  await wait();
  const { vcardText, etag } = cardAt(href);
  return { href, etag, vcardText };
}

export async function fetchCards(_auth: DavAuth, hrefs: string[]): Promise<DavContactDetail[]> {
  await wait();
  return hrefs.flatMap((href) => {
    const card = bookOf(href)?.cards.get(href);
    return card ? [{ href, etag: card.etag, vcardText: card.vcardText }] : [];
  });
}

export async function updateCard(
  _auth: DavAuth,
  href: string,
  etag: string,
  vcardText: string,
): Promise<DavContactDetail> {
  await wait();
  const card = cardAt(href);
  if (card.etag !== etag) {
    throw new DavError(`Precondition failed for ${href}`, "CONFLICT");
  }
  const updated = { vcardText, etag: nextEtag() };
  bookOf(href)?.cards.set(href, updated);
  return { href, ...updated };
}

export function cardHref(bookHref: string, uid: string): string {
  return new URL(`${encodeURIComponent(uid)}.vcf`, bookHref).href;
}

export async function createCard(
  _auth: DavAuth,
  href: string,
  vcardText: string,
): Promise<DavContactDetail> {
  await wait();
  const book = bookOf(href);
  if (!book) throw new DavError(`CardDAV resource not found: ${href}`, "NOT_FOUND");
  if (book.cards.has(href)) throw new DavError(`Precondition failed for ${href}`, "CONFLICT");
  const etag = nextEtag();
  book.cards.set(href, { vcardText, etag });
  return { href, etag, vcardText };
}

export async function deleteCard(_auth: DavAuth, href: string, etag: string): Promise<void> {
  await wait();
  const card = cardAt(href);
  if (card.etag !== etag) {
    throw new DavError(`Precondition failed for ${href}`, "CONFLICT");
  }
  bookOf(href)?.cards.delete(href);
}

/** Any credentials sign in. Nothing reaches a server. */
export async function openSession({ username }: DavCredentials): Promise<DavAuth> {
  await wait();
  return { username };
}

/** A reload signs out, as it brings the seed back. */
export async function currentSession(): Promise<DavAuth | null> {
  return null;
}

export async function closeSession(): Promise<boolean> {
  return true;
}

/** Nothing to clear: the books stay as edited until the page reloads. */
export function clearCachedDavSessions(): void {}

/** Back to the seed, for tests. */
export function resetDemoBooks(): void {
  books = null;
}

export type {
  DavAddressBook,
  DavAuth,
  DavContactDetail,
  DavContactSummary,
  DavCredentials,
} from "./types";
export { DavError };
