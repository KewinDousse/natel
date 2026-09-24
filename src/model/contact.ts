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
  toJSON(): unknown;
  getFirstValue(): unknown;
  /** All values of a multi-value property (e.g. CATEGORIES). */
  getValues(): unknown[];
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
  adr: VCardAddressField | null;
  bday: VCardBirthdayField | null;
  org: string;
  title: string;
  url: string;
  note: string;
};

/** A single ADR property as stored in EditableFields. */
export type VCardAddressField = {
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
};

/** A single BDAY property as stored in EditableFields. */
export type VCardBirthdayField = {
  source: string;
  year: number | null;
  month: number | null;
  day: number | null;
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
