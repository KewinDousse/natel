/**
 * Import of a .vcf file into an address book (ADR 020): each card is created
 * as its original text with If-None-Match: * at `<uid>.vcf`, one after the
 * other. A card whose UID the book already has is skipped, a failure doesn't
 * stop the rest, and nothing is undone. The plan comes first, so the user
 * sees what the import will do before it starts (ADR 042).
 */
import { cardHref, createCard } from "@/dav";
import { type DavAuth, DavError } from "@/dav/types";
import type { Contact } from "@/model/contact";
import { newUid, parse, readImportCard, splitCards, withUid } from "@/vcard";

export type ImportFailureReason =
  | "unreadable"
  | "duplicate"
  | "conflict"
  | "refused"
  | "network"
  | "timeout"
  | "too_large"
  | "maybe_too_large";

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

/** A card of the file the import will create, with its original text. */
export type PlannedCard = {
  position: number;
  name: string;
  uid: string;
  text: string;
  /** The card as the list would show it, null for one it can't parse. */
  contact: Contact | null;
};

/**
 * What an import would do, read from the file and the book's UIDs without
 * any request (ADR 042): the cards to create, the number the book already
 * has, and the cards that can't be imported.
 */
export type ImportPlan = { create: PlannedCard[]; existing: number; failed: ImportFailure[] };

export type ImportCallbacks = {
  /** Called once with the number of cards to send, then after each card. */
  onProgress: (done: number, total: number) => void;
  /**
   * Called with each card once created, so the list can show it at once;
   * `contact` is null for a card the list can't parse, which only shows
   * after a reload but is in the book all the same.
   */
  onCreated: (uid: string, contact: Contact | null) => void;
};

export function planImport(fileText: string, bookUids: ReadonlySet<string>): ImportPlan {
  const cards = splitCards(fileText);
  if (cards.length === 0) throw new EmptyImportError();

  const seenInFile = new Set<string>();
  const plan: ImportPlan = { create: [], existing: 0, failed: [] };
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
      plan.failed.push({ name: read.name, position, reason: "unreadable" });
      continue;
    }

    const uid = read.uid ?? newUid();
    const text = read.uid === null ? withUid(card, uid) : card;
    if (seenInFile.has(uid)) {
      plan.failed.push({ name: read.name, position, reason: "duplicate" });
      continue;
    }
    seenInFile.add(uid);
    if (bookUids.has(uid)) plan.existing += 1;
    else plan.create.push({ position, name: read.name, uid, text, contact: parseCard(text) });
  }
  return plan;
}

/**
 * Creates `cards`, the plan's or some of them, one after the other. The
 * result counts the plan's known cards and failures with the new ones.
 */
export async function runImport(
  auth: DavAuth,
  bookHref: string,
  plan: ImportPlan,
  cards: readonly PlannedCard[],
  { onProgress, onCreated }: ImportCallbacks,
): Promise<ImportResult> {
  const result: ImportResult = { imported: 0, existing: plan.existing, failed: [...plan.failed] };
  onProgress(0, cards.length);
  for (const [index, { position, name, uid, text }] of cards.entries()) {
    try {
      const created = await createCard(auth, cardHref(bookHref, uid), text);
      result.imported += 1;
      onCreated(uid, parseCard(created.vcardText, created.href, created.etag));
    } catch (err) {
      result.failed.push({ name, position, reason: failureReason(err) });
    }
    onProgress(index + 1, cards.length);
  }
  result.failed.sort((a, b) => a.position - b.position);
  return result;
}

function parseCard(text: string, href = "", etag = ""): Contact | null {
  try {
    return parse(text, href, etag);
  } catch {
    return null;
  }
}

function failureReason(err: unknown): ImportFailureReason {
  if (err instanceof DavError && err.code === "CONFLICT") return "conflict";
  if (err instanceof DavError && err.code === "NETWORK") return "network";
  if (err instanceof DavError && err.code === "TIMEOUT") return "timeout";
  if (err instanceof DavError && err.code === "TOO_LARGE") return "too_large";
  if (err instanceof DavError && err.code === "MAYBE_TOO_LARGE") return "maybe_too_large";
  return "refused";
}
