/**
 * Contact edit state — pure logic for building drafts, detecting changes,
 * validating fields, and applying edits back to a Contact; and which of its
 * values the contact page turns into links, and how.
 *
 * All functions are pure and fully unit-testable. No React, no I/O.
 */

import type {
  Contact,
  ContactField,
  PhotoEdit,
  VCardAddressField,
  VCardBirthdayField,
} from "@/model/contact";
import { savedLabelOf, writesAddress } from "@/vcard";

// ---------------------------------------------------------------------------
// Draft type — the shape the UI works with during editing
// ---------------------------------------------------------------------------

export type ContactDraft = {
  family: string;
  given: string;
  tel: DraftField[];
  email: DraftField[];
  nickname: string;
  adr: DraftAddress[];
  /** null when the card has no birthday. */
  bday: DraftBirthday | null;
  org: string;
  title: string;
  url: string;
  urlType?: FieldKind;
  note: string;
  photo: PhotoEdit;
};

/**
 * Birthday parts as typed. They stay strings while editing so a partial or
 * invalid entry ("19x") is shown as typed; they are parsed on validation,
 * dirty-diff and apply.
 */
export type DraftBirthday = {
  source: string;
  valueType?: string;
  year: string;
  month: string;
  day: string;
};

/** An address in the draft, with a stable id for React keys. */
export type DraftAddress = VCardAddressField & { id: string };

/** A TEL or EMAIL field in the draft, with a stable id for React keys. */
export type DraftField = {
  id: string;
  value: string;
  /** The kind the row's type menu shows and edits. */
  type: FieldKind;
  /** Original ContactField — preserved for round-trip fidelity.
   *  Only value/type are mutated in place; all params, groups and the value
   *  type are written back unchanged. */
  _orig: ContactField;
};

// ---------------------------------------------------------------------------
// Build draft from contact
// ---------------------------------------------------------------------------

let _counter = 0;
export function nextId(): string {
  return `f_${++_counter}`;
}

function resetCounter(): void {
  _counter = 0;
}

/**
 * The draft to keep editing on `saved`, the card a save just wrote from
 * `sent`: each part the user left alone during the save takes the card's
 * value, so a later save doesn't write back what an overwrite (ADR 013) took
 * from the server; a part changed during the save stays as typed.
 */
export function rebaseDraft(
  sent: ContactDraft,
  current: ContactDraft,
  saved: Contact,
): ContactDraft {
  const rebased = buildDraft(saved);
  if (current === sent) return rebased;
  const savedAdr = rebased.adr;
  for (const key of Object.keys(current) as (keyof ContactDraft)[]) {
    if (current[key] !== sent[key]) Object.assign(rebased, { [key]: current[key] });
  }
  if (current.adr !== sent.adr) rebased.adr = withSavedSources(current.adr, sent.adr, savedAdr);
  // Fields kept from `current` hold ids from before the rebuild: new ones
  // must not reuse them.
  for (const field of [...rebased.tel, ...rebased.email, ...rebased.adr]) {
    const n = Number(field.id.slice(2));
    if (Number.isFinite(n) && n > _counter) _counter = n;
  }
  return rebased;
}

/**
 * Addresses edited during a save, each given the property the save wrote it
 * to: it may have gained a group there, which the next save must keep.
 * That property is found by what the address sent, since a card fetched
 * again (no ETag) can hold another client's changes; an address it no
 * longer holds keeps its source.
 */
function withSavedSources(
  current: DraftAddress[],
  sent: DraftAddress[],
  saved: DraftAddress[],
): DraftAddress[] {
  const unmatched = [...saved];
  const written = new Map<string, DraftAddress>();
  for (const adr of sent.filter(writesAddress)) {
    const i = unmatched.findIndex((savedAdr) => samePlace(adr, savedAdr));
    const match = i >= 0 ? unmatched.splice(i, 1)[0] : undefined;
    if (match !== undefined) written.set(adr.id, match);
  }
  return current.map((adr) => {
    const match = written.get(adr.id);
    return match === undefined ? adr : { ...adr, source: match.source, label: match.label };
  });
}

