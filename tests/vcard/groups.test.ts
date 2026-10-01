/**
 * Tests for the group-card readers in src/vcard (ADR 022).
 */
import { describe, expect, it } from "vitest";
import {
  addMember,
  ensureUid,
  groupCardOf,
  groupsOf,
  isGroupCard,
  newGroupCard,
  parse,
  removeCategory,
  removeMember,
  serialiseRaw,
} from "@/vcard";

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

describe("removeCategory", () => {
  it("drops only that value and keeps parameters and the group prefix", () => {
    const c = card(["VERSION:3.0", "UID:c", "item1.CATEGORIES;X-P=1:Travail,Famille"]);
    expect(removeCategory(c, "Famille")).toBe(true);
    expect(serialiseRaw(c)).toMatch(/item1\.CATEGORIES;X-P=1:Travail\r\n/i);
  });

  it("drops the property once empty, and changes nothing for another name", () => {
    const c = card(["VERSION:3.0", "UID:c", "CATEGORIES: Famille ", "X-KEEP:yes"]);
    expect(removeCategory(c, "Club")).toBe(false);
    expect(removeCategory(c, "Famille")).toBe(true);
    expect(serialiseRaw(c)).not.toContain("CATEGORIES");
    expect(serialiseRaw(c)).toContain("X-KEEP:yes");
  });
});

describe("addMember / removeMember", () => {
  const apple = () =>
    card([
      "VERSION:3.0",
      "UID:g",
      "FN:Famille",
      "X-ADDRESSBOOKSERVER-KIND:group",
      "X-ADDRESSBOOKSERVER-MEMBER:urn:uuid:bob",
      "X-UNKNOWN;P=1:kept",
    ]);

  it("adds the member line the card already uses, keeping the rest", () => {
    const g = apple();
    expect(addMember(g, "ada")).toBe(true);
    const text = serialiseRaw(g);
    expect(text).toContain("X-ADDRESSBOOKSERVER-MEMBER:urn:uuid:ada");
    expect(text).toContain("X-UNKNOWN;P=1:kept");
  });

  it("uses MEMBER on a 4.0 card without members, and doesn't double the prefix", () => {
    const g = card(["VERSION:4.0", "UID:g", "FN:Club", "KIND:group"]);
    addMember(g, "urn:uuid:ada");
    expect(serialiseRaw(g)).toContain("MEMBER:urn:uuid:ada");
    expect(serialiseRaw(g)).not.toContain("urn:uuid:urn:uuid:");
  });

  it("adds nothing for a member already listed", () => {
    expect(addMember(apple(), "bob")).toBe(false);
  });

  it("removes every line naming the member, with or without the prefix", () => {
    const g = card(["VERSION:4.0", "UID:g", "KIND:group", "MEMBER:urn:uuid:ada", "MEMBER:ada"]);
    expect(removeMember(g, "ada")).toBe(true);
    expect(serialiseRaw(g)).not.toContain("ada");
  });
});

describe("newGroupCard", () => {
  it("writes a 3.0 group card with one member and an escaped name", () => {
    const g = newGroupCard("Amis, proches", "ada");
    const text = serialiseRaw(g);
    expect(text).toContain("VERSION:3.0");
    expect(text).toContain("FN:Amis\\, proches");
    expect(text).toContain("X-ADDRESSBOOKSERVER-KIND:group");
    expect(text).toContain("X-ADDRESSBOOKSERVER-MEMBER:urn:uuid:ada");
    expect(isGroupCard(g)).toBe(true);
    expect(groupCardOf(g)).toEqual({ name: "Amis, proches", members: ["ada"] });
    expect(g.uid.length).toBeGreaterThan(0);
  });
});

describe("ensureUid", () => {
  it("gives a UID to a card without one, and leaves others alone", () => {
    const noUid = ensureUid(card(["VERSION:3.0", "FN:X"]));
    expect(noUid.uid.length).toBeGreaterThan(0);
    expect(serialiseRaw(noUid)).toContain(`UID:${noUid.uid}`);
    expect(ensureUid(card(["VERSION:3.0", "UID:u", "FN:X"])).uid).toBe("u");
  });

  it("fills a blank UID line rather than adding a second one", () => {
    for (const blank of ["UID:", "UID:  "]) {
      const filled = ensureUid(card(["VERSION:3.0", blank, "FN:X"]));
      const text = serialiseRaw(filled);
      expect(text.match(/^UID/gm)).toHaveLength(1);
      expect(parse(text).uid).toBe(filled.uid);
    }
  });
});
