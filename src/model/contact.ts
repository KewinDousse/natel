/**
 * Contact model.
 *
 * Properties the UI does not explicitly edit are preserved in `raw` and
 * written back unchanged on save.
 */

import type ICAL from "ical.js";

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
  raw: ICAL.Component;
};
