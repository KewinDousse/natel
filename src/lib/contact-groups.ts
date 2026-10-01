/**
 * Group names as ADR 022 reads them, within one address book: group cards
 * listing a contact, plus the contact's own CATEGORIES values. Names are
 * compared trimmed and case-sensitive.
 */
import type { Contact } from "@/model/contact";
import { groupCardOf, groupsOf } from "@/vcard";

type GroupCard = { name: string; members: string[] };

/** A contact's groups, each name once, group cards first. */
export function contactGroupNames(contact: Contact, groupCards: Contact[]): string[] {
  return namesOf(contact, groupCards.map(groupCardOf));
}

function namesOf(contact: Contact, groupCards: GroupCard[]): string[] {
  const uid = contact.uid.trim().replace(/^urn:uuid:/i, "");
  const names = new Set<string>();
  if (uid.length > 0) {
    for (const group of groupCards) {
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

/** A group of the book, as the list's group filter offers it. */
export type BookGroup = { name: string; count: number };

/**
 * Every group of a book with its number of contacts, sorted by name; a
 * group card with no member that resolves counts 0.
 */
export function bookGroups(contacts: Contact[], groupCards: Contact[]): BookGroup[] {
  const counts = new Map<string, number>();
  for (const name of bookGroupNames(contacts, groupCards)) counts.set(name, 0);
  const cards = groupCards.map(groupCardOf);
  for (const contact of contacts) {
    for (const name of namesOf(contact, cards)) {
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }
  return [...counts]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** The contacts in the group `name`, from its group cards or their CATEGORIES. */
export function contactsInGroup(
  contacts: Contact[],
  groupCards: Contact[],
  name: string,
): Contact[] {
  const cards = groupCards.map(groupCardOf);
  return contacts.filter((contact) => namesOf(contact, cards).includes(name));
}
