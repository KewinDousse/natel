/**
 * Pure contact-list logic: folding, grouping, sorting, search matching,
 * highlighting, and route-id mapping. No React, no I/O — fully unit-tested.
 *
 * Initials outside A–Z share a "#" group at the end of the list and rail.
 */

import { phoneDisplays } from "@/lib/format-phone";
import { fnv1a } from "@/lib/hash";
import type { Contact, ContactField } from "@/model/contact";
import { orgOf, typeValuesOf } from "@/vcard";

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

/** A contact's page name: its own (FN), else built from its parts, else its organisation; "" for none. */
export function pageNameOf(contact: Contact): string {
  return contact.fields.fn.trim() || namePartsOf(contact).display || orgOf(contact);
}

/**
 * Whether a card has neither a name nor an organisation: the list and the
 * contact page then show "Contact sans nom", muted and in italics.
 */
export function isUnnamed(contact: Contact): boolean {
  return namePartsOf(contact).display.length === 0 && orgOf(contact).length === 0;
}

/**
 * A card for an organisation rather than a person: no name of a person, and
 * its organisation as its only name (the shape iOS and Android give a
 * company's card). Units after the organisation's name don't count.
 */
export function isOrgCard(contact: Contact): boolean {
  const { family, given } = contact.fields.n;
  if (family || given) return false;
  const org = contact.fields.org.trim();
  const fn = contact.fields.fn.trim();
  return org.length > 0 && (fn.length === 0 || fold(fn) === fold(org));
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
 * The group the A–Z rail scrolls to for the letter at `index`: that letter
 * when the list has it, else the next present one, else the last one before
 * it, so a finger on an absent letter still lands next to it.
 */
export function railTarget(
  letters: readonly string[],
  present: ReadonlySet<string>,
  index: number,
): string | undefined {
  return (
    letters.slice(index).find((letter) => present.has(letter)) ??
    letters
      .slice(0, index)
      .reverse()
      .find((letter) => present.has(letter))
  );
}

/** The A–Z rail's letters, top to bottom. */
export const RAIL_LETTERS: readonly string[] = [...ALPHABET, OTHER_GROUP];

/** Height in px of a rail slot whose letter, at three quarters of it, stays at 11px. */
export const RAIL_SLOT_MIN = 15;

/**
 * What the A–Z rail shows in `height` px: every letter when they all fit a
 * slot of `RAIL_SLOT_MIN`, else letters alternating with dots (`null`), from A
 * to #, the letters spread evenly over the alphabet, as iOS collapses its index.
 */
export function railSlots(height: number): (string | null)[] {
  const fit = Math.floor(height / RAIL_SLOT_MIN);
  if (fit >= RAIL_LETTERS.length) return [...RAIL_LETTERS];
  // An odd count, so the sequence starts and ends on a letter.
  const count = fit % 2 === 1 ? fit : fit - 1;
  if (count < 3) return [];
  const letters = (count + 1) / 2;
  const last = RAIL_LETTERS.length - 1;
  return Array.from({ length: count }, (_, slot) =>
    slot % 2 === 1 ? null : (RAIL_LETTERS[Math.round(((slot / 2) * last) / (letters - 1))] ?? null),
  );
}

/**
 * The index in `RAIL_LETTERS` of the letter at `fraction` (0 at the top, 1 at
 * the bottom) of a rail showing `slots`: a letter's slot gives that letter, and
 * a dot's slot spreads the letters it stands for, so a finger reaches them all.
 */
export function railIndexAt(
  slots: readonly (string | null)[],
  fraction: number,
): number | undefined {
  if (slots.length === 0) return undefined;
  const at = Math.min(Math.max(fraction, 0), 1) * slots.length;
  const slot = Math.min(slots.length - 1, Math.floor(at));
  const letter = slots[slot];
  if (letter !== null && letter !== undefined) return RAIL_LETTERS.indexOf(letter);
  const before = RAIL_LETTERS.indexOf(slots[slot - 1] ?? "");
  const after = RAIL_LETTERS.indexOf(slots[slot + 1] ?? "");
  const hidden = after - before - 1;
  if (before < 0 || hidden <= 0) return undefined;
  return before + 1 + Math.min(hidden - 1, Math.floor((at - slot) * hidden));
}

/**
 * A row's name in the order of the sort toggle: the part the list is sorted
 * by leads (and is set bold), so "Fortune Sarah" by last name, "Sarah Fortune"
 * by first name. A missing part leaves the other one to lead alone.
 */
export function orderedNameOf(
  contact: Contact,
  sortBy: SortBy,
): { lead: string; rest: string; display: string } {
  const { family, given } = namePartsOf(contact);
  const [first, second] = sortBy === "family" ? [family, given] : [given, family];
  const lead = first || second;
  const rest = first ? second : "";
  return { lead, rest, display: [lead, rest].filter((part) => part.length > 0).join(" ") };
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
  return typeValuesOf(field).includes("cell");
}

/**
 * The detail page's primary number, per DESIGN.md: first TEL with TYPE=cell,
 * else the first TEL. Returns null when the contact has no phone at all.
 */
export function primaryNumberOf(contact: Contact): ContactField | null {
  const cell = contact.fields.tel.find(isCellType);
  if (cell) return cell;
  return contact.fields.tel[0] ?? null;
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

const searchTargets = new WeakMap<Contact, SearchTarget>();

/**
 * Precomputed search text. `folded`: the folded name, emails and org.
 * `digits`: the same with digitsOf's separators stripped, followed by each
 * number's digit forms (see phoneDigitsOf). Phones are only in `digits`, so
 * they match only digit queries of 3 digits or more. Cached per contact, since
 * the list filters on every keystroke and parsing numbers is costly.
 */
export function searchTargetOf(contact: Contact): SearchTarget {
  const cached = searchTargets.get(contact);
  if (cached !== undefined) return cached;
  const parts = namePartsOf(contact);
  // Both orders, since the list shows "Given Family" when sorted by first name.
  const reversed = parts.family && parts.given ? `${parts.given} ${parts.family}` : "";
  const text = [
    parts.display,
    reversed,
    ...contact.fields.email.map((email) => email.value),
    orgOf(contact),
  ]
    .filter((part) => part.length > 0)
    .join(" ");
  // "|" survives digitsOf, so no digit match spans two numbers.
  const phones = contact.fields.tel
    .map((tel) => tel.value)
    .filter((value) => value.length > 0)
    .map((value) => `|${phoneDigitsOf(value)}`)
    .join("");
  const target = { folded: fold(text), digits: `${digitsOf(text)}${phones}` };
  searchTargets.set(contact, target);
  return target;
}

/** Text with the separators a phone number may carry stripped, for digit matching. */
function digitsOf(text: string): string {
  return fold(text).replace(/[\s.()+-]/g, "");
}

/**
 * A number's digits as stored, as shown in local format, and as shown in
 * international format with its + written 00, so a number is found by the
 * digits it is stored with and by those the list shows in either format.
 */
export function phoneDigitsOf(value: string): string {
  const { local, international } = phoneDisplays(value);
  const plus = international.startsWith("+") ? "00" : "";
  // "|" keeps the forms apart, so no match spans two of them.
  return `${digitsOf(value)}|${local.replace(/\D/g, "")}|${plus}${international.replace(/\D/g, "")}`;
}

/**
 * The digits of a query that matches phone numbers: digits only, at least 3
 * (a single "1" would match every number). Null for any other query.
 */
export function digitQueryOf(rawQuery: string): string | null {
  const qDigits = digitsOf(rawQuery.trim());
  return qDigits.length > 2 && /^\d+$/.test(qDigits) ? qDigits : null;
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
  const qDigits = digitQueryOf(rawQuery);
  return qDigits !== null && target.digits.includes(qDigits);
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

type SortedEntry = { contact: Contact; key: string; foldedKey: string };

/**
 * Filter by query and group into letter sections. Sections are ordered A–Z,
 * with the "#" group last. Within a section, contacts sort by the folded sort
 * key, tie-broken by the raw key for a stable accent order.
 */
export function buildGroups(contacts: Contact[], sortBy: SortBy, query: string): ContactGroup[] {
  const entries: SortedEntry[] = contacts.map((contact) => {
    const key = sortKeyOf(contact, sortBy);
    return { contact, key, foldedKey: fold(key) };
  });
  // Without a query every contact shows, so no search target is built.
  const visible =
    query.trim().length === 0
      ? entries
      : entries.filter((entry) => matchesQuery(searchTargetOf(entry.contact), query));
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
 * Stable, URL-safe id for the /contacts/$book/$id route. Uses the vCard UID when it
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
