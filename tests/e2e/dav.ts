/**
 * Direct CardDAV access for e2e tests: seeds and inspects the server behind
 * the app's back, e.g. to change a card while the app is editing it.
 */

import { DAV_URL, PASSWORD, SERVER, USER } from "./env";

export const BOOK_PATH = `${SERVER.home}contacts/`;

const AUTH = `Basic ${btoa(`${USER}:${PASSWORD}`)}`;

async function dav(method: string, path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", AUTH);
  return fetch(new URL(path, DAV_URL), { ...init, method, headers });
}

function expectStatus(res: Response, allowed: number[], what: string): void {
  if (!allowed.includes(res.status)) {
    throw new Error(`${what}: unexpected HTTP ${res.status}`);
  }
}

/** A second book some tests add; every reset removes it again. */
export const EXTRA_BOOK_PATH = `${SERVER.home}extra/`;

/** Creates an empty address book at `path`. */
export async function createBook(path: string, displayName: string): Promise<void> {
  const body = `<?xml version="1.0" encoding="utf-8"?>
<mkcol xmlns="DAV:" xmlns:CR="urn:ietf:params:xml:ns:carddav">
  <set><prop>
    <resourcetype><collection/><CR:addressbook/></resourcetype>
    <displayname>${displayName}</displayname>
  </prop></set>
</mkcol>`;
  expectStatus(
    await dav("MKCOL", path, {
      headers: { "Content-Type": "application/xml; charset=utf-8" },
      body,
    }),
    [201],
    `create book ${path}`,
  );
}

/** Deletes the test address books if present and creates the main one empty. */
export async function resetBook(): Promise<void> {
  // Radicale creates the home on the user's first request.
  expectStatus(await dav("PROPFIND", SERVER.home, { headers: { Depth: "0" } }), [207], "home");
  expectStatus(await dav("DELETE", EXTRA_BOOK_PATH), [200, 204, 404], "delete extra book");
  expectStatus(await dav("DELETE", BOOK_PATH), [200, 204, 404], "delete book");
  await createBook(BOOK_PATH, "Contacts");
}

/** Writes a card at `<book>/<uid>.vcf`, creating or replacing it. */
export async function putCard(uid: string, vcard: string): Promise<void> {
  const res = await dav("PUT", `${BOOK_PATH}${uid}.vcf`, {
    headers: { "Content-Type": "text/vcard; charset=utf-8" },
    body: vcard,
  });
  expectStatus(res, [201, 204], `put ${uid}`);
}

/** Deletes a card, as another client would. */
export async function deleteCard(uid: string, book = BOOK_PATH): Promise<void> {
  expectStatus(await dav("DELETE", `${book}${uid}.vcf`), [200, 204], `delete ${uid}`);
}

/** Reads a card's body, or null when it does not exist. */
export async function getCard(uid: string, book = BOOK_PATH): Promise<string | null> {
  const res = await dav("GET", `${book}${uid}.vcf`);
  if (res.status === 404) return null;
  expectStatus(res, [200], `get ${uid}`);
  return res.text();
}

/** Lists the bodies of every card in the book. */
export async function listCards(): Promise<string[]> {
  const res = await dav("PROPFIND", BOOK_PATH, { headers: { Depth: "1" } });
  expectStatus(res, [207], "list book");
  const xml = await res.text();
  const hrefs = [...xml.matchAll(/<(?:\w+:)?href>([^<]+\.vcf)<\/(?:\w+:)?href>/g)].map(
    (m) => m[1] ?? "",
  );
  const bodies: string[] = [];
  for (const href of hrefs) {
    const card = await dav("GET", href);
    expectStatus(card, [200], `get ${href}`);
    bodies.push(await card.text());
  }
  return bodies;
}

/** Builds a vCard 3.0 with CRLF line endings, as servers store them. */
export function vcard(lines: string[]): string {
  return `${["BEGIN:VCARD", "VERSION:3.0", ...lines, "END:VCARD"].join("\r\n")}\r\n`;
}
