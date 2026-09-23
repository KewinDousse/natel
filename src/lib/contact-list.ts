/**
 * Pure contact-list logic: folding, grouping, sorting, search matching,
 * highlighting, and route-id mapping. No React, no I/O — fully unit-tested.
 *
 * The A–Z rail keeps the 26 plain letters even when contacts sort elsewhere:
 * anything whose initial is not A–Z goes into a "#" group rendered at the end
 * of the list (never shown in the rail). Design choice, see DESIGN.md "A–Z rail".
 */

import type { Contact, ContactField } from "@/model/contact";
import { orgOf } from "@/vcard";

export type SortBy = "family" | "given";

export type TrailingValue = { kind: "tel" | "email" | "org"; value: string };

export type ContactGroup = { letter: string; contacts: Contact[] };

export type HighlightSegment = { text: string; hit: boolean };

export type SearchTarget = { folded: string; digits: string };

export const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** Group letter for contacts outside A–Z (digits, symbols, empty sort key). */
export const OTHER_GROUP = "#";

// ---------------------------------------------------------------------------
// Normalisation
// ---------------------------------------------------------------------------

/**
 * Accent-insensitive fold: NFD + strip combining marks + lowercase, plus the
 * three letters NFD does not decompose (ł, ø, đ). Mirrors the mockup's `fold`.
 */
export function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replaceAll("ł", "l")
    .replaceAll("ø", "o")
    .replaceAll("đ", "d");
}

/** First letter of the folded sort key for grouping: "A"…"Z" or "#". */
export function groupLetterOf(key: string): string {
  const first = fold(key).charAt(0).toUpperCase();
  return first.length > 0 && ALPHABET.includes(first) ? first : OTHER_GROUP;
}

// ---------------------------------------------------------------------------
// Contact display helpers
// ---------------------------------------------------------------------------

export type NameParts = { family: string; given: string; display: string };

/**
 * Directory-grammar name: N.family / N.given, falling back to FN when the
 * structured name is empty. `display` is the full name for `title`/search.
 */
export function namePartsOf(contact: Contact): NameParts {
  const { family, given } = contact.fields.n;
  if (family || given) {
    const display = [family, given].filter((part) => part.length > 0).join(" ");
    return { family, given, display };
  }
  return { family: contact.fields.fn, given: "", display: contact.fields.fn };
}

/**
 * Sort key for the current toggle: family or given name. Falls back to the
 * display name so cards without a structured name still sort by their FN.
 */
export function sortKeyOf(contact: Contact, sortBy: SortBy): string {
  const parts = namePartsOf(contact);
  const key = sortBy === "family" ? parts.family : parts.given;
  return key || parts.display;
}

/**
 * Trailing row value, per DESIGN.md priority: first TEL with TYPE=cell →
 * first TEL → first EMAIL → ORG (muted). Values are displayed as stored.
 */
export function trailingValueOf(contact: Contact): TrailingValue | null {
  const cell = contact.fields.tel.find(isCellType);
  if (cell) return { kind: "tel", value: cell.value };
  const firstTel = contact.fields.tel[0];
  if (firstTel) return { kind: "tel", value: firstTel.value };
  const firstEmail = contact.fields.email[0];
  if (firstEmail) return { kind: "email", value: firstEmail.value };
  const org = orgOf(contact);
  if (org.length > 0) return { kind: "org", value: org };
  return null;
}

