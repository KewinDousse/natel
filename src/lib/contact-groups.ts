/**
 * Group names as ADR 022 reads them, within one address book: group cards
 * listing a contact, plus the contact's own CATEGORIES values. Names are
 * compared trimmed and case-sensitive.
 */
import { bookGroupFormats, groupNames } from "@/lib/group-format";
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

/** Every group name of a book, empty group cards included, sorted. */
export function bookGroupNames(contacts: Contact[], groupCards: Contact[]): string[] {
  return groupNames(bookGroupFormats(contacts, groupCards, 0));
}

/** A group of the book, as the list's group filter offers it. */
export type BookGroup = { name: string; count: number };

/**
 * The list's group filter choice: a group's name, or NO_GROUP for the
 * contacts in none. A symbol, since any string can be a group's name.
 */
export const NO_GROUP = Symbol("no group");
export type GroupChoice = string | typeof NO_GROUP;

/**
 * Every group of a book with its number of contacts, sorted by name, and
 * the number of contacts in none; a group card with no member that
 * resolves counts 0.
 */
export function bookGroups(
  contacts: Contact[],
  groupCards: Contact[],
): { groups: BookGroup[]; noGroupCount: number } {
  const counts = new Map<string, number>();
  for (const name of bookGroupNames(contacts, groupCards)) counts.set(name, 0);
  const cards = groupCards.map(groupCardOf);
  let noGroupCount = 0;
  for (const contact of contacts) {
    const names = namesOf(contact, cards);
    if (names.length === 0) noGroupCount += 1;
    for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  const groups = [...counts]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return { groups, noGroupCount };
}

/**
 * The contacts in the group `choice`, from its group cards or their
 * CATEGORIES; for NO_GROUP, those that neither puts in a group.
 */
export function contactsInGroup(
  contacts: Contact[],
  groupCards: Contact[],
  choice: GroupChoice,
): Contact[] {
  const cards = groupCards.map(groupCardOf);
  return contacts.filter((contact) => {
    const names = namesOf(contact, cards);
    return choice === NO_GROUP ? names.length === 0 : names.includes(choice);
  });
}
