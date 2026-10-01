/**
 * Group writes of a contact's save (ADR 022). The contact's own card is
 * written first by the caller; this writes the group cards: an added name
 * gets a member line in the first group card of that name (by href), or a
 * new group card; a removed name comes out of every group card listing the
 * contact. A failure leaves the other groups written.
 */
import { cardHref, createCard, fetchCard, updateCard } from "@/dav";
import type { DavAuth } from "@/dav/types";
import type { Contact } from "@/model/contact";
import { addMember, groupCardOf, newGroupCard, parse, removeMember, serialiseRaw } from "@/vcard";

export type GroupDelta = { added: string[]; removed: string[] };

/**
 * A group change not written: which name, the card it concerns, and why.
 * `newCard` is the group card a create tried to write: a retry writes that
 * same card at the same href, so a create whose answer was lost can't leave
 * two groups of one name.
 */
export type GroupFailure = {
  name: string;
  kind: "add" | "remove";
  cardHref: string;
  newCard?: Contact;
  error: unknown;
};

export type GroupWriteResult = {
  /** Group cards written or created, with their new ETags, for the cache. */
  written: Contact[];
  failures: GroupFailure[];
};

/** The names added and removed between two sets of group names. */
export function groupDelta(before: string[], after: string[]): GroupDelta {
  return {
    added: after.filter((name) => !before.includes(name)),
    removed: before.filter((name) => !after.includes(name)),
  };
}

export function hasGroupChanges(delta: GroupDelta): boolean {
  return delta.added.length > 0 || delta.removed.length > 0;
}

function bareUid(uid: string): string {
  return uid.trim().replace(/^urn:uuid:/i, "");
}

/** A detached copy, so a failed write leaves the cached card untouched. */
function copyOf(card: Contact): Contact {
  return parse(serialiseRaw(card), card.href, card.etag);
}

async function put(auth: DavAuth, card: Contact): Promise<Contact> {
  const text = serialiseRaw(card);
  const { etag } = await updateCard(auth, card.href, card.etag, text);
  return parse(text, card.href, etag);
}

/** Creates a new group card at its href with If-None-Match: * (ADR 016). */
export async function createGroupCard(auth: DavAuth, card: Contact): Promise<Contact> {
  const text = serialiseRaw(card);
  const created = await createCard(auth, card.href, text);
  return parse(text, created.href, created.etag);
}

export async function writeGroupChanges(
  auth: DavAuth,
  bookHref: string,
  uid: string,
  delta: GroupDelta,
  groupCards: Contact[],
  /** New group cards of earlier failed creates, by name, to write again as they were. */
  retries: ReadonlyMap<string, Contact> = new Map(),
): Promise<GroupWriteResult> {
  const member = bareUid(uid);
  const byName = (name: string) =>
    groupCards
      .filter((card) => groupCardOf(card).name === name)
      .sort((a, b) => (a.href < b.href ? -1 : a.href > b.href ? 1 : 0));
  const result: GroupWriteResult = { written: [], failures: [] };

  for (const name of delta.added) {
    const cards = byName(name);
    if (cards.some((card) => groupCardOf(card).members.includes(member))) continue;
    const first = cards[0];
    if (first) {
      try {
        const card = copyOf(first);
        addMember(card, uid);
        result.written.push(await put(auth, card));
      } catch (error) {
        result.failures.push({ name, kind: "add", cardHref: first.href, error });
      }
      continue;
    }
    const fresh = retries.get(name) ?? newGroupCard(name, uid);
    const card = { ...fresh, href: fresh.href || cardHref(bookHref, fresh.uid) };
    try {
      result.written.push(await createGroupCard(auth, card));
    } catch (error) {
      result.failures.push({ name, kind: "add", cardHref: card.href, newCard: card, error });
    }
  }

  for (const name of delta.removed) {
    const listing = byName(name).filter((card) => groupCardOf(card).members.includes(member));
    for (const listed of listing) {
      try {
        const card = copyOf(listed);
        removeMember(card, uid);
        result.written.push(await put(auth, card));
      } catch (error) {
        result.failures.push({ name, kind: "remove", cardHref: listed.href, error });
      }
    }
  }
  return result;
}

/**
 * "Écraser avec ma version" for a group card (ADR 022, as ADR 013): fetch it
 * again and apply only this contact's change to the fresh version; nothing
 * is written when it already has it.
 */
export async function overwriteGroupChange(
  auth: DavAuth,
  href: string,
  uid: string,
  kind: "add" | "remove",
): Promise<Contact> {
  const fresh = await fetchCard(auth, href);
  const card = parse(fresh.vcardText, href, fresh.etag);
  const changed = kind === "add" ? addMember(card, uid) : removeMember(card, uid);
  return changed ? await put(auth, card) : card;
}
