/**
 * vCard parse/serialise.
 *
 * The entry point of src/vcard/, the only folder that imports ical.js. UI code
 * imports parse/serialise from here, never from ical.js directly.
 *
 * EXTENSION (edit task): NICKNAME, ADR, BDAY, ORG, TITLE, URL, NOTE are now
 * part of the editable subset. Everything the UI does not edit round-trips
 * byte-preserved via raw.
 */

import ICAL from "ical.js";
import type { Contact, EditableFields, RawComponent, RawProperty } from "../model/contact";
import {
  appleLabelOf,
  appleLabelProperty,
  dropAppleLabel,
  groupOf,
  labelledField,
  nValueToStruct,
  propertyToField,
  replacePropertiesInPlace,
} from "./fields";
import {
  decodeEscapedSemicolons,
  retypeTextBirthdays,
  unescapeDataUriSemicolons,
} from "./ical-workarounds";
import { updatePhotoProperty } from "./photo";
import { groupCardOf, readAddresses, readBirthday, readNote, readOrg, readTitle } from "./read";
import {
  updateAddressProperties,
  updateBdayProperty,
  updateFirstStringProperty,
  updateNameProperty,
  updateOrgProperty,
  updateStringProperty,
} from "./write";

export { canReplacePhoto, type Photo, photoOf, sniffImageType } from "./photo";
export {
  addressesOf,
  addressTypesOf,
  type Birthday,
  birthdayOf,
  groupCardOf,
  groupsOf,
  isGroupCard,
  jobTitleOf,
  noteOf,
  orgOf,
  type TypedProp,
  typeValuesOf,
  type VCardAddress,
} from "./read";
export { savedLabelOf, writesAddress } from "./write";

// Patches ical.js's text decoder before any parse (ADR 024).
decodeEscapedSemicolons();

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse vCard text into a Contact.
 *
 * `href` and `etag` are optional — they default to `""` so callers that only
 * have the body text can still construct a Contact.
 */
export function parse(text: string, href = "", etag = ""): Contact {
  const jCal = ICAL.parse(text);
  const raw = new ICAL.Component(jCal);
  retypeTextBirthdays(raw);
  unescapeDataUriSemicolons(raw);

  const uid = readUid(raw) ?? "";

  // --- FN ---
  const fnValue = raw.getFirstPropertyValue("fn");
  const fn = String(fnValue ?? "");

  // --- N ---
  const nProp = raw.getFirstProperty("n");
  const n = nProp
    ? nValueToStruct(nProp.getFirstValue())
    : { family: "", given: "", additional: "", prefix: "", suffix: "" };

  // --- TEL ---
  const telProps = raw.getAllProperties("tel");
  const tel = telProps.map((prop) => labelledField(raw, prop));

  // --- EMAIL ---
  const emailProps = raw.getAllProperties("email");
  const email = emailProps.map((prop) => labelledField(raw, prop));

  const fields: EditableFields = {
    fn,
    n,
    tel,
    email,
    nickname: String(raw.getFirstPropertyValue("nickname") ?? ""),
    adr: readAddresses(raw),
    bday: readBirthday(raw),
    org: readOrg(raw),
    title: readTitle(raw),
    url: String(raw.getFirstPropertyValue("url") ?? ""),
    ...(raw.getFirstProperty("url")
      ? { urlField: labelledField(raw, raw.getFirstProperty("url") as RawProperty) }
      : {}),
    note: readNote(raw),
    photo: { kind: "unchanged" },
  };

  return { href, etag, uid, fields, raw };
}

/** Properties the contact page shows every occurrence of, and the card's framing. */
const SHOWN_ALL = new Set([
  "tel",
  "email",
  "adr",
  "categories",
  // The photo control shows one and replaces them all (ADR 023).
  "photo",
  "version",
  "uid",
  "rev",
  "prodid",
]);

/** Properties the contact page reads once: a later occurrence isn't shown. */
const SHOWN_FIRST = new Set(["fn", "n", "nickname", "bday", "org", "title", "url", "note"]);

const COMPANIONS = ["x-ablabel", "x-abadr"];

/** A phone, e-mail or address list, as the overwrite compares it (ADR 038). */
export type ContactList = "tel" | "email" | "adr";

/**
 * The lists of `lists` that `fetched` no longer holds as `read` did: their
 * properties, parameters and groups, and those groups' `X-ABLABEL` and
 * `X-ABADR`, in order. The overwrite writes only lists found unchanged
 * (ADR 038).
 */
