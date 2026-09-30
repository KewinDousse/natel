/**
 * Import of a .vcf file into an address book (ADR 020): each card is created
 * as its original text with If-None-Match: * at `<uid>.vcf`, one after the
 * other. A card whose UID the book already has is skipped, a failure doesn't
 * stop the rest, and nothing is undone.
 */
import { cardHref, createCard } from "@/dav";
import { type DavAuth, DavError } from "@/dav/types";
import type { Contact } from "@/model/contact";
import { newUid, parse, readImportCard, splitCards, withUid } from "@/vcard";

export type ImportFailureReason = "unreadable" | "duplicate" | "conflict" | "refused" | "network";

/** A failed card, named by its FN or N, else by its place in the file (1-based). */
export type ImportFailure = { name: string; position: number; reason: ImportFailureReason };

export type ImportResult = { imported: number; existing: number; failed: ImportFailure[] };

/** The file holds no card: an error, not three zeros. */
export class EmptyImportError extends Error {
  constructor() {
    super("no vCard in the file");
    this.name = "EmptyImportError";
  }
}

export type ImportCallbacks = {
  /** Called once the cards are counted, then after each card. */
  onProgress: (done: number, total: number) => void;
  /**
   * Called with each card once created, so the list can show it at once;
   * `contact` is null for a card the list can't parse, which only shows
   * after a reload but is in the book all the same.
   */
  onCreated: (uid: string, contact: Contact | null) => void;
};

export async function importVcf(
  auth: DavAuth,
  bookHref: string,
  fileText: string,
  bookUids: ReadonlySet<string>,
  { onProgress, onCreated }: ImportCallbacks,
): Promise<ImportResult> {
  const cards = splitCards(fileText);
  if (cards.length === 0) throw new EmptyImportError();

  const known = new Set(bookUids);
  const seenInFile = new Set<string>();
  const result: ImportResult = { imported: 0, existing: 0, failed: [] };
  onProgress(0, cards.length);

  for (const [index, card] of cards.entries()) {
    const position = index + 1;
    let read: { uid: string | null; name: string };
    try {
      read = readImportCard(card);
    } catch {
      read = { uid: "", name: "" };
    }
    // A blank UID can't name the card's resource, and a second UID line
    // would make the card invalid: such a card is as unreadable as a broken one.
    if (read.uid !== null && read.uid.trim() === "") {
      result.failed.push({ name: read.name, position, reason: "unreadable" });
      onProgress(position, cards.length);
      continue;
    }

    const uid = read.uid ?? newUid();
    const text = read.uid === null ? withUid(card, uid) : card;
    if (seenInFile.has(uid)) {
      result.failed.push({ name: read.name, position, reason: "duplicate" });
    } else if (known.has(uid)) {
      seenInFile.add(uid);
      result.existing += 1;
    } else {
      seenInFile.add(uid);
      try {
        const { href, etag } = await createCard(auth, cardHref(bookHref, uid), text);
        known.add(uid);
        result.imported += 1;
        onCreated(uid, parseCreated(text, href, etag));
      } catch (err) {
        result.failed.push({ name: read.name, position, reason: failureReason(err) });
      }
    }
    onProgress(position, cards.length);
  }
  return result;
}

function parseCreated(text: string, href: string, etag: string): Contact | null {
  try {
    return parse(text, href, etag);
  } catch {
    return null;
  }
}

function failureReason(err: unknown): ImportFailureReason {
  if (err instanceof DavError && err.code === "CONFLICT") return "conflict";
  if (err instanceof DavError && err.code === "NETWORK") return "network";
  return "refused";
}