const PLACE_PARTS = [
  "poBox",
  "extended",
  "street",
  "locality",
  "region",
  "postalCode",
  "country",
] as const;

function samePlace(a: VCardAddressField, b: VCardAddressField | undefined): boolean {
  return b !== undefined && PLACE_PARTS.every((part) => a[part] === b[part]);
}

/** Build a draft from a contact's fields. Each field gets a stable id. */
export function buildDraft(contact: Contact): ContactDraft {
  resetCounter();
  return {
    family: contact.fields.n.family,
    given: contact.fields.n.given,
    tel: contact.fields.tel.map(toDraftField),
    email: contact.fields.email.map(toDraftField),
    nickname: contact.fields.nickname,
    adr: contact.fields.adr.map(toDraftAddress),
    bday: contact.fields.bday ? toDraftBirthday(contact.fields.bday) : null,
    org: contact.fields.org,
    title: contact.fields.title,
    url: contact.fields.url,
    urlType: contact.fields.urlField ? fieldKind(contact.fields.urlField) : "",
    note: contact.fields.note,
    photo: contact.fields.photo,
  };
}

function toDraftAddress(adr: VCardAddressField): DraftAddress {
  return { ...adr, id: nextId() };
}

function fromDraftAddress({ id: _id, ...adr }: DraftAddress): VCardAddressField {
  return adr;
}

/** A blank address, as "Ajouter une adresse" gives. */
export function newDraftAddress(): DraftAddress {
  return {
    id: nextId(),
    poBox: "",
    extended: "",
    street: "",
    locality: "",
    region: "",
    postalCode: "",
    country: "",
    type: [],
    extraParts: [],
  };
}

/** Apple's built-in label name (`_$!<Home>!$_` gives "Home"), undefined for any other. */
export function appleBuiltInOf(label: string): string | undefined {
  return /^_\$!<(.*)>!\$_$/.exec(label)?.[1];
}

/** What an address's type menu shows: its label, a label being typed, or a kind. */
export function addressKindOf(adr: VCardAddressField): AddressKind {
  if (adr.customLabel !== undefined) return "custom";
  if (adr.label !== undefined && !adr.dropLabel) return "label";
  return kindOf(adr.type);
}

function toDraftBirthday(bday: VCardBirthdayField): DraftBirthday {
  const part = (n: number | null) => (n === null ? "" : String(n));
  return {
    source: bday.source,
    valueType: bday.valueType,
    year: part(bday.year),
    month: part(bday.month),
    day: part(bday.day),
  };
}

/** Parse a typed birthday part: null when empty, NaN when not a whole number. */
export function parseBirthdayPart(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  return /^\d+$/.test(trimmed) ? Number(trimmed) : Number.NaN;
}

function fromDraftBirthday(bday: DraftBirthday): VCardBirthdayField {
  return {
    source: bday.source,
    valueType: bday.valueType,
    year: parseBirthdayPart(bday.year),
    month: parseBirthdayPart(bday.month),
    day: parseBirthdayPart(bday.day),
  };
}

function typesOf(field: ContactField): string[] {
  const types = field.params?.TYPE ?? field.params?.type;
  return Array.isArray(types) ? types : typeof types === "string" ? [types] : [];
}

function toDraftField(field: ContactField): DraftField {
  return { id: nextId(), value: field.value, type: fieldKind(field), _orig: field };
}

function fieldKind(field: ContactField): FieldKind {
  return field.label === undefined ? kindOf(typesOf(field)) : "label";
}

// ---------------------------------------------------------------------------
// Dirty-diff
// ---------------------------------------------------------------------------