export function changedLists(read: Contact, fetched: Contact, lists: ContactList[]): ContactList[] {
  const listOf = (contact: Contact, name: ContactList) =>
    JSON.stringify(
      contact.raw.getAllProperties(name).map((prop) => {
        const group = groupOf(prop);
        const companions = contact.raw
          .getAllProperties()
          .filter(
            (other) =>
              COMPANIONS.includes(other.name) && group !== undefined && groupOf(other) === group,
          );
        return [prop.toJSON(), ...companions.map((other) => other.toJSON())];
      }),
    );
  return lists.filter((name) => listOf(read, name) !== listOf(fetched, name));
}

/**
 * The card's properties the contact page neither shows nor edits, each as
 * its vCard line, for whoever wants to look: a save writes them back as they
 * are. Read-only.
 */
export function unshownPropertiesOf(contact: Contact): string[] {
  const seen = new Set<string>();
  const labels = new Set<RawProperty>();
  for (const name of ["tel", "email", "adr", "url"]) {
    const properties = contact.raw.getAllProperties(name);
    for (const prop of name === "url" ? properties.slice(0, 1) : properties) {
      if (appleLabelOf(contact.raw, prop) === undefined) continue;
      const label = appleLabelProperty(contact.raw, prop);
      if (label) labels.add(label);
    }
  }
  return (contact.raw as unknown as ICAL.Component)
    .getAllProperties()
    .filter((prop) => {
      const name = prop.name.toLowerCase();
      if (labels.has(prop)) return false;
      if (SHOWN_ALL.has(name)) return false;
      if (!SHOWN_FIRST.has(name) || seen.has(name)) return true;
      seen.add(name);
      return false;
    })
    .map((prop) => prop.toICALString());
}

/**
 * Takes `name` out of the contact's CATEGORIES (ADR 022): only that value
 * goes, a property left empty is dropped, and the other values, parameters
 * and group prefix stay. Mutates `raw`; true when something changed.
 */
export function removeCategory(contact: Contact, name: string): boolean {
  let changed = false;
  for (const prop of contact.raw.getAllProperties("categories")) {
    const values = prop.getValues();
    const kept = values.filter((value) => String(value).trim() !== name);
    if (kept.length === values.length) continue;
    changed = true;
    if (kept.length === 0) contact.raw.removeProperty(prop);
    else prop.setValues(kept);
  }
  return changed;
}

/** The member value for a UID: `urn:uuid:<UID>`, never doubling the prefix. */
function memberValue(uid: string): string {
  return /^urn:uuid:/i.test(uid) ? uid : `urn:uuid:${uid}`;
}

/** The member property a group card uses, else the one of its version. */
function memberPropertyOf(card: Contact): string {
  if (card.raw.getAllProperties("x-addressbookserver-member").length > 0) {
    return "x-addressbookserver-member";
  }
  if (card.raw.getAllProperties("member").length > 0) return "member";
  return String(card.raw.getFirstPropertyValue("version") ?? "") === "4.0"
    ? "member"
    : "x-addressbookserver-member";
}

/** Adds the UID to a group card's members, unless it is there. Mutates `raw`. */
export function addMember(card: Contact, uid: string): boolean {
  const bare = uid.trim().replace(/^urn:uuid:/i, "");
  if (groupCardOf(card).members.includes(bare)) return false;
  const prop = new ICAL.Property(memberPropertyOf(card));
  prop.setValue(memberValue(uid.trim()));
  card.raw.addProperty(prop);
  return true;
}

/** Removes every member line naming the UID from a group card. Mutates `raw`. */
export function removeMember(card: Contact, uid: string): boolean {
  const bare = uid.trim().replace(/^urn:uuid:/i, "");
  let changed = false;
  for (const name of ["member", "x-addressbookserver-member"]) {
    for (const prop of card.raw.getAllProperties(name)) {
      const value = String(prop.getFirstValue() ?? "")
        .trim()
        .replace(/^urn:uuid:/i, "");
      if (value === bare) {
        card.raw.removeProperty(prop);
        changed = true;
      }
    }
  }
  return changed;
}

/**
 * A new group card (ADR 022): vCard 3.0 with a fresh UID, `FN`, `N`,
 * `X-ADDRESSBOOKSERVER-KIND:group` and one member.
 */
