/**
 * Contact model.
 *
 * Properties the UI does not explicitly edit are preserved in `raw` and
 * written back unchanged on save.
 *
 * model/ never imports ical.js — vCard types here are minimal structural
 * interfaces (only the members src/vcard/ actually uses), so the architecture
 * boundary (ical.js → src/vcard/ only) is enforced at the import level.
 */

/** Minimal structural type for a vCard property. Only methods used by src/vcard/ are declared. */
export interface RawProperty {
  /** Lower case, as ical.js stores it. */
  readonly name: string;
  toJSON(): unknown;
  getFirstValue(): unknown;
  /** All values of a multi-value property (e.g. CATEGORIES). */
  getValues(): unknown[];
  setValues(values: unknown[]): void;
  resetType(type: string): void;
  setValue(value: unknown): void;
  setParameter(name: string, value: string | string[]): void;
  removeParameter(name: string): void;
}

/**
 * Minimal structural type for a vCard component.
 * Only methods and return shapes used by src/vcard/ are declared.
 */
export interface RawComponent {
  getFirstPropertyValue(name: string): unknown;
  getFirstProperty(name: string): RawProperty | null;
  getAllProperties(name?: string): RawProperty[];
  removeAllProperties(name: string): void;
  removeProperty(nameOrProp: string | RawProperty): boolean;
  addProperty(prop: RawProperty): unknown;
  toString(): string;
}

/** A single vCard property value as stored in EditableFields. */
export type ContactField = {
  value: string;
  /** Value type (e.g. "text", "phone-number", "binary"). */
  type?: string;
  /** Parameters, including "group" when present. */
  params?: Record<string, string | string[]>;
  /** The `X-ABLABEL` of the property's group (ADR 030), read-only. */
  label?: string;
  /** Set when the user picks a type instead of the label: the save drops that `X-ABLABEL`. */
  dropLabel?: true;
};

/** The subset of vCard properties the UI can edit. */
export type EditableFields = {
  fn: string;
  n: {
    family: string;
    given: string;
    additional: string;
    prefix: string;
    suffix: string;
  };
  tel: ContactField[];
  email: ContactField[];
  nickname: string;
  adr: VCardAddressField[];
  bday: VCardBirthdayField | null;
  org: string;
  title: string;
  url: string;
  /** Metadata of the first URL, preserved when its value is edited. */
  urlField?: ContactField;
  note: string;
  photo: PhotoEdit;
};

/**
 * The photo as edited (ADR 023). Only a replaced or removed photo touches
 * `PHOTO` on save; an unchanged one leaves every `PHOTO` as it was.
 */
export type PhotoEdit =
  | { kind: "unchanged" }
  | {
      kind: "replaced";
      mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
      base64: string;
    }
  | { kind: "removed" };

/** A single ADR property as stored in EditableFields. */
export type VCardAddressField = {
  /** The ADR property as read, which a save writes back from: absent on a new address. */
  source?: AddressSource;
  poBox: string;
  extended: string;
  street: string;
  locality: string;
  region: string;
  postalCode: string;
  country: string;
  type: string[];
  /** Any extra components beyond the standard 7 (some clients add a
   *  formatted-address component). These are preserved as-is. */
  extraParts: string[];
  /** The `X-ABLABEL` of the property's group (ADR 030). */
  label?: string;
  /** Set when the user picks a type instead of the label: the save drops that `X-ABLABEL`. */
  dropLabel?: true;
  /** A label typed by the user, written as the property's `X-ABLABEL` (ADR 036). */
  customLabel?: string;
};

/**
 * An ADR property as parsed: its value and its parameters, group included.
 * An address carries it so a save writes it back whole, wherever the
 * property now sits on the card.
 */
export type AddressSource = {
  value: unknown;
  params: Record<string, string | string[]>;
  /** The `X-ABADR` values of its group, absent when it has none. */
  abadr?: string[];
};

/** A single BDAY property as stored in EditableFields. */
export type VCardBirthdayField = {
  source: string;
  year: number | null;
  month: number | null;
  day: number | null;
  /** jCal value type (e.g. "text", "date", "date-time"). When undefined the default date type applies. */
  valueType?: string;
};

export type Contact = {
  /** Resource URL on the server. */
  href: string;
  /** Last known ETag. */
  etag: string;
  uid: string;
  /** The subset the UI edits. */
  fields: EditableFields;
  /** The full parsed component, kept as-is for properties the UI never touches. */
  raw: RawComponent;
};
