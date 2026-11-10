/**
 * The format a new group membership is written in (ADR 052): a group card
 * listing the member, or a CATEGORIES value on the member's own card.
 */
import type { Contact } from "@/model/contact";
import { groupCardOf, groupsOf } from "@/vcard";

export const GROUP_FORMATS = ["cards", "categories"] as const;
export type GroupFormat = (typeof GROUP_FORMATS)[number];

/** What a book shows of its groups. */
export type BookGroupFormats = {
  /** Names of the book's group cards. */
  cards: ReadonlySet<string>;
  /** Names found as CATEGORIES values on the book's contacts. */
  categories: ReadonlySet<string>;
  /** True when every card of the book was read (DESIGN.md "Incomplete address book"). */
  complete: boolean;
};

export function bookGroupFormats(
  contacts: Contact[],
  groupCards: Contact[],
  skipped: number,
): BookGroupFormats {
  const cards = new Set<string>();
  for (const card of groupCards) {
    const { name } = groupCardOf(card);
    if (name.length > 0) cards.add(name);
  }
  const categories = new Set<string>();
  for (const contact of contacts) for (const name of groupsOf(contact)) categories.add(name);
  return { cards, categories, complete: skipped === 0 };
}

/** Every group name of a book, empty group cards included, sorted. */
export function groupNames(book: BookGroupFormats): string[] {
  return [...new Set([...book.cards, ...book.categories])].sort((a, b) => a.localeCompare(b));
}

/**
 * The format for adding a contact to `name`, from the first of ADR 052's
 * rules 1 to 3 that applies; null when Natel has to ask.
 */
export function membershipFormat(
  name: string,
  book: BookGroupFormats,
  chosen: GroupFormat | null,
): GroupFormat | null {
  const inCards = book.cards.has(name);
  const inCategories = book.categories.has(name);
  // Rule 1: a group stored one way keeps it, so its members stay together.
  if (inCards !== inCategories) return inCards ? "cards" : "categories";
  if (chosen !== null) return chosen;
  // Rule 3: CATEGORIES alone never sets the format, since its values may be tags.
  if (book.complete && book.cards.size > 0 && book.categories.size === 0) return "cards";
  return null;
}

/** What the question says Natel found, the first that applies. */
export type FormatFinding = "unread" | "both" | "categories" | "none";

export type FormatQuestion = {
  finding: FormatFinding;
  preselected: GroupFormat;
  /** True when the cards read hold groups in one format only. */
  recommended: boolean;
};

export function formatQuestion(book: BookGroupFormats): FormatQuestion {
  const hasCards = book.cards.size > 0;
  const hasCategories = book.categories.size > 0;
  let finding: FormatFinding = "none";
  if (!book.complete) finding = "unread";
  else if (hasCards && hasCategories) finding = "both";
  else if (hasCategories) finding = "categories";
  return {
    finding,
    preselected: hasCategories && !hasCards ? "categories" : "cards",
    recommended: hasCards !== hasCategories,
  };
}
