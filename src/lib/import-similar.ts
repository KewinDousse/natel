/**
 * The book's contact an imported card looks like though its UID differs
 * (ADR 042): the same name, e-mail address or phone number. Only a hint for
 * the import's preview; nothing is merged.
 */

import { parsePhoneNumberFromString } from "libphonenumber-js";
import type { Contact } from "@/model/contact";
import { isGroupCard } from "@/vcard";
import { fold } from "./contact-list";

function nameKey(contact: Contact): string | null {
  const key = fold(contact.fields.fn).replace(/\s+/g, " ").trim();
  return key === "" ? null : key;
}

function emailKey(value: string): string | null {
  const key = value.trim().toLowerCase();
  return key === "" ? null : key;
}

/**
 * The number in international form, with Swiss numbers written nationally
 * read as Swiss (as formatPhone does), else its digits when there are enough
 * of them to tell numbers apart. Such a number only matches when written the
 * same way: a hint may miss, never invent a likeness.
 */
function phoneKey(value: string): string | null {
  const parsed = parsePhoneNumberFromString(value, { defaultCountry: "CH", extract: false });
  if (parsed?.isValid()) return parsed.number;
  const digits = value.replace(/\D/g, "");
  return digits.length >= 6 ? digits : null;
}

function keysOf(contact: Contact): string[] {
  const prefixed = (prefix: string, key: string | null) => (key === null ? [] : [prefix + key]);
  return [
    ...prefixed("n:", nameKey(contact)),
    ...contact.fields.email.flatMap((field) => prefixed("e:", emailKey(field.value))),
    ...contact.fields.tel.flatMap((field) => prefixed("t:", phoneKey(field.value))),
  ];
}

/** A lookup of `book`'s contacts by what an imported card may share with one. */
export function similarContactFinder(book: readonly Contact[]): (card: Contact) => Contact | null {
  const index = new Map<string, Contact>();
  for (const contact of book) {
    if (isGroupCard(contact)) continue;
    for (const key of keysOf(contact)) if (!index.has(key)) index.set(key, contact);
  }
  return (card) => {
    if (isGroupCard(card)) return null;
    for (const key of keysOf(card)) {
      const match = index.get(key);
      if (match) return match;
    }
    return null;
  };
}
