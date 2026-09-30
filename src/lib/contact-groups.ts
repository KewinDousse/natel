/**
 * Group names as ADR 022 reads them, within one address book: group cards
 * listing a contact, plus the contact's own CATEGORIES values. Names are
 * compared trimmed and case-sensitive.
 */
import type { Contact } from "@/model/contact";
import { groupCardOf, groupsOf } from "@/vcard";

/** A contact's groups, each name once, group cards first. */
export function contactGroupNames(contact: Contact, groupCards: Contact[]): string[] {
  const uid = contact.uid.trim().replace(/^urn:uuid:/i, "");
  const names = new Set<string>();
  if (uid.length > 0) {
    for (const card of groupCards) {
      const group = groupCardOf(card);
      if (group.name.length > 0 && group.members.includes(uid)) names.add(group.name);
    }
  }
  for (const name of groupsOf(contact)) names.add(name);
  return [...names];
}

/**
 * Every group name of a book, empty group cards included, sorted: the
 * suggestions of "Ajouter un groupe".
 */
export function bookGroupNames(contacts: Contact[], groupCards: Contact[]): string[] {
  const names = new Set<string>();
  for (const card of groupCards) {
    const { name } = groupCardOf(card);
    if (name.length > 0) names.add(name);
  }
  for (const contact of contacts) for (const name of groupsOf(contact)) names.add(name);
  return [...names].sort((a, b) => a.localeCompare(b));
}