export type DirtyFields = {
  family: boolean;
  given: boolean;
  tel: boolean;
  email: boolean;
  nickname: boolean;
  adr: boolean;
  bday: boolean;
  org: boolean;
  title: boolean;
  url: boolean;
  note: boolean;
  photo: boolean;
};

/** Compare a draft against the original contact's fields. */
export function dirtyDiff(contact: Contact, draft: ContactDraft): DirtyFields {
  const f = contact.fields;
  return {
    family: draft.family !== f.n.family,
    given: draft.given !== f.n.given,
    tel: fieldsDiffer(f.tel, draft.tel),
    email: fieldsDiffer(f.email, draft.email),
    nickname: draft.nickname !== f.nickname,
    adr: addressesDiffer(f.adr, draft.adr),
    bday: birthdaysDiffer(f.bday, draft.bday),
    org: draft.org !== f.org,
    title: draft.title !== f.title,
    url: draft.url !== f.url || (draft.urlType ?? "") !== (f.urlField ? fieldKind(f.urlField) : ""),
    note: draft.note !== f.note,
    photo: photosDiffer(f.photo, draft.photo),
  };
}

function fieldsDiffer(originals: ContactField[], drafts: DraftField[]): boolean {
  if (originals.length !== drafts.length) return true;
  return originals.some((orig, i) => {
    const draft = drafts[i];
    if (!draft) return true;
    return orig.value !== draft.value || fieldKind(orig) !== draft.type;
  });
}

function photosDiffer(orig: PhotoEdit, draft: PhotoEdit): boolean {
  if (orig.kind !== draft.kind) return true;
  return (
    orig.kind === "replaced" &&
    draft.kind === "replaced" &&
    (orig.mediaType !== draft.mediaType || orig.base64 !== draft.base64)
  );
}

function addressesDiffer(originals: VCardAddressField[], drafts: DraftAddress[]): boolean {
  if (originals.length !== drafts.length) return true;
  return originals.some((orig, i) => {
    const draft = drafts[i];
    return draft === undefined || addressDiffers(orig, draft);
  });
}

function addressDiffers(orig: VCardAddressField, draft: DraftAddress): boolean {
  return (
    !samePlace(orig, draft) ||
    JSON.stringify(orig.type) !== JSON.stringify(draft.type) ||
    savedLabelOf(orig) !== savedLabelOf(draft) ||
    (orig.source !== draft.source && JSON.stringify(orig.source) !== JSON.stringify(draft.source))
  );
}

function birthdaysDiffer(orig: VCardBirthdayField | null, draft: DraftBirthday | null): boolean {
  if (orig === null && draft === null) return false;
  if (orig === null || draft === null) return true;
  const parsed = fromDraftBirthday(draft);
  return orig.year !== parsed.year || orig.month !== parsed.month || orig.day !== parsed.day;
}

