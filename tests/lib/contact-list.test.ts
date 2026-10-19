/**
 * Pure-function tests for src/lib/contact-list.ts — folding, grouping,
 * sorting, trailing-value priority, search matching, highlighting, and
 * route-id mapping. No React, no DOM.
 */

import { describe, expect, it } from "vitest";
import {
  buildGroups,
  contactById,
  contactIdOf,
  fold,
  groupLetterOf,
  isOrgCard,
  isUnnamed,
  matchesQuery,
  namePartsOf,
  orderedNameOf,
  railTarget,
  searchTargetOf,
  splitByQuery,
  trailingValueOf,
} from "@/lib/contact-list";
import type { Contact, RawComponent } from "@/model/contact";
import { parse } from "@/vcard";

/** Minimal Contact with an org stubbed through the raw component. */
type ContactOverrides = {
  uid?: string;
  href?: string;
  family?: string;
  given?: string;
  fn?: string;
  org?: string | string[] | null;
  tel?: Contact["fields"]["tel"];
  email?: Contact["fields"]["email"];
};

function makeContact(overrides: ContactOverrides = {}): Contact {
  const {
    family = "Dupont",
    given = "Jean",
    fn = `${family} ${given}`,
    org = null,
    ...rest
  } = overrides;
  return {
    href: rest.href ?? "https://dav.example.com/cards/u.vcf",
    etag: '"e1"',
    uid: rest.uid ?? "u-1",
    fields: {
      fn,
      n: { family, given, additional: "", prefix: "", suffix: "" },
      tel: rest.tel ?? [],
      email: rest.email ?? [],
      nickname: "",
      adr: null,
      bday: null,
      org: Array.isArray(org) ? (org[0] ?? "") : (org ?? ""),
      title: "",
      url: "",
      note: "",
      photo: { kind: "unchanged" },
    },
    raw: {
      getFirstPropertyValue: (name: string) => (name === "org" ? (org ?? "") : ""),
    } as unknown as RawComponent,
  };
}

describe("fold", () => {
  it("strips accents via NFD", () => {
    expect(fold("Élise")).toBe("elise");
    expect(fold("Crêpe")).toBe("crepe");
    expect(fold("Aéroport")).toBe("aeroport");
  });

  it("maps ł, ø, đ", () => {
    expect(fold("Łukasz")).toBe("lukasz");
    expect(fold("Øyvind")).toBe("oyvind");
    expect(fold("Đorđe")).toBe("dorde");
  });

  it("lowercases and trims nothing", () => {
    expect(fold("  MeDarda ")).toBe("  medarda ");
  });
});

describe("groupLetterOf", () => {
  it("returns the uppercase first letter of the folded key", () => {
    expect(groupLetterOf("Medarda")).toBe("M");
    expect(groupLetterOf("Éclat")).toBe("E");
    expect(groupLetterOf("Łukasz")).toBe("L");
  });

  it("sends non-A–Z initials to the # group", () => {
    expect(groupLetterOf("123 Service")).toBe("#");
    expect(groupLetterOf("")).toBe("#");
    expect(groupLetterOf("-prefix")).toBe("#");
  });
});

describe("namePartsOf", () => {
  it("uses the structured name", () => {
    const parts = namePartsOf(makeContact({ family: "Medarda", given: "Mel" }));
    expect(parts).toEqual({ family: "Medarda", given: "Mel", display: "Medarda Mel" });
  });

  it("falls back to FN when N is empty", () => {
    const parts = namePartsOf(makeContact({ family: "", given: "", fn: "Acme SA" }));
    expect(parts).toEqual({ family: "Acme SA", given: "", display: "Acme SA" });
  });
});

describe("isUnnamed", () => {
  it("holds for a card with neither a name nor an organisation", () => {
    expect(isUnnamed(makeContact({ family: "", given: "", fn: "" }))).toBe(true);
    expect(isUnnamed(makeContact({ family: "", given: "", fn: "", org: "Acme" }))).toBe(false);
    expect(isUnnamed(makeContact({ family: "", given: "", fn: "Acme SA" }))).toBe(false);
    expect(isUnnamed(makeContact({ family: "Fortune", given: "" }))).toBe(false);
  });
});