export function newGroupCard(name: string, memberUid: string): Contact {
  const card = parse(
    ["BEGIN:VCARD", "VERSION:3.0", `UID:${randomUuid()}`, "END:VCARD", ""].join("\r\n"),
  );
  const fn = new ICAL.Property("fn");
  fn.setValue(name);
  card.raw.addProperty(fn);
  const n = new ICAL.Property("n");
  n.setValue([name, "", "", "", ""]);
  card.raw.addProperty(n);
  const kind = new ICAL.Property("x-addressbookserver-kind");
  kind.setValue("group");
  card.raw.addProperty(kind);
  addMember(card, memberUid);
  return parse(card.raw.toString());
}

/** A card's text, fields untouched, ended as RFC 6350 requires. */
export function serialiseRaw(contact: Contact): string {
  return cardText(contact.raw);
}

/**
 * The component's text with the line break after `END:VCARD` that RFC 6350
 * §3.3 requires, which ical.js leaves out.
 */
function cardText(raw: RawComponent): string {
  return `${raw.toString()}\r\n`;
}

/**
 * Moves the card's `REV` to `now` before it is written, as RFC 6350 §6.7.4
 * has the writer do; a card without one gets none. Mutates `raw`.
 */
export function stampRevision(contact: Contact, now: Date = new Date()): void {
  const rev = contact.raw.getFirstProperty("rev");
  if (!rev) return;
  // A timestamp has no VALUE parameter to write; to the second, as clients write it.
  rev.resetType(contact.raw.getFirstPropertyValue("version") === "4.0" ? "timestamp" : "date-time");
  rev.setValue(now.toISOString().replace(/\.\d+Z$/, "Z"));
}

/** Gives a contact without a UID a fresh one (ADR 022). Mutates `raw`. */
export function ensureUid(contact: Contact): Contact {
  if (contact.uid.trim().length > 0) return contact;
  const uid = randomUuid();
  // A blank UID line gets the value: a card has at most one UID.
  const existing = contact.raw.getFirstProperty("uid");
  if (existing) {
    existing.setValue(uid);
  } else {
    const prop = new ICAL.Property("uid");
    prop.setValue(uid);
    contact.raw.addProperty(prop);
  }
  return { ...contact, uid };
}

/**
 * A blank contact for the creation form: vCard 3.0 (ADR 008) with a fresh
 * UID, not yet on the server (empty href and ETag).
 */
export function newContact(): Contact {
  return parse(["BEGIN:VCARD", "VERSION:3.0", `UID:${randomUuid()}`, "END:VCARD", ""].join("\r\n"));
}

/**
 * A random v4 UUID. getRandomValues, unlike randomUUID, also exists outside
 * secure contexts, e.g. a Natel served over plain HTTP on a LAN.
 */
