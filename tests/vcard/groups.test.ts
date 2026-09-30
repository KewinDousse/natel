/**
 * Tests for the group-card readers in src/vcard (ADR 022).
 */
import { describe, expect, it } from "vitest";
import { groupCardOf, groupsOf, isGroupCard, parse } from "@/vcard";

const card = (lines: string[]) => parse(["BEGIN:VCARD", ...lines, "END:VCARD", ""].join("\r\n"));

describe("isGroupCard", () => {
  it("knows both forms, in any case", () => {
    expect(isGroupCard(card(["VERSION:4.0", "UID:g", "KIND:group", "FN:Famille"]))).toBe(true);
    expect(
      isGroupCard(card(["VERSION:3.0", "UID:g", "X-ADDRESSBOOKSERVER-KIND:Group", "FN:F"])),
    ).toBe(true);
    expect(isGroupCard(card(["VERSION:4.0", "UID:c", "KIND:individual", "FN:Ada"]))).toBe(false);
    expect(isGroupCard(card(["VERSION:3.0", "UID:c", "FN:Ada"]))).toBe(false);
  });
});

describe("groupCardOf", () => {
  it("reads the name and the members of both forms", () => {
    const group = card([
      "VERSION:3.0",
      "UID:g",
      "FN: Famille ",
      "X-ADDRESSBOOKSERVER-KIND:group",
      "X-ADDRESSBOOKSERVER-MEMBER:urn:uuid:ada",
      "X-ADDRESSBOOKSERVER-MEMBER:URN:UUID:bob",
      "MEMBER:carl",
    ]);
    expect(groupCardOf(group)).toEqual({ name: "Famille", members: ["carl", "ada", "bob"] });
  });

  it("joins every part of N that isn't empty", () => {
    expect(groupCardOf(card(["VERSION:3.0", "UID:g", "N:;;;Les;Amis", "KIND:group"])).name).toBe(
      "Les Amis",
    );
  });

  it("falls back to N, then to the UID, for the name", () => {
    expect(groupCardOf(card(["VERSION:3.0", "UID:g", "N:Amis;;;;", "KIND:group"])).name).toBe(
      "Amis",
    );
    expect(groupCardOf(card(["VERSION:4.0", "UID:g1", "KIND:group"])).name).toBe("g1");
  });
});

describe("groupsOf", () => {
  it("trims CATEGORIES values and drops empty ones", () => {
    expect(groupsOf(card(["VERSION:3.0", "UID:c", "CATEGORIES: Travail ,,Club"]))).toEqual([
      "Travail",
      "Club",
    ]);
  });
});