describe("orderedNameOf", () => {
  const contact = makeContact({ family: "Fortune", given: "Sarah" });

  it("leads with the last name when sorted by last name", () => {
    expect(orderedNameOf(contact, "family")).toEqual({
      lead: "Fortune",
      rest: "Sarah",
      display: "Fortune Sarah",
    });
  });

  it("leads with the first name when sorted by first name", () => {
    expect(orderedNameOf(contact, "given")).toEqual({
      lead: "Sarah",
      rest: "Fortune",
      display: "Sarah Fortune",
    });
  });

  it("lets FN lead either way on a card without a structured name", () => {
    const fnOnly = makeContact({ family: "", given: "", fn: "Acme SA" });
    expect(orderedNameOf(fnOnly, "given").display).toBe("Acme SA");
    expect(orderedNameOf(fnOnly, "family").display).toBe("Acme SA");
  });

  it("leaves an org-only card without a name", () => {
    const orgOnly = makeContact({ family: "", given: "", fn: "", org: "Acme" });
    expect(orderedNameOf(orgOnly, "given")).toEqual({ lead: "", rest: "", display: "" });
  });

  it("lets the other part lead when the sorted one is missing", () => {
    const familyOnly = makeContact({ family: "Fortune", given: "" });
    expect(orderedNameOf(familyOnly, "given")).toEqual({
      lead: "Fortune",
      rest: "",
      display: "Fortune",
    });
  });
});

describe("railTarget", () => {
  const letters = ["A", "B", "C", "D"];
  const present = new Set(["B", "D"]);

  it("lands on the letter under the finger when the list has it", () => {
    expect(railTarget(letters, present, 1)).toBe("B");
  });

  it("moves on to the next present letter", () => {
    expect(railTarget(letters, present, 2)).toBe("D");
  });

  it("falls back to the last present letter before the end", () => {
    expect(railTarget(letters, new Set(["A", "B"]), 3)).toBe("B");
  });

  it("skips an absent first letter", () => {
    expect(railTarget(letters, present, 0)).toBe("B");
  });

  it("finds nothing in an empty list", () => {
    expect(railTarget(letters, new Set(), 0)).toBeUndefined();
  });
});

describe("trailingValueOf", () => {
  it("prefers the first TEL with TYPE=cell over other tels", () => {
    const contact = makeContact({
      tel: [
        { value: "021 000 00 05", params: { TYPE: "WORK" } },
        { value: "079 000 00 06", params: { TYPE: "CELL" } },
      ],
    });
    expect(trailingValueOf(contact)).toEqual({ kind: "tel", value: "079 000 00 06" });
  });

  it("matches TYPE=cell case-insensitively and as an array param", () => {
    const contact = makeContact({
      tel: [{ value: "079 000 00 06", params: { TYPE: ["cell", "voice"] } }],
    });
    expect(trailingValueOf(contact)).toEqual({ kind: "tel", value: "079 000 00 06" });
  });

  it("falls back to the first TEL, then EMAIL, then ORG", () => {
    expect(trailingValueOf(makeContact({ tel: [{ value: "021 000 00 05" }], email: [] }))).toEqual({
      kind: "tel",
      value: "021 000 00 05",
    });

    expect(
      trailingValueOf(makeContact({ tel: [], email: [{ value: "jean@example.org" }] })),
    ).toEqual({ kind: "email", value: "jean@example.org" });

    expect(
      trailingValueOf(makeContact({ tel: [], email: [], org: "Conseil de Piltover" })),
    ).toEqual({
      kind: "org",
      value: "Conseil de Piltover",
    });
  });

  it("returns null when nothing is present", () => {
    expect(trailingValueOf(makeContact())).toBeNull();
  });
});

describe("searchTargetOf", () => {
  it("folds name, org, emails and phones as stored", () => {
    const target = searchTargetOf(
      makeContact({
        family: "Medarda",
        given: "Mel",
        org: "Piltover",
        tel: [{ value: "078 000 00 03" }],
        email: [{ value: "mel@medarda.example" }],
      }),
    );
    expect(target.folded).toBe("medarda mel mel medarda mel@medarda.example piltover");
    expect(target.digits).toBe("medardamelmelmedardamel@medardaexamplepiltover0780000003");
  });
});