function randomUuid(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * The cards of a .vcf file, each as its exact text from `BEGIN:VCARD` to its
 * `END:VCARD`, line endings as in the file (ADR 020: the original text is
 * what an import sends). A byte order mark and anything between cards are
 * dropped. A card missing its `END:VCARD` ends where the next card begins,
 * and is kept as it is for the parser to reject; only a vCard 2.1 `AGENT`
 * nests a card inside another.
 */
export function splitCards(fileText: string): string[] {
  const lines = fileText.replace(/^\uFEFF/, "").match(/[^\r\n]*(?:\r\n|\n|\r|$)/g) ?? [];
  const cards: string[] = [];
  let current: string[] = [];
  let depth = 0;
  let previous = "";
  for (const line of lines) {
    if (line.length === 0) continue;
    const content = line.trimEnd().toUpperCase();
    if (content === "BEGIN:VCARD") {
      if (depth > 0 && !/^(?:[\w-]+\.)?AGENT[;:]/.test(previous)) {
        cards.push(current.join(""));
        current = [];
        depth = 0;
      }
      depth += 1;
    }
    previous = content;
    if (depth > 0) current.push(line);
    if (content === "END:VCARD" && depth > 0) {
      depth -= 1;
      if (depth === 0) {
        cards.push(current.join(""));
        current = [];
      }
    }
  }
  if (current.length > 0) cards.push(current.join(""));
  return cards;
}

/**
 * What an import needs to know of a card: its UID as parse reads it (null
 * when it has none), and a name to report it by. Throws when ical.js can't
 * read it as a vCard.
 */
export function readImportCard(cardText: string): { uid: string | null; name: string } {
  const jCal = ICAL.parse(cardText);
  if (!Array.isArray(jCal) || jCal[0] !== "vcard") throw new Error("not a vCard");
  const raw = new ICAL.Component(jCal as unknown[]);
  const uid = readUid(raw);
  const fn = String(raw.getFirstPropertyValue("fn") ?? "").trim();
  const n = raw.getFirstProperty("n");
  const parts = n ? nValueToStruct(n.getFirstValue()) : null;
  const name = fn || [parts?.given, parts?.family].filter(Boolean).join(" ");
  return { uid, name };
}

/**
 * A card's UID as ical.js reads it (unescaped), null without one. Shared by
 * parse and the import, so both sides of ADR 020's exact comparison match.
 */
function readUid(raw: RawComponent): string | null {
  const prop = raw.getFirstProperty("uid");
  return prop ? String(prop.getFirstValue() ?? "") : null;
}

/**
 * A card text given a `UID:` line just before its `END:VCARD`, in the card's
 * own line ending, the value escaped as vCard text. Nothing else of the text
 * changes.
 */
export function withUid(cardText: string, uid: string): string {
  const eol = /\r\n|\n|\r/.exec(cardText)?.[0] ?? "\r\n";
  const end = cardText.search(/END:VCARD[ \t]*(?:\r\n|\n|\r)?$/i);
  if (end === -1) return cardText;
  const value = uid
    .replace(/[\\,;]/g, (char) => `\\${char}`)
    .replace(/\r?\n/g, "\\n")
    .replace(/\r/g, "");
  return `${cardText.slice(0, end)}UID:${value}${eol}${cardText.slice(end)}`;
}

/** A fresh random UID, as newContact gives a new card. */
export function newUid(): string {
  return randomUuid();
}

/**
 * Serialise a Contact back to vCard text.
 *
 * Applies the editable fields onto `contact.raw`, then serialises the full
 * component. Properties the UI never touches are emitted exactly as parsed.
 */
export function serialise(contact: Contact): string {
  const { raw, fields } = contact;

  // --- Update FN ---
  let fnProp = raw.getFirstProperty("fn");
  if (!fnProp) {
    const prop = new ICAL.Property("fn");
    raw.addProperty(prop);
    fnProp = prop;
  }
  fnProp.setValue(fields.fn);

  // --- Update N ---
  updateNameProperty(raw, fields.n);

  // --- Update TEL properties in place ---
  replacePropertiesInPlace(raw, "tel", fields.tel);

  // --- Update EMAIL properties in place ---
  replacePropertiesInPlace(raw, "email", fields.email);

  // --- Update NICKNAME ---
  updateStringProperty(raw, "nickname", fields.nickname);

  // --- Update ADR properties, each in place ---
  updateAddressProperties(raw, fields.adr);
  // After the addresses, which compare their labels with the card's.
  for (const field of [...fields.tel, ...fields.email]) {
    if (field.dropLabel) dropAppleLabel(raw, field.params?.group ?? field.params?.GROUP);
  }
  if (fields.urlField?.dropLabel) {
    const prop = raw.getFirstProperty("url");
    if (prop) dropAppleLabel(raw, groupOf(prop));
  }

  // --- Update BDAY (first property only) ---
  updateBdayProperty(raw, fields.bday);

  // --- Update ORG (first property only, first component) ---
  updateOrgProperty(raw, fields.org);

  // --- Update TITLE ---
  updateStringProperty(raw, "title", fields.title);

  // --- Update URL (first property only) ---
  const url = raw.getFirstProperty("url");
  updateFirstStringProperty(raw, "url", fields.url);
  const editedUrl = url
    ? raw.getAllProperties("url").includes(url)
      ? url
      : null
    : raw.getFirstProperty("url");
  if (editedUrl && fields.urlField) {
    const params = fields.urlField.params ?? {};
    const type = params.type ?? params.TYPE;
    const current = propertyToField(editedUrl).params ?? {};
    if (JSON.stringify(type) !== JSON.stringify(current.type ?? current.TYPE)) {
      for (const key of ["type", "TYPE"]) editedUrl.removeParameter(key);
      if (type !== undefined) editedUrl.setParameter("type", type);
    }
  }

  // --- Update NOTE (first property only) ---
  updateFirstStringProperty(raw, "note", fields.note);

  // --- Update PHOTO, only when replaced or removed ---
  updatePhotoProperty(raw, fields.photo);

  // The saved Contact is also the query cache's value.
  fields.tel = raw.getAllProperties("tel").map((prop) => labelledField(raw, prop));
  fields.email = raw.getAllProperties("email").map((prop) => labelledField(raw, prop));
  fields.adr = readAddresses(raw);
  const savedUrl = raw.getFirstProperty("url");
  fields.urlField = savedUrl ? labelledField(raw, savedUrl) : undefined;
  fields.url = String(raw.getFirstPropertyValue("url") ?? "");

  return cardText(raw);
}
