/**
 * Tests for src/lib/contact-groups.ts — merging group cards and CATEGORIES
 * the way ADR 022 reads them.
 */
import { describe, expect, it } from "vitest";
import {
  bookGroupNames,
  bookGroups,
  contactGroupNames,
  contactsInGroup,
} from "@/lib/contact-groups";
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
const club = card(["VERSION:4.0", "UID:g2", "FN:Club", "KIND:group", "MEMBER:urn:uuid:ada"]);
const empty = card(["VERSION:4.0", "UID:g3", "FN:Vide", "KIND:group"]);

describe("contactGroupNames", () => {
  it("merges group cards and CATEGORIES, each name once", () => {
    expect(contactGroupNames(ada, [family, club, empty])).toEqual(["Famille", "Club", "Travail"]);
  });

  it("compares names case-sensitively", () => {
    const lower = card(["VERSION:3.0", "UID:ada", "CATEGORIES:famille"]);
    expect(contactGroupNames(lower, [family])).toEqual(["Famille", "famille"]);
  });

  it("matches a urn:uuid: UID against a bare member", () => {
    const urn = card(["VERSION:3.0", "UID:urn:uuid:ada", "FN:Ada"]);
    const bare = card(["VERSION:4.0", "UID:g", "FN:Club", "KIND:group", "MEMBER:ada"]);
    expect(contactGroupNames(urn, [bare])).toEqual(["Club"]);
  });

  it("keeps a name once when a group card and CATEGORIES share it", () => {
    const padded = card([
      "VERSION:3.0",
      "UID:g",
      "FN: Famille ",
      "X-ADDRESSBOOKSERVER-KIND:group",
      "X-ADDRESSBOOKSERVER-MEMBER:urn:uuid:ada",
    ]);
    expect(contactGroupNames(ada, [padded])).toEqual(["Famille", "Travail"]);
  });

  it("finds no group card membership without a UID", () => {
    const noUid = card(["VERSION:3.0", "FN:X"]);
    expect(contactGroupNames(noUid, [family])).toEqual([]);
  });
});

describe("bookGroupNames", () => {
  it("offers every name of the book, empty groups included", () => {
    expect(bookGroupNames([ada], [family, club, empty])).toEqual([
      "Club",
      "Famille",
      "Travail",
      "Vide",
    ]);
  });
});

describe("bookGroups", () => {
  const grace = card(["VERSION:3.0", "UID:grace", "FN:Grace", "CATEGORIES:Famille"]);
  const alan = card(["VERSION:3.0", "UID:alan", "FN:Alan"]);

  it("counts each group's contacts once, empty groups at 0, sorted", () => {
    expect(bookGroups([ada, grace, alan], [family, club, empty])).toEqual([
      { name: "Club", count: 1 },
      { name: "Famille", count: 2 },
      { name: "Travail", count: 1 },
      { name: "Vide", count: 0 },
    ]);
  });

  it("is empty for a book without groups", () => {
    expect(bookGroups([alan], [])).toEqual([]);
  });
});

describe("contactsInGroup", () => {
  const grace = card(["VERSION:3.0", "UID:grace", "FN:Grace", "CATEGORIES:Famille"]);
  const alan = card(["VERSION:3.0", "UID:alan", "FN:Alan"]);

  it("keeps the members from group cards and from CATEGORIES", () => {
    expect(contactsInGroup([ada, grace, alan], [family], "Famille")).toEqual([ada, grace]);
    expect(contactsInGroup([ada, grace, alan], [family], "Vide")).toEqual([]);
  });
});
