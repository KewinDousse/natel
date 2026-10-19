/**
 * Moving a contact to another address book (ADR 021): the card as the server
 * has it is created in the target book, then deleted from the source one.
 * Each request's DavError code says whether it certainly didn't take effect
 * (CONFLICT, NOT_FOUND, AUTH) or may have (NETWORK, UNEXPECTED); a create
 * that may have landed is never followed by a delete, a delete that may
 * have landed is never undone, so a contact is never lost.
 */
import { cardHref, createCard, deleteCard, fetchCard } from "@/dav";
import { type DavAuth, type DavContactDetail, DavError } from "@/dav/types";
import type { Contact } from "@/model/contact";
import { readImportCard, withUid } from "@/vcard";

export type MoveOutcome =
  /** Moved: the card now sits at `href` in the target book, as `text` with `etag`. */
  | { kind: "moved"; href: string; etag: string; text: string }
  /** The card changed or went away since the edit began: nothing written. */
  | { kind: "stale" }
  /** A request failed before anything was written. */
  | { kind: "failed"; error: unknown }
  /** A card already sits at the target href: nothing written. */
  | { kind: "exists" }
  /** The create may have landed; the source wasn't touched. */
  | { kind: "create_uncertain" }
  /** The source refused the delete; the copy was removed again. */
  | { kind: "delete_refused"; error: DavError }
  /** The source refused the delete, and removing the copy failed too. */
  | { kind: "in_both" }
  /** The delete may have landed; the copy stays. */
  | { kind: "delete_uncertain" };

const DEFINITE = new Set(["CONFLICT", "NOT_FOUND", "AUTH", "TOO_LARGE"]);

/** True when the request certainly did not take effect. */
function definite(err: unknown): err is DavError {
  return err instanceof DavError && DEFINITE.has(err.code);
}

/** The UID a card without one gets: its source href's last segment, without `.vcf`. */
export function uidFromHref(href: string): string {
  const segment = (href.split("/").pop() ?? "").replace(/\.vcf$/i, "");
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

export async function moveContact(
  auth: DavAuth,
  source: Contact,
  targetBookHref: string,
): Promise<MoveOutcome> {
  let fetched: { vcardText: string; etag: string };
  try {
    fetched = await fetchCard(auth, source.href);
  } catch (err) {
    if (err instanceof DavError && err.code === "NOT_FOUND") return { kind: "stale" };
    return { kind: "failed", error: err };
  }
  if (fetched.etag !== source.etag) return { kind: "stale" };

  // The multistatus XML turns CRLF into LF and may drop the last line break;
  // the card goes out as vCard wants it, every line ending in CRLF.
  let text = fetched.vcardText.replace(/\r\n|\r|\n/g, "\r\n").replace(/(?<!\r\n)$/, "\r\n");
  let uid: string;
  try {
    const read = readImportCard(text);
    // A blank UID names no resource: such a card goes like one without.
    const existing = read.uid?.trim() ? read.uid : null;
    uid = existing ?? uidFromHref(source.href);
    if (existing === null) {
      text = withUid(text.replace(/^(?:[\w-]+\.)?UID(?:;[^:\r\n]*)?:[ \t]*\r\n/im, ""), uid);
    }
  } catch (err) {
    return { kind: "failed", error: err };
  }

  let created: DavContactDetail;
  try {
    created = await createCard(auth, cardHref(targetBookHref, uid), text);
  } catch (err) {
    if (err instanceof DavError && err.code === "CONFLICT") return { kind: "exists" };
    if (definite(err)) return { kind: "failed", error: err };
    return { kind: "create_uncertain" };
  }

  try {
    await deleteCard(auth, source.href, fetched.etag);
  } catch (err) {
    if (!definite(err)) return { kind: "delete_uncertain" };
    try {
      await deleteCard(auth, created.href, created.etag);
    } catch (undoErr) {
      if (!(undoErr instanceof DavError && undoErr.code === "NOT_FOUND")) {
        return { kind: "in_both" };
      }
    }
    return { kind: "delete_refused", error: err };
  }
  return { kind: "moved", href: created.href, etag: created.etag, text: created.vcardText };
}