describe("matchesQuery", () => {
  const targetOf = (contact: Contact) => searchTargetOf(contact);
  const contact = makeContact({
    family: "Medarda",
    given: "Mel",
    org: "Conseil de Piltover",
    tel: [{ value: "078 000 00 03" }],
    email: [{ value: "mel@medarda.example" }],
  });

  it("matches on name, org and email, accent-insensitively", () => {
    expect(matchesQuery(targetOf(contact), "med")).toBe(true);
    expect(matchesQuery(targetOf(contact), "MEL")).toBe(true);
    expect(matchesQuery(targetOf(contact), "conseil")).toBe(true);
    expect(matchesQuery(targetOf(contact), "mel@med")).toBe(true);
  });

  it("matches digit queries as digit substrings, with or without spaces", () => {
    expect(matchesQuery(targetOf(contact), "078000")).toBe(true);
    expect(matchesQuery(targetOf(contact), "078 000")).toBe(true);
    expect(matchesQuery(targetOf(contact), "000 00")).toBe(true);
  });

  it("uses the compact-digit rule only from 3 digits", () => {
    // "00012" exists only in the compact digits (the stored text is spaced),
    // so it can only match through the digit rule.
    const zebra = makeContact({ family: "Zebra", tel: [{ value: "040 000 12 34" }] });
    expect(matchesQuery(searchTargetOf(zebra), "00012")).toBe(true);
    // "01" is also in the compact digits — but 2 digits is below the rule's
    // threshold, and the spaced text does not contain it.
    expect(matchesQuery(searchTargetOf(zebra), "01")).toBe(false);
  });

  it("a 1-digit query never matches phone digits", () => {
    const zebra = makeContact({ family: "Zebra", tel: [{ value: "040 000 12 34" }] });
    // "1" appears in the phone but is below the ≥3-digit gate and is not in
    // folded (TEL is excluded from folded).
    expect(matchesQuery(searchTargetOf(zebra), "1")).toBe(false);
  });

  it("a 2-digit query never matches phone digits", () => {
    const zebra = makeContact({ family: "Zebra", tel: [{ value: "040 000 12 34" }] });
    // "12" appears in the phone but is below the ≥3-digit gate and is not in
    // folded (TEL is excluded from folded).
    expect(matchesQuery(searchTargetOf(zebra), "12")).toBe(false);
  });

  it("never lets a query with letters match phone digits", () => {
    // "a0783" has letters → only the folded-text path applies, and the folded
    // text contains no such substring.
    expect(matchesQuery(targetOf(contact), "a0783")).toBe(false);
    expect(matchesQuery(targetOf(contact), "7x")).toBe(false);
  });

  it("an empty query matches everything", () => {
    expect(matchesQuery(targetOf(contact), "   ")).toBe(true);
  });
});

describe("splitByQuery", () => {
  it("marks the matching substring", () => {
    expect(splitByQuery("Medarda", "med")).toEqual([
      { text: "Med", hit: true },
      { text: "arda", hit: false },
    ]);
  });

  it("is accent-insensitive and marks the matching characters", () => {
    expect(splitByQuery("Élise", "elise")).toEqual([{ text: "Élise", hit: true }]);
    expect(splitByQuery("Élise", "elis")).toEqual([
      { text: "Élis", hit: true },
      { text: "e", hit: false },
    ]);
  });

  it("marks every occurrence", () => {
    expect(splitByQuery("Ana Ana", "ana")).toEqual([
      { text: "Ana", hit: true },
      { text: " ", hit: false },
      { text: "Ana", hit: true },
    ]);
  });

  it("returns a single plain segment when there is no match", () => {
    expect(splitByQuery("Mel", "amb")).toEqual([{ text: "Mel", hit: false }]);
  });

  it("matches phone digits inside the value", () => {
    // Spaced query → the stored text contains it verbatim.
    expect(splitByQuery("078 000 00 03", "078 000")).toEqual([
      { text: "078 000", hit: true },
      { text: " 00 03", hit: false },
    ]);
    // Compact query only matches through the digit rule — the displayed
    // (spaced) value contains no such substring, so nothing is highlighted.
    expect(splitByQuery("078 000 00 03", "078000")).toEqual([
      { text: "078 000 00 03", hit: false },
    ]);
  });
});

describe("buildGroups", () => {
  const jarvan = makeContact({
    uid: "l2",
    family: "Lightshield",
    given: "Jarvan",
    org: "Demacia",
    tel: [{ value: "078 000 00 03" }],
  });
  const fiora = makeContact({ uid: "l1", family: "Laurent", given: "Fiora" });
  const ezreal = makeContact({ uid: "e1", family: "Éclat", given: "Ezreal" });
  const numero = makeContact({ uid: "n1", family: "123 Service", given: "" });
  const zoe = makeContact({ uid: "z1", family: "Zoe", given: "Zoe" });

  it("groups by the family initial with accented letters folded into A–Z", () => {
    const groups = buildGroups([zoe, ezreal, jarvan, fiora], "family", "");
    expect(groups.map((g) => g.letter)).toEqual(["E", "L", "Z"]);
    expect(groups[1]?.contacts.map((c) => c.uid)).toEqual(["l1", "l2"]);
  });

  it("sorts contacts within a group by the sort key", () => {
    const groups = buildGroups([jarvan, fiora], "family", "");
    expect(groups[0]?.contacts.map((c) => c.uid)).toEqual(["l1", "l2"]);
  });

  it("puts the # group at the end, even though digits sort first", () => {
    const groups = buildGroups([numero, jarvan, zoe], "family", "");
    expect(groups.map((g) => g.letter)).toEqual(["L", "Z", "#"]);
    expect(groups[2]?.contacts.map((c) => c.uid)).toEqual(["n1"]);
  });

  it("switches the grouping key with the sort toggle", () => {
    // given: Ezreal → E, Fiora → F, Jarvan → J
    const groups = buildGroups([jarvan, fiora, ezreal], "given", "");
    expect(groups.map((g) => g.letter)).toEqual(["E", "F", "J"]);
  });

  it("filters by query before grouping", () => {
    const groups = buildGroups([jarvan, fiora, ezreal], "family", "laur");
    expect(groups).toHaveLength(1);
    expect(groups[0]?.contacts.map((c) => c.uid)).toEqual(["l1"]);
  });
});

