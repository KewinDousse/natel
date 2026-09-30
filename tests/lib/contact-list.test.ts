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
  matchesQuery,
  namePartsOf,
  orderedNameOf,
  railTarget,
  searchTargetOf,
  splitByQuery,
  trailingValueOf,
} from "@/lib/contact-list";
import type { Contact, RawComponent } from "@/model/contact";

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
      org: "",
      title: "",
      url: "",
      note: "",
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
    expect(fold("  BenAli ")).toBe("  benali ");
  });
});

describe("groupLetterOf", () => {
  it("returns the uppercase first letter of the folded key", () => {
    expect(groupLetterOf("Benali")).toBe("B");
    expect(groupLetterOf("Évrat")).toBe("E");
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
    const parts = namePartsOf(makeContact({ family: "Benali", given: "Karim" }));
    expect(parts).toEqual({ family: "Benali", given: "Karim", display: "Benali Karim" });
  });

  it("falls back to FN when N is empty", () => {
    const parts = namePartsOf(makeContact({ family: "", given: "", fn: "Acme SA" }));
    expect(parts).toEqual({ family: "Acme SA", given: "", display: "Acme SA" });
  });
});

describe("orderedNameOf", () => {
  const contact = makeContact({ family: "Favre", given: "Alain" });

  it("leads with the last name when sorted by last name", () => {
    expect(orderedNameOf(contact, "family")).toEqual({
      lead: "Favre",
      rest: "Alain",
      display: "Favre Alain",
    });
  });

  it("leads with the first name when sorted by first name", () => {
    expect(orderedNameOf(contact, "given")).toEqual({
      lead: "Alain",
      rest: "Favre",
      display: "Alain Favre",
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
    const familyOnly = makeContact({ family: "Favre", given: "" });
    expect(orderedNameOf(familyOnly, "given")).toEqual({
      lead: "Favre",
      rest: "",
      display: "Favre",
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
        { value: "021 123 45 67", params: { TYPE: "WORK" } },
        { value: "079 111 22 33", params: { TYPE: "CELL" } },
      ],
    });
    expect(trailingValueOf(contact)).toEqual({ kind: "tel", value: "079 111 22 33" });
  });

  it("matches TYPE=cell case-insensitively and as an array param", () => {
    const contact = makeContact({
      tel: [{ value: "079 111 22 33", params: { TYPE: ["cell", "voice"] } }],
    });
    expect(trailingValueOf(contact)).toEqual({ kind: "tel", value: "079 111 22 33" });
  });

  it("falls back to the first TEL, then EMAIL, then ORG", () => {
    expect(trailingValueOf(makeContact({ tel: [{ value: "021 123 45 67" }], email: [] }))).toEqual({
      kind: "tel",
      value: "021 123 45 67",
    });

    expect(
      trailingValueOf(makeContact({ tel: [], email: [{ value: "jean@example.ch" }] })),
    ).toEqual({ kind: "email", value: "jean@example.ch" });

    expect(trailingValueOf(makeContact({ tel: [], email: [], org: "Commune de Pully" }))).toEqual({
      kind: "org",
      value: "Commune de Pully",
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
        family: "Benali",
        given: "Karim",
        org: "TLP",
        tel: [{ value: "078 330 12 45" }],
        email: [{ value: "k.benali@tlp.ch" }],
      }),
    );
    expect(target.folded).toBe("benali karim karim benali k.benali@tlp.ch tlp");
    expect(target.digits).toBe("benalikarimkarimbenalikbenali@tlpchtlp0783301245");
  });
});

describe("matchesQuery", () => {
  const targetOf = (contact: Contact) => searchTargetOf(contact);
  const contact = makeContact({
    family: "Benali",
    given: "Karim",
    org: "Transports publics",
    tel: [{ value: "078 330 12 45" }],
    email: [{ value: "karim@tlp.ch" }],
  });

  it("matches on name, org and email, accent-insensitively", () => {
    expect(matchesQuery(targetOf(contact), "ben")).toBe(true);
    expect(matchesQuery(targetOf(contact), "KARIM")).toBe(true);
    expect(matchesQuery(targetOf(contact), "transports")).toBe(true);
    expect(matchesQuery(targetOf(contact), "karim@tlp")).toBe(true);
  });

  it("matches digit queries as digit substrings, with or without spaces", () => {
    expect(matchesQuery(targetOf(contact), "078330")).toBe(true);
    expect(matchesQuery(targetOf(contact), "078 330")).toBe(true);
    expect(matchesQuery(targetOf(contact), "330 12")).toBe(true);
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
    expect(splitByQuery("Benali", "ben")).toEqual([
      { text: "Ben", hit: true },
      { text: "ali", hit: false },
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
    expect(splitByQuery("Karim", "ben")).toEqual([{ text: "Karim", hit: false }]);
  });

  it("matches phone digits inside the value", () => {
    // Spaced query → the stored text contains it verbatim.
    expect(splitByQuery("078 330 12 45", "078 330")).toEqual([
      { text: "078 330", hit: true },
      { text: " 12 45", hit: false },
    ]);
    // Compact query only matches through the digit rule — the displayed
    // (spaced) value contains no such substring, so nothing is highlighted.
    expect(splitByQuery("078 330 12 45", "078330")).toEqual([
      { text: "078 330 12 45", hit: false },
    ]);
  });
});

describe("buildGroups", () => {
  const benali = makeContact({
    uid: "b1",
    family: "Benali",
    given: "Karim",
    org: "TLP",
    tel: [{ value: "078 330 12 45" }],
  });
  const bernasconi = makeContact({ uid: "b2", family: "Bernasconi", given: "Giulia" });
  const evrat = makeContact({ uid: "e1", family: "Évrat", given: "Luc" });
  const numero = makeContact({ uid: "n1", family: "123 Service", given: "" });
  const zoe = makeContact({ uid: "z1", family: "Zoe", given: "Zoe" });

  it("groups by the family initial with accented letters folded into A–Z", () => {
    const groups = buildGroups([zoe, evrat, bernasconi, benali], "family", "");
    expect(groups.map((g) => g.letter)).toEqual(["B", "E", "Z"]);
    expect(groups[0]?.contacts.map((c) => c.uid)).toEqual(["b1", "b2"]);
  });

  it("sorts contacts within a group by the sort key", () => {
    const groups = buildGroups([benali, bernasconi], "family", "");
    expect(groups[0]?.contacts.map((c) => c.uid)).toEqual(["b1", "b2"]);
  });

  it("puts the # group at the end, even though digits sort first", () => {
    const groups = buildGroups([numero, benali, zoe], "family", "");
    expect(groups.map((g) => g.letter)).toEqual(["B", "Z", "#"]);
    expect(groups[2]?.contacts.map((c) => c.uid)).toEqual(["n1"]);
  });

  it("switches the grouping key with the sort toggle", () => {
    // given: Giulia → G, Karim → K, Luc → L
    const groups = buildGroups([benali, bernasconi, evrat], "given", "");
    expect(groups.map((g) => g.letter)).toEqual(["G", "K", "L"]);
  });

  it("filters by query before grouping", () => {
    const groups = buildGroups([benali, bernasconi, evrat], "family", "bern");
    expect(groups).toHaveLength(1);
    expect(groups[0]?.contacts.map((c) => c.uid)).toEqual(["b2"]);
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