/** True when any field is dirty. */
export function isDirty(dirty: DirtyFields): boolean {
  return Object.values(dirty).some((v) => v);
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export type ValidationErrors = Record<string, string | undefined>;

/**
 * Validate a draft. Returns an errors map keyed by field path.
 * Only fields with errors are present. With `dirty`, a day its month doesn't
 * have counts only on an edited birthday: one another client stored stays as
 * it is, and doesn't hold back a save of other fields.
 */
export function validateDraft(draft: ContactDraft, dirty?: DirtyFields): ValidationErrors {
  const errors: ValidationErrors = {};

  // A card needs a name: a person's, or an organisation's for a company.
  if (
    draft.family.trim().length === 0 &&
    draft.given.trim().length === 0 &&
    draft.org.trim().length === 0
  ) {
    errors.name = "field_name_required";
  }

  // Email format validation (on blur and save)
  for (let i = 0; i < draft.email.length; i++) {
    const email = draft.email[i];
    if (email && email.value.length > 0 && !isValidEmail(email.value)) {
      errors[`email_${i}`] = "field_email_invalid";
    }
  }

  // A label alone isn't an address: a save would drop it with the label.
  draft.adr.forEach((adr, i) => {
    if ((adr.customLabel?.trim() ?? "").length > 0 && !writesAddress(adr)) {
      errors[`adr_${i}`] = "field_adr_empty";
    }
  });

  // URL format validation (lenient)
  if (draft.url.length > 0 && !isWebUrl(draft.url)) {
    errors.url = "field_url_invalid";
  }

  // BDAY day/month/year ranges and NaN guards
  if (draft.bday) {
    const { year, month, day } = fromDraftBirthday(draft.bday);
    if (month !== null) {
      if (!Number.isInteger(month) || month < 1 || month > 12) {
        errors.bday_month = "field_bday_month";
      }
    }
    if (day !== null) {
      if (!Number.isInteger(day) || day < 1 || day > 31) {
        errors.bday_day = "field_bday_day";
      }
    }
    if (year !== null) {
      if (!Number.isInteger(year) || year < 1) {
        errors.bday_year = "field_bday_year";
      }
    }
    // Day requires month
    if (day !== null && month === null) {
      errors.bday_month = "field_bday_month";
    }
    // Month requires year or day — a lone month is not representable in RFC 6350
    if (month !== null && year === null && day === null) {
      errors.bday_month = "field_bday_month";
    }
    if (
      (dirty?.bday ?? true) &&
      errors.bday_day === undefined &&
      errors.bday_month === undefined &&
      errors.bday_year === undefined &&
      day !== null &&
      month !== null &&
      day > daysInMonth(month, year)
    ) {
      errors.bday_day = "field_bday_day";
    }
  }

  return errors;
}

/**
 * The days of a month in the proleptic Gregorian calendar. Without a year,
 * February has 29: a birthday on the 29th is a real one.
 */
function daysInMonth(month: number, year: number | null): number {
  if (month !== 2) return [4, 6, 9, 11].includes(month) ? 30 : 31;
  if (year === null) return 29;
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  return leap ? 29 : 28;
}

/** True when the draft has no validation errors. */
export function isValid(errors: ValidationErrors): boolean {
  return Object.keys(errors).length === 0;
}

/** Lenient email check — requires at least one @ and a domain part. */
function isValidEmail(value: string): boolean {
  const at = value.lastIndexOf("@");
  if (at < 1) return false;
  const domain = value.slice(at + 1);
  return domain.includes(".") && domain.length >= 3;
}

/**
 * An http or https URL: the only kind a draft may hold, and the only kind
 * the contact page turns into a link, whatever another client wrote.
 */
export function isWebUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * What each scheme would read in a value as fields, an escape or a parameter
 * (RFC 6068, 5724, 3966). A `,` stays: it adds a recipient the user sees, or
 * a pause in a number.
 */
const URI_SYNTAX = { mailto: /[%?#&;=]/g, sms: /[%?#]/g, tel: /[%?#]/g };

/**
 * The link to a number or an address of a card, with the characters its
 * scheme would read as syntax encoded: `?` would start the URI's own fields
 * (a hidden copy, a prefilled body), `%` an escape. A phone dials `%23` as
 * `#` (RFC 3966), and a number's `;ext=` stays a parameter.
 */
export function valueHref(scheme: "mailto" | "sms" | "tel", value: string): string {
  return `${scheme}:${value.replace(URI_SYNTAX[scheme], (char) => encodeURIComponent(char))}`;
}

// ---------------------------------------------------------------------------
// Apply draft to contact fields
// ---------------------------------------------------------------------------

/**
 * Apply a draft's values onto a Contact's fields, mutating in place.
 * Returns the same contact reference for chaining.
 *
 * With `only`, fields that are not marked dirty keep the contact's values:
 * the overwrite flow applies just what the user changed onto the server's
 * fresh copy, so edits made elsewhere to other fields survive.
 *
 * FN is updated only when the original FN was derived from N parts
 * ("Given Family" or "Family Given" convention). Custom FN values like
 * "Maman", "Dupont, Jean", or prefix/suffix forms are preserved untouched.
 * A card left without a person's name is named after its organisation, when
 * its FN was empty, the organisation's, or derived from N.
 */
export function applyDraft(contact: Contact, draft: ContactDraft, only?: DirtyFields): Contact {
  const take = (field: keyof DirtyFields) => only === undefined || only[field];
  const f = contact.fields;

  // Capture original N parts BEFORE updating, so FN derivation can compare
  // the original FN against the original N composition
  const origN = { family: f.n.family, given: f.n.given };
  const origOrg = f.org;
  const newN = {
    family: take("family") ? draft.family : origN.family,
    given: take("given") ? draft.given : origN.given,
  };
  f.n.family = newN.family;
  f.n.given = newN.given;

  // Update FN if it was derived from N parts (not custom)
  const derivedFn = deriveFnFromN(f.fn, origN, newN);
  if (derivedFn !== null) {
    f.fn = derivedFn;
  }

  if (take("tel")) f.tel = draft.tel.map(fromDraftField);
  if (take("email")) f.email = draft.email.map(fromDraftField);
  if (take("nickname")) f.nickname = draft.nickname;
  if (take("adr")) f.adr = draft.adr.map(fromDraftAddress);
  if (take("bday")) f.bday = draft.bday !== null ? fromDraftBirthday(draft.bday) : null;
  if (take("org")) f.org = draft.org;
  // An organisation's card is named after it, once this edit changes a name.
  const named = f.org !== origOrg || newN.family !== origN.family || newN.given !== origN.given;
  const nameless = newN.family.trim().length === 0 && newN.given.trim().length === 0;
  if (named && nameless && f.org.trim().length > 0) {
    const fn = f.fn.trim().toLowerCase();
    if (fn.length === 0 || fn === origOrg.trim().toLowerCase() || composesN(fn, origN)) {
      f.fn = f.org.trim();
    }
  }
  if (take("title")) f.title = draft.title;
  if (take("url")) {
    f.url = draft.url;
    f.urlField = fromDraftField({
      id: "url",
      value: draft.url,
      type: draft.urlType ?? "",
      _orig: f.urlField ?? { value: f.url },
    });
  }
  if (take("note")) f.note = draft.note;
  if (take("photo")) f.photo = draft.photo;
  return contact;
}

/**
 * Attempt to derive a new FN from N parts when the original FN was itself
 * a plain composition of the old N parts. Returns the new FN, or null when
 * the original FN is custom and must be preserved untouched.
 *
 * Two conventions are recognised (compared case-insensitively, trimmed):
 *   "Given Family"  — e.g. N:Doe;John → FN:John Doe
 *   "Family Given"  — e.g. N:Doe;John → FN:Doe John
 *
 * When the original FN matches one of these patterns, it is updated to match
 * the new given/family parts using the same pattern. Otherwise the FN is
 * considered custom ("Maman", "Dupont, Jean", prefix/suffix) and left alone.
 */
function deriveFnFromN(
  currentFn: string,
  oldN: { family: string; given: string },
  newN: { family: string; given: string },
): string | null {
  const trimmed = (s: string) => s.trim();
  const oldGiven = trimmed(oldN.given);
  const oldFamily = trimmed(oldN.family);
  const newGiven = trimmed(newN.given);
  const newFamily = trimmed(newN.family);

  // If both new parts are empty, leave FN alone
  if (newGiven.length === 0 && newFamily.length === 0) return null;
  // If original FN is empty, derive from new N parts
  if (currentFn.trim().length === 0) {
    return newGiven.length > 0 ? `${newGiven} ${newFamily}` : newFamily;
  }

  const fnTrimmed = currentFn.trim();

  // Check "Given Family" convention: "John Doe" ← N:Doe;John
  if (fnTrimmed.length === 0) return null;
  if (
    oldGiven.length > 0 &&
    oldFamily.length > 0 &&
    fnTrimmed.toLowerCase() === `${oldGiven} ${oldFamily}`.toLowerCase()
  ) {
    return `${newGiven} ${newFamily}`;
  }

  // Check "Family Given" convention: "Doe John" ← N:Doe;John
  if (
    oldGiven.length > 0 &&
    oldFamily.length > 0 &&
    fnTrimmed.toLowerCase() === `${oldFamily} ${oldGiven}`.toLowerCase()
  ) {
    return `${newFamily} ${newGiven}`;
  }

  // Check single-part FN matching either given or family
  if (oldGiven.length > 0 && fnTrimmed.toLowerCase() === oldGiven.toLowerCase()) {
    return newGiven.length > 0 ? newGiven : newFamily;
  }
  if (oldFamily.length > 0 && fnTrimmed.toLowerCase() === oldFamily.toLowerCase()) {
    return newFamily.length > 0 ? newFamily : newGiven;
  }

  // FN is custom — preserve it
  return null;
}

/** Whether a lowercased FN is the N's parts, in either order or alone. */
function composesN(fn: string, n: { family: string; given: string }): boolean {
  const given = n.given.trim().toLowerCase();
  const family = n.family.trim().toLowerCase();
  const forms = [`${given} ${family}`, `${family} ${given}`, given, family];
  return forms.some((form) => form.trim().length > 0 && form.trim() === fn);
}

function fromDraftField(field: DraftField): ContactField {
  // Clone the original contact field and update value/type in place,
  // preserving all unknown params, groups, and the value type.
  const params: Record<string, string | string[]> = { ...(field._orig.params ?? {}) };

  const origTypeValues = typesOf(field._orig);

  // Only update TYPE if the user explicitly changed it
  if (field.type !== "label" && field.type !== fieldKind(field._orig)) {
    const types = withKind(origTypeValues, field.type);

    // Remove BOTH casings of the type param before writing the new one
    delete params.TYPE;
    delete params.type;

    // Use lowercase 'type' for ical.js compatibility — uppercase 'TYPE'
    // causes stringification crashes when a lowercase 'type' param coexists.
    const [only] = types;
    if (types.length > 1) {
      params.type = types;
    } else if (only !== undefined) {
      params.type = only;
    }
  }

  return {
    value: field.value,
    type: field._orig.type,
    params: Object.keys(params).length > 0 ? params : undefined,
    ...(field.type === "label" ? { label: field._orig.label } : {}),
    ...(field._orig.label !== undefined && field.type !== "label" ? { dropLabel: true } : {}),
  };
}

/** The kinds a row's type menu offers; any other TYPE value reads as "Autre". */
export const KINDS = ["cell", "work", "home"] as const;
export type Kind = (typeof KINDS)[number] | "";
export type FieldKind = Kind | "label";
/** An address's type menu also offers a label of the user's own (ADR 036). */
export type AddressKind = FieldKind | "custom";

function isKind(type: string): boolean {
  return (KINDS as readonly string[]).includes(type.toLowerCase());
}

/** The kind a list of TYPE values shows: Mobile before Travail before Domicile. */
export function kindOf(types: readonly string[]): Kind {
  const lower = types.map((type) => type.toLowerCase());
  return KINDS.find((kind) => lower.includes(kind)) ?? "";
}

/**
 * TYPE values with a new kind: the old kinds go, the new one leads, and every
 * other value (VOICE, PREF, INTERNET…) stays, all in the list's letter case.
 * An empty `kind` ("Autre") only drops the kinds.
 */
export function withKind(types: string[], kind: Kind): string[] {
  const kept = types.filter((type) => !isKind(type));
  return kind.length > 0 ? [inCaseOf(kind, types[0] ?? ""), ...kept] : kept;
}

function inCaseOf(value: string, reference: string): string {
  return reference.length > 0 && reference === reference.toUpperCase()
    ? value.toUpperCase()
    : value;
}
