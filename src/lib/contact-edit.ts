/**
 * Contact edit state — pure logic for building drafts, detecting changes,
 * validating fields, and applying edits back to a Contact.
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

// ---------------------------------------------------------------------------
// Draft type — the shape the UI works with during editing
// ---------------------------------------------------------------------------

export type ContactDraft = {
  family: string;
  given: string;
  tel: DraftField[];
  email: DraftField[];
  nickname: string;
  /** null when the card has no address; may have partial content. */
  adr: VCardAddressField | null;
  /** null when the card has no birthday. */
  bday: DraftBirthday | null;
  org: string;
  title: string;
  url: string;
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

/** A TEL or EMAIL field in the draft, with a stable id for React keys. */
export type DraftField = {
  id: string;
  value: string;
  type: string;
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
  for (const key of Object.keys(current) as (keyof ContactDraft)[]) {
    if (current[key] !== sent[key]) Object.assign(rebased, { [key]: current[key] });
  }
  // Fields kept from `current` hold ids from before the rebuild: new ones
  // must not reuse them.
  for (const field of [...rebased.tel, ...rebased.email]) {
    const n = Number(field.id.slice(2));
    if (Number.isFinite(n) && n > _counter) _counter = n;
  }
  return rebased;
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
    adr: contact.fields.adr ? { ...contact.fields.adr } : null,
    bday: contact.fields.bday ? toDraftBirthday(contact.fields.bday) : null,
    org: contact.fields.org,
    title: contact.fields.title,
    url: contact.fields.url,
    note: contact.fields.note,
    photo: contact.fields.photo,
  };
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

function toDraftField(field: ContactField): DraftField {
  const types = field.params?.TYPE ?? field.params?.type;
  const type = Array.isArray(types) ? (types[0] ?? "") : typeof types === "string" ? types : "";
  return { id: nextId(), value: field.value, type: type.toLowerCase(), _orig: field };
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
    url: draft.url !== f.url,
    note: draft.note !== f.note,
    photo: photosDiffer(f.photo, draft.photo),
  };
}

function fieldsDiffer(originals: ContactField[], drafts: DraftField[]): boolean {
  if (originals.length !== drafts.length) return true;
  return originals.some((orig, i) => {
    const draft = drafts[i];
    if (!draft) return true;
    const origTypes = orig.params?.TYPE ?? orig.params?.type;
    const origType = Array.isArray(origTypes)
      ? (origTypes[0] ?? "")
      : typeof origTypes === "string"
        ? origTypes
        : "";
    return orig.value !== draft.value || origType.toLowerCase() !== draft.type;
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

function addressesDiffer(orig: VCardAddressField | null, draft: VCardAddressField | null): boolean {
  if (orig === null && draft === null) return false;
  if (orig === null || draft === null) return true;
  return (
    orig.poBox !== draft.poBox ||
    orig.extended !== draft.extended ||
    orig.street !== draft.street ||
    orig.locality !== draft.locality ||
    orig.region !== draft.region ||
    orig.postalCode !== draft.postalCode ||
    orig.country !== draft.country ||
    JSON.stringify(orig.type) !== JSON.stringify(draft.type)
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
 * Only fields with errors are present.
 */
export function validateDraft(draft: ContactDraft): ValidationErrors {
  const errors: ValidationErrors = {};

  // At least one of family or given must be non-empty
  if (draft.family.trim().length === 0 && draft.given.trim().length === 0) {
    errors.family = "field_required";
    errors.given = "field_required";
  }

  // Email format validation (on blur and save)
  for (let i = 0; i < draft.email.length; i++) {
    const email = draft.email[i];
    if (email && email.value.length > 0 && !isValidEmail(email.value)) {
      errors[`email_${i}`] = "field_email_invalid";
    }
  }

  // URL format validation (lenient)
  if (draft.url.length > 0 && !isValidUrl(draft.url)) {
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
  }

  return errors;
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

/** Lenient URL check — requires scheme + host. */
function isValidUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
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
 */
export function applyDraft(contact: Contact, draft: ContactDraft, only?: DirtyFields): Contact {
  const take = (field: keyof DirtyFields) => only === undefined || only[field];
  const f = contact.fields;

  // Capture original N parts BEFORE updating, so FN derivation can compare
  // the original FN against the original N composition
  const origN = { family: f.n.family, given: f.n.given };
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
  if (take("adr")) f.adr = draft.adr !== null ? { ...draft.adr } : null;
  if (take("bday")) f.bday = draft.bday !== null ? fromDraftBirthday(draft.bday) : null;
  if (take("org")) f.org = draft.org;
  if (take("title")) f.title = draft.title;
  if (take("url")) f.url = draft.url;
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

function fromDraftField(field: DraftField): ContactField {
  // Clone the original contact field and update value/type in place,
  // preserving all unknown params, groups, and the value type.
  const params: Record<string, string | string[]> = { ...(field._orig.params ?? {}) };

  const origTypes = field._orig.params?.TYPE ?? field._orig.params?.type;
  const origTypeValues = Array.isArray(origTypes)
    ? origTypes
    : typeof origTypes === "string"
      ? [origTypes]
      : [];
  const origFirstType = origTypeValues[0] ?? "";

  // Only update TYPE if the user explicitly changed it
  if (field.type.toLowerCase() !== origFirstType.toLowerCase()) {
    const types = replaceFirstType(origTypeValues, field.type);

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
  };
}

/**
 * Replace the first TYPE value — the one the UI shows and edits — keeping the
 * others (VOICE, PREF…) and the letter case of the list. An empty `value`
 * ("other") drops the first value only.
 */
export function replaceFirstType(types: string[], value: string): string[] {
  const [first = "", ...others] = types;
  const kept = others.filter((type) => type.toLowerCase() !== value.toLowerCase());
  return value.length > 0 ? [inCaseOf(value, first), ...kept] : kept;
}

/** `value` in the letter case of `reference`, so an uppercase TYPE list stays uppercase. */
function inCaseOf(value: string, reference: string): string {
  return reference.length > 0 && reference === reference.toUpperCase()
    ? value.toUpperCase()
    : value;
}