describe("contact ids", () => {
  it("uses a URL-safe uid as-is", () => {
    const contact = makeContact({ uid: "550e8400-e29b-41d4-a716-446655440000" });
    expect(contactIdOf(contact)).toBe("550e8400-e29b-41d4-a716-446655440000");
  });

  it("falls back to a stable hash for unsafe uids", () => {
    const contact = makeContact({
      uid: "un safe/uid",
      href: "https://dav.example.com/cards/1.vcf",
    });
    expect(contactIdOf(contact)).toMatch(/^h[0-9a-f]{8}$/);
    expect(contactIdOf(contact)).toBe(contactIdOf(contact));
  });

  it("hashes the href when the uid is empty", () => {
    const contact = makeContact({ uid: "", href: "https://dav.example.com/cards/2.vcf" });
    expect(contactIdOf(contact)).toMatch(/^h[0-9a-f]{8}$/);
  });

  it("finds a contact by id and returns undefined when missing", () => {
    const contacts = [makeContact({ uid: "a" }), makeContact({ uid: "b" })];
    expect(contactById(contacts, "a")?.uid).toBe("a");
    expect(contactById(contacts, "zz")).toBeUndefined();
  });
});

describe("empty handlings", () => {
  it("buildGroups with no contacts returns no groups", () => {
    expect(buildGroups([], "family", "")).toEqual([]);
  });

  it("trailingValueOf is null for a nameless, orgless card", () => {
    expect(trailingValueOf(makeContact({ family: "", given: "", fn: "" }))).toBeNull();
  });
});

describe("isOrgCard", () => {
  it("holds for a card named after its organisation, or not named at all", () => {
    expect(isOrgCard(makeContact({ family: "", given: "", fn: "Acme SA", org: "Acme SA" }))).toBe(
      true,
    );
    expect(isOrgCard(makeContact({ family: "", given: "", fn: "", org: "Acme" }))).toBe(true);
  });

  it("doesn't hold for a person, or a name of its own", () => {
    expect(isOrgCard(makeContact({ family: "Medarda", given: "Mel", org: "Conseil" }))).toBe(false);
    expect(isOrgCard(makeContact({ family: "", given: "", fn: "Maman", org: "Acme" }))).toBe(false);
    expect(isOrgCard(makeContact({ family: "", given: "", fn: "Acme SA" }))).toBe(false);
  });

  it("holds for an organisation with units, named after the organisation", () => {
    const contact = parse(
      "BEGIN:VCARD\r\nVERSION:3.0\r\nUID:acme\r\nFN:ACME\r\nN:;;;;\r\nORG:ACME;Sales\r\nEND:VCARD",
    );
    expect(isOrgCard(contact)).toBe(true);
  });
});

describe("N components holding several values", () => {
  // RFC 6350 §6.2.2; ical.js reads such a component as an array.
  const alix = parse(
    ["BEGIN:VCARD", "VERSION:3.0", "UID:alix", "FN:", "N:Test;Alice,Alix;;;", "END:VCARD"].join(
      "\r\n",
    ),
  );

  it("sorts and groups the card by the values read as one text", () => {
    const other = makeContact({ uid: "zoe", family: "Abel", given: "Zoé" });
    const groups = buildGroups([other, alix], "given", "");
    expect(groups.map((g) => [g.letter, g.contacts.map((c) => c.uid)])).toEqual([
      ["A", ["alix"]],
      ["Z", ["zoe"]],
    ]);
    expect(namePartsOf(alix).display).toBe("Test Alice, Alix");
  });

  it("finds the card by any of the values", () => {
    expect(matchesQuery(searchTargetOf(alix), "alix")).toBe(true);
    expect(buildGroups([alix], "family", "alix").flatMap((g) => g.contacts)).toEqual([alix]);
  });
});