/** True when a TEL/EMAIL has TYPE=cell among its params (case-insensitive). */
function isCellType(field: ContactField): boolean {
  const type = field.params?.TYPE;
  if (Array.isArray(type)) return type.some((t) => t.toLowerCase() === "cell");
  return typeof type === "string" && type.toLowerCase() === "cell";
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

/**
 * Precomputed search text: folded lowercase name + numbers as stored (spaces
 * kept, so spaced queries match) + emails + org, plus the same text with
 * spaces/dots/+/- stripped for compact digit queries. Order follows the
 * mockup's data-search attribute.
 */
export function searchTargetOf(contact: Contact): SearchTarget {
  const parts = namePartsOf(contact);
  const text = [
    parts.display,
    ...contact.fields.tel.map((tel) => tel.value),
    ...contact.fields.email.map((email) => email.value),
    orgOf(contact),
  ]
    .filter((part) => part.length > 0)
    .join(" ");
  const folded = fold(text);
  return { folded, digits: folded.replace(/[\s.+-]/g, "") };
}

/**
 * Match a raw query against a contact's search target: accent-insensitive
 * substring on the folded text, plus digit-substring matching when the query
 * is digits only. Letters never match phone fields, and a digit query shorter
 * than 3 digits is ignored (a single "1" would match every number).
 */
export function matchesQuery(target: SearchTarget, rawQuery: string): boolean {
  const q = fold(rawQuery.trim());
  if (q.length === 0) return true;
  if (target.folded.includes(q)) return true;
  const qDigits = q.replace(/[\s.+-]/g, "");
  if (qDigits.length > 2 && /^\d+$/.test(qDigits)) {
    return target.digits.includes(qDigits);
  }
  return false;
}

/**
 * Split a value into highlight segments around every fold-insensitive match.
 * Folded indices are mapped back to original character ranges, so a search
 * for "elis" marks the whole "Élise" even though the match covers 4 of 6
 * code points.
 */
export function splitByQuery(value: string, query: string): HighlightSegment[] {
  const q = fold(query.trim());
  if (q.length === 0 || value.length === 0) return [{ text: value, hit: false }];

  let folded = "";
  const map: number[] = [];
  for (let i = 0; i < value.length; i++) {
    for (const ch of fold(value[i] ?? "")) {
      folded += ch;
      map.push(i);
    }
  }

  const segments: HighlightSegment[] = [];
  let cursor = 0;
  let searchFrom = 0;
  while (searchFrom <= folded.length) {
    const at = folded.indexOf(q, searchFrom);
    if (at < 0) break;
    const a = map[at] ?? 0;
    const b = (map[at + q.length - 1] ?? a) + 1;
    if (a > cursor) segments.push({ text: value.slice(cursor, a), hit: false });
    segments.push({ text: value.slice(a, b), hit: true });
    cursor = b;
    searchFrom = at + q.length;
  }
  if (cursor < value.length) segments.push({ text: value.slice(cursor), hit: false });
  return segments.length > 0 ? segments : [{ text: value, hit: false }];
}

// ---------------------------------------------------------------------------
// Grouping / sorting
// ---------------------------------------------------------------------------

type SortedEntry = { contact: Contact; key: string; foldedKey: string; target: SearchTarget };

/**
 * Filter by query and group into letter sections. Sections are ordered A–Z,
 * with the "#" group last. Within a section, contacts sort by the folded sort
 * key, tie-broken by the raw key for a stable accent order.
 */
export function buildGroups(contacts: Contact[], sortBy: SortBy, query: string): ContactGroup[] {
  const entries: SortedEntry[] = contacts.map((contact) => {
    const key = sortKeyOf(contact, sortBy);
    return { contact, key, foldedKey: fold(key), target: searchTargetOf(contact) };
  });
  const visible = entries.filter((entry) => matchesQuery(entry.target, query));
  visible.sort((a, b) => {
    if (a.foldedKey !== b.foldedKey) return a.foldedKey < b.foldedKey ? -1 : 1;
    if (a.key !== b.key) return a.key < b.key ? -1 : 1;
    return 0;
  });

  const byLetter = new Map<string, Contact[]>();
  const other: Contact[] = [];
  for (const entry of visible) {
    const letter = groupLetterOf(entry.key);
    if (letter === OTHER_GROUP) {
      other.push(entry.contact);
      continue;
    }
    const list = byLetter.get(letter);
    if (list) {
      list.push(entry.contact);
    } else {
      byLetter.set(letter, [entry.contact]);
    }
  }

  const groups: ContactGroup[] = [...byLetter.entries()].map(([letter, contacts]) => ({
    letter,
    contacts,
  }));
  if (other.length > 0) groups.push({ letter: OTHER_GROUP, contacts: other });
  return groups;
}

// ---------------------------------------------------------------------------
// Route ids
// ---------------------------------------------------------------------------

/** URL-safe characters that need no encoding in a path segment. */
const URL_SAFE_ID = /^[A-Za-z0-9._~-]+$/;

/**
 * Stable, URL-safe id for the /contacts/$id route. Uses the vCard UID when it
 * is already URL-safe; otherwise a 32-bit FNV-1a hash of the uid/href, which
 * DAVx⁵ and Baïkal never produce (they use UUIDs).
 */
export function contactIdOf(contact: Contact): string {
  if (contact.uid.length > 0 && URL_SAFE_ID.test(contact.uid)) return contact.uid;
  return `h${fnv1a(contact.uid || contact.href)}`;
}

export function contactById(contacts: Contact[], id: string): Contact | undefined {
  return contacts.find((contact) => contactIdOf(contact) === id);
}

/** FNV-1a 32-bit hash as hex — deterministic across runs. */
function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i) ?? 0;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}
