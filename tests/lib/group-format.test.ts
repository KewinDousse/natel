/**
 * Tests for src/lib/group-format.ts — the format a new group membership is
 * written in, and what the question shows (ADR 052).
 */
import { describe, expect, it } from "vitest";
import {
  type BookGroupFormats,
  bookGroupFormats,
  formatQuestion,
  membershipFormat,
} from "@/lib/group-format";
import { parse } from "@/vcard";

const card = (lines: string[]) => parse(["BEGIN:VCARD", ...lines, "END:VCARD", ""].join("\r\n"));

const ada = card(["VERSION:3.0", "UID:ada", "FN:Ada", "CATEGORIES:Travail,Famille"]);
const family = card([
  "VERSION:3.0",
  "UID:g1",
  "FN:Famille",
  "X-ADDRESSBOOKSERVER-KIND:group",
  "X-ADDRESSBOOKSERVER-MEMBER:urn:uuid:ada",
]);
const empty = card(["VERSION:4.0", "UID:g3", "FN:Vide", "KIND:group"]);

const book = (cards: string[], categories: string[], complete = true): BookGroupFormats => ({
  cards: new Set(cards),
  categories: new Set(categories),
  complete,
});

describe("bookGroupFormats", () => {
  it("names the group cards, empty ones included, and the CATEGORIES values", () => {
    const formats = bookGroupFormats([ada], [family, empty], 0);
    expect([...formats.cards].sort()).toEqual(["Famille", "Vide"]);
    expect([...formats.categories].sort()).toEqual(["Famille", "Travail"]);
    expect(formats.complete).toBe(true);
  });

  it("is incomplete when a card could not be read", () => {
    expect(bookGroupFormats([ada], [], 1).complete).toBe(false);
  });
});

describe("membershipFormat", () => {
  it("keeps the format of a group stored one way, whatever was chosen (rule 1)", () => {
    const formats = book(["Famille"], ["Club"], false);
    expect(membershipFormat("Famille", formats, "categories")).toBe("cards");
    expect(membershipFormat("Club", formats, "cards")).toBe("categories");
  });

  it("uses the book's chosen format for a new group or one stored both ways (rule 2)", () => {
    const formats = book(["Famille"], ["Famille"]);
    expect(membershipFormat("Famille", formats, "categories")).toBe("categories");
    expect(membershipFormat("Club", formats, "cards")).toBe("cards");
  });

  it("writes cards in a fully read book with group cards and no CATEGORIES (rule 3)", () => {
    expect(membershipFormat("Club", book(["Famille"], []), null)).toBe("cards");
  });

  it("asks otherwise (rule 4)", () => {
    expect(membershipFormat("Club", book(["Famille"], [], false), null)).toBeNull();
    expect(membershipFormat("Club", book([], []), null)).toBeNull();
    expect(membershipFormat("Club", book([], ["Travail"]), null)).toBeNull();
    expect(membershipFormat("Famille", book(["Famille"], ["Famille"]), null)).toBeNull();
  });
});

describe("formatQuestion", () => {
  it("says the first thing found that applies", () => {
    expect(formatQuestion(book(["A"], ["B"], false)).finding).toBe("unread");
    expect(formatQuestion(book(["A"], ["B"])).finding).toBe("both");
    expect(formatQuestion(book([], ["B"])).finding).toBe("categories");
    expect(formatQuestion(book([], [])).finding).toBe("none");
  });

  it("preselects categories only for a book with categories and no group cards", () => {
    expect(formatQuestion(book([], ["B"])).preselected).toBe("categories");
    expect(formatQuestion(book(["A"], ["B"])).preselected).toBe("cards");
    expect(formatQuestion(book([], [])).preselected).toBe("cards");
  });

  it("recommends only when the cards read hold groups in one format", () => {
    expect(formatQuestion(book([], ["B"])).recommended).toBe(true);
    expect(formatQuestion(book(["A"], [], false)).recommended).toBe(true);
    expect(formatQuestion(book(["A"], ["B"])).recommended).toBe(false);
    expect(formatQuestion(book([], [])).recommended).toBe(false);
  });
});
