/**
 * Per-property edit round-trip tests.
 *
 * For every blocking item in the edit-mode review, asserts that editing ONE
 * field via buildDraft → applyDraft → serialise preserves all sibling
 * properties, params, groups, extraParts, and value types untouched.
 *
 * These tests enforce AGENTS.md invariant 4 — only the explicitly edited
 * property may change; the rest must byte-round-trip.
 */

import ICAL from "ical.js";
import { describe, expect, it } from "vitest";
import { applyDraft, buildDraft, validateDraft } from "../../src/lib/contact-edit";
import { parse, serialise } from "../../src/vcard";

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

/** Parse, apply a single field edit, serialise, and return the text. */
function editField(
  vcardText: string,
  editFn: (draft: ReturnType<typeof buildDraft>) => void,
): string {
  const contact = parse(vcardText);
  const draft = buildDraft(contact);
  editFn(draft);
  applyDraft(contact, draft);
  return serialise(contact);
}

/** True when the serialised text contains the given line fragment (case-insensitive for property groups). */
function contains(text: string, fragment: string): boolean {
  return text.replace(/\r\n?/g, "\n").toLowerCase().includes(fragment.toLowerCase());
}

// ---------------------------------------------------------------------------
// Test vCard strings
// ---------------------------------------------------------------------------

const VCARD_GROUPS = `BEGIN:VCARD
VERSION:3.0
FN:Grouped Contact
N:Contact;Grouped;;;
item1.EMAIL;TYPE=INTERNET:personal@example.com
item1.X-ABLabel:Personal
item2.EMAIL;TYPE=INTERNET:work@example.com
item2.X-ABLabel:Work
item3.TEL;TYPE=CELL:+1-555-444-4444
item3.X-ABLabel:Mobile
UID:grouped-test@example.com
END:VCARD`;

const VCARD_MULTI_TYPE = `BEGIN:VCARD
VERSION:3.0
FN:Multi-Type Contact
N:Contact;Multi;;;
TEL;TYPE=CELL,VOICE:+1-555-111-1111
TEL;TYPE=WORK:+1-555-222-2222
EMAIL;TYPE=INTERNET,PREF:primary@example.com
EMAIL;TYPE=INTERNET:secondary@example.com
UID:multi-type-test@example.com
END:VCARD`;

const VCARD_CUSTOM_FN = `BEGIN:VCARD
VERSION:3.0
FN:Maman
N:Doe;Jane;;;
UID:custom-fn-test@example.com
END:VCARD`;

const VCARD_ORG_UNIT = `BEGIN:VCARD
VERSION:3.0
FN:Org Unit Test
N:Test;Org;;;
ORG:Acme;Unit
UID:org-unit-test@example.com
END:VCARD`;

const VCARD_NICKNAME_MULTI = `BEGIN:VCARD
VERSION:3.0
FN:Nicky Test
N:Test;Nicky;;;
NICKNAME:Jean,Petit
UID:nickname-multi-test@example.com
END:VCARD`;

const VCARD_ADR_EXTRAPARTS = `BEGIN:VCARD
VERSION:3.0
FN:Adr Extra Test
N:Test;Adr;;;
ADR;TYPE=HOME:;;123 Main St;Springfield;;;US;Formatted Address Here
UID:adr-extra-test@example.com
END:VCARD`;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("edit round-trip — group preservation (item 1)", () => {
  it("preserves group params on sibling TEL/EMAIL after editing first tel", () => {
    const result = editField(VCARD_GROUPS, (draft) => {
      if (draft.tel[0]) draft.tel[0].value = "+1-555-444-4445";
    });
    // The item1.EMAIL and item2.EMAIL groups must survive
    expect(contains(result, "item1.EMAIL;TYPE=INTERNET:personal@example.com")).toBe(true);
    expect(contains(result, "item2.EMAIL;TYPE=INTERNET:work@example.com")).toBe(true);
    // The X-ABLabel params on siblings must survive
    expect(contains(result, "item1.X-ABLabel:Personal")).toBe(true);
    expect(contains(result, "item2.X-ABLabel:Work")).toBe(true);
    // The edited TEL must have the new value
    expect(contains(result, "item3.TEL;TYPE=CELL:+1-555-444-4445")).toBe(true);
  });

  it("preserves group params on sibling TEL/EMAIL after editing email", () => {
    const result = editField(VCARD_GROUPS, (draft) => {
      if (draft.email[0]) draft.email[0].value = "personal-new@example.com";
    });
    expect(contains(result, "item1.EMAIL;TYPE=INTERNET:personal-new@example.com")).toBe(true);
    expect(contains(result, "item2.EMAIL;TYPE=INTERNET:work@example.com")).toBe(true);
    expect(contains(result, "item1.X-ABLabel:Personal")).toBe(true);
    expect(contains(result, "item3.TEL;TYPE=CELL:+1-555-444-4444")).toBe(true);
    expect(contains(result, "item3.X-ABLabel:Mobile")).toBe(true);
  });

  it("preserves group params when adding a new tel", () => {
    const result = editField(VCARD_GROUPS, (draft) => {
      draft.tel.push({
        id: "new",
        value: "+1-555-555-5555",
        type: "home",
        _orig: { value: "+1-555-555-5555", params: { TYPE: "HOME" } },
      });
    });
    expect(contains(result, "item1.EMAIL;TYPE=INTERNET:personal@example.com")).toBe(true);
    expect(contains(result, "item1.X-ABLabel:Personal")).toBe(true);
    // The new TEL should be present
    expect(contains(result, "TEL;TYPE=HOME:+1-555-555-5555")).toBe(true);
  });
});

describe("edit round-trip — multi-TYPE preservation (item 1)", () => {
  it("preserves CELL,VOICE on untouched TEL after editing other tel", () => {
    const result = editField(VCARD_MULTI_TYPE, (draft) => {
      if (draft.tel[1]) draft.tel[1].value = "+1-555-222-2223";
    });
    // The untouched TEL must retain both TYPE values
    expect(contains(result, "TYPE=CELL,VOICE:+1-555-111-1111")).toBe(true);
    // The edited TEL must have the new value with original type
    expect(contains(result, "TYPE=WORK:+1-555-222-2223")).toBe(true);
  });

  it("preserves PREF on untouched EMAIL after editing other email", () => {
    const result = editField(VCARD_MULTI_TYPE, (draft) => {
      if (draft.email[1]) draft.email[1].value = "secondary-new@example.com";
    });
    // The first EMAIL must retain PREF and INTERNET
    const lines = result.replace(/\r\n?/g, "\n").split("\n");
    const prefEmail = lines.find((l) => l.includes("EMAIL") && l.includes("primary@example.com"));
    expect(prefEmail).toBeDefined();
    expect(prefEmail!.includes("PREF")).toBe(true);
    expect(prefEmail!.includes("INTERNET")).toBe(true);
  });

  it("preserves CELL,VOICE on untouched TEL with same-type edit", () => {
    const result = editField(VCARD_MULTI_TYPE, (draft) => {
      // Edit the first tel, keeping the same type
      if (draft.tel[0]) draft.tel[0].value = "+1-555-111-1112";
    });
    // The CELL,VOICE must survive even though type is "cell" (same as first)
    expect(contains(result, "TYPE=CELL,VOICE:+1-555-111-1112")).toBe(true);
  });
});

describe("edit round-trip — FN preservation (item 2)", () => {
  it("preserves custom FN after editing given name", () => {
    const result = editField(VCARD_CUSTOM_FN, (draft) => {
      draft.family = "Martin";
    });
    // FN must NOT become "Martin Jane" — must stay "Maman"
    expect(contains(result, "FN:Maman")).toBe(true);
    expect(contains(result, "N:Martin;Jane;;;")).toBe(true);
  });

  it("preserves custom FN after empty given name edit", () => {
    const result = editField(VCARD_CUSTOM_FN, (draft) => {
      draft.given = "Marie";
    });
    expect(contains(result, "FN:Maman")).toBe(true);
    expect(contains(result, "N:Doe;Marie;;;")).toBe(true);
  });
});

describe("edit round-trip — ORG secondary component preservation (item 3)", () => {
  it("preserves ORG secondary component on untouched round-trip", () => {
    const contact = parse(VCARD_ORG_UNIT);
    const draft = buildDraft(contact);
    applyDraft(contact, draft);
    const result = serialise(contact);
    // ORG must still have both components: Acme;Unit (not "Acme, Unit;Unit")
    expect(contains(result, "ORG:Acme;Unit")).toBe(true);
  });

  it("preserves ORG secondary component after editing org name", () => {
    const result = editField(VCARD_ORG_UNIT, (draft) => {
      draft.org = "NewOrg";
    });
    // ORG first component updated, second preserved
    expect(contains(result, "ORG:NewOrg;Unit")).toBe(true);
  });
});

describe("edit round-trip — NICKNAME multi-value preservation (item 4)", () => {
  it("preserves NICKNAME multi-values on untouched round-trip", () => {
    const contact = parse(VCARD_NICKNAME_MULTI);
    const draft = buildDraft(contact);
    applyDraft(contact, draft);
    const result = serialise(contact);
    // Both nickname values should survive
    expect(contains(result, "Jean") && contains(result, "Petit")).toBe(true);
  });
});

describe("edit round-trip — BDAY text / datetime preservation (item 5)", () => {
  it("preserves BDAY datetime time part on untouched round-trip", () => {
    const contact = parse(`BEGIN:VCARD
VERSION:3.0
FN:Bday DateTime Test
N:Test;Bday;;;
BDAY:1987-03-14T10:30:00Z
UID:bday-datetime-test@example.com
END:VCARD`);
    const draft = buildDraft(contact);
    applyDraft(contact, draft);
    const result = serialise(contact);
    // The time and timezone should be preserved. The exact format may vary
    // (HH:MM:SS vs HHMMSS) but the time value must survive.
    const lines = result.replace(/\r\n?/g, "\n").split("\n");
    const bdayLine = lines.find((l) => l.startsWith("BDAY") || l.startsWith("bday"));
    expect(bdayLine).toBeDefined();
    // Must contain time info after the date part
    expect(bdayLine!.includes("T")).toBe(true);
    expect(bdayLine!.includes("Z")).toBe(true);
  });
});

describe("edit round-trip — ADR extraParts preservation (item 6)", () => {
  it("preserves ADR 8th component on untouched round-trip", () => {
    const contact = parse(VCARD_ADR_EXTRAPARTS);
    const draft = buildDraft(contact);
    applyDraft(contact, draft);
    const result = serialise(contact);
    // The 8th ADR component (extraParts) must survive
    expect(contains(result, "Formatted Address Here")).toBe(true);
    expect(contains(result, "ADR;TYPE=HOME")).toBe(true);
    expect(contains(result, "123 Main St")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Tests for item 1: property creation on cards that lack them
// ---------------------------------------------------------------------------

describe("edit round-trip — property creation (item 1)", () => {
  const MINIMAL = `BEGIN:VCARD
VERSION:3.0
FN:Minimal Test
N:Test;Minimal;;;
UID:min-creation@example.com
END:VCARD`;

  it("creates NICKNAME on a card that lacks it", () => {
    const result = editField(MINIMAL, (draft) => {
      draft.nickname = "Nicky";
    });
    expect(contains(result, "NICKNAME:Nicky")).toBe(true);
  });

  it("creates TITLE on a card that lacks it", () => {
    const result = editField(MINIMAL, (draft) => {
      draft.title = "Engineer";
    });
    expect(contains(result, "TITLE:Engineer")).toBe(true);
  });

  it("creates URL on a card that lacks it", () => {
    const result = editField(MINIMAL, (draft) => {
      draft.url = "https://example.com";
    });
    expect(contains(result, "URL:https://example.com")).toBe(true);
  });

  it("creates NOTE on a card that lacks it", () => {
    const result = editField(MINIMAL, (draft) => {
      draft.note = "Some notes";
    });
    expect(contains(result, "NOTE:Some notes")).toBe(true);
  });

  it("creates ADR on a card that lacks it", () => {
    const contact = parse(MINIMAL);
    const draft = buildDraft(contact);
    draft.adr = {
      poBox: "",
      extended: "",
      street: "123 Main St",
      locality: "Springfield",
      region: "",
      postalCode: "12345",
      country: "US",
      type: ["HOME"],
      extraParts: [],
    };
    applyDraft(contact, draft);
    const result = serialise(contact);
    expect(contains(result, "ADR;TYPE=HOME:;;123 Main St;Springfield;;12345;US")).toBe(true);
  });

  it("creates BDAY on a card that lacks it", () => {
    const contact = parse(MINIMAL);
    const draft = buildDraft(contact);
    draft.bday = { source: "", year: "1987", month: "3", day: "14" };
    applyDraft(contact, draft);
    const result = serialise(contact);
    // Must have a BDAY line with the date (format may vary:
    // BDAY;VALUE=DATE:19870314 or BDAY:1987-03-14)
    const lines = result.replace(/\r\n?/g, "\n").split("\n");
    const bdayLine = lines.find((l) => l.startsWith("BDAY") || l.startsWith("bday"));
    expect(bdayLine).toBeDefined();
    expect(bdayLine!.includes("1987")).toBe(true);
    expect(bdayLine!.includes("03") || bdayLine!.includes("3")).toBe(true);
    expect(bdayLine!.includes("14")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Tests for item 2: type edit round-trip (no duplicate TYPE param)
// ---------------------------------------------------------------------------

describe("edit round-trip — type edit (item 2)", () => {
  it("changes TEL type cell→work with exactly one TYPE param", () => {
    const result = editField(VCARD_MULTI_TYPE, (draft) => {
      if (draft.tel[0]) draft.tel[0].type = "work";
    });
    // Exactly one TYPE param, uppercase like the original list, VOICE kept.
    const lines = result.replace(/\r\n?/g, "\n").split("\n");
    const editedTel = lines.find((l) => l.includes("+1-555-111-1111"));
    expect(editedTel).toBe("TEL;TYPE=WORK,VOICE:+1-555-111-1111");
  });

  it("changes TEL type work→home with exactly one TYPE param", () => {
    const result = editField(VCARD_MULTI_TYPE, (draft) => {
      if (draft.tel[1]) draft.tel[1].type = "home";
    });
    const lines = result.replace(/\r\n?/g, "\n").split("\n");
    const editedTel = lines.find((l) => l.includes("+1-555-222-2222"));
    expect(editedTel).toBe("TEL;TYPE=HOME:+1-555-222-2222");
  });

  it("preserves other params when changing type", () => {
    const result = editField(VCARD_GROUPS, (draft) => {
      if (draft.tel[0]) draft.tel[0].type = "work";
    });
    // The group prefix (item3) must survive the type change; ical.js
    // uppercases group and property names on every line.
    expect(result.replace(/\r\n?/g, "\n").split("\n")).toContain(
      "ITEM3.TEL;TYPE=WORK:+1-555-444-4444",
    );
  });
});

describe("edit round-trip — type edit keeps the other TYPE values", () => {
  it("keeps VOICE when the first type changes from CELL to WORK", () => {
    const result = editField(VCARD_MULTI_TYPE, (draft) => {
      if (draft.tel[0]) draft.tel[0].type = "work";
    });
    expect(result.split("\n").map((l) => l.trimEnd())).toContain(
      "TEL;TYPE=WORK,VOICE:+1-555-111-1111",
    );
  });

  it("keeps INTERNET and PREF when an email type changes", () => {
    const result = editField(VCARD_MULTI_TYPE, (draft) => {
      if (draft.email[0]) draft.email[0].type = "work";
    });
    expect(result.split("\n").map((l) => l.trimEnd())).toContain(
      "EMAIL;TYPE=WORK,INTERNET,PREF:primary@example.com",
    );
  });

  it("keeps a lowercase TYPE list lowercase", () => {
    const result = editField(
      "BEGIN:VCARD\nVERSION:4.0\nFN:A\nN:A;;;;\nTEL;TYPE=cell,voice:+1\nEND:VCARD",
      (draft) => {
        if (draft.tel[0]) draft.tel[0].type = "home";
      },
    );
    expect(result.split("\n").map((l) => l.trimEnd())).toContain("TEL;TYPE=home,voice:+1");
  });
});

// ---------------------------------------------------------------------------
// Tests for item 5: BDAY datetime preservation (no VALUE param added)
// ---------------------------------------------------------------------------

describe("edit round-trip — BDAY datetime preservation (item 5)", () => {
  it("preserves BDAY datetime untouched with no VALUE param", () => {
    const vcard = `BEGIN:VCARD
VERSION:3.0
FN:Bday DateTime Test
N:Test;Bday;;;
BDAY:1987-03-14T10:30:00Z
UID:bday-datetime-test@example.com
END:VCARD`;
    const contact = parse(vcard);
    const draft = buildDraft(contact);
    applyDraft(contact, draft);
    const result = serialise(contact);
    // Must NOT have VALUE=text or VALUE=date added
    expect(contains(result, "VALUE=")).toBe(false);
    // Must have time info
    expect(contains(result, "T10:30:00Z") || contains(result, "T103000Z")).toBe(true);
  });

  it("clears day of 1987-03-14 leaving year+month only", () => {
    const vcard = `BEGIN:VCARD
VERSION:3.0
FN:Bday Clear Day
N:Test;Bday;;;
BDAY:1987-03-14
UID:bday-clear-day@example.com
END:VCARD`;
    const contact = parse(vcard);
    const draft = buildDraft(contact);
    draft.bday = draft.bday ? { ...draft.bday, day: "", source: "1987-03" } : null;
    applyDraft(contact, draft);
    const result = serialise(contact);
    // Must contain month, year but NOT day 14
    const lines = result.replace(/\r\n?/g, "\n").split("\n");
    const bdayLine = lines.find((l) => l.startsWith("BDAY") || l.startsWith("bday"));
    expect(bdayLine).toBeDefined();
    // Should have 1987 and 03 but NOT 14
    expect(bdayLine!.includes("1987")).toBe(true);
    expect(bdayLine!.includes("03")).toBe(true);
    // Should NOT contain the old value with day 14
    expect(bdayLine!.includes("14")).toBe(false);
    // Should NOT have the full original date
    expect(bdayLine!.includes("1987-03-14")).toBe(false);
  });

  it("preserves BDAY untouched with no VALUE param added", () => {
    const vcard = `BEGIN:VCARD
VERSION:3.0
FN:Bday No Value
N:Test;Bday;;;
BDAY:1987-03-14T10:30:00Z
UID:bday-novalue@example.com
END:VCARD`;
    const contact = parse(vcard);
    const draft = buildDraft(contact);
    applyDraft(contact, draft);
    const result = serialise(contact);
    // BDAY line should have no VALUE param
    const lines = result.replace(/\r\n?/g, "\n").split("\n");
    const bdayLine = lines.find((l) => l.startsWith("BDAY") || l.startsWith("bday"));
    expect(bdayLine).toBeDefined();
    expect(bdayLine!.includes("VALUE=")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Tests for item 6: clearing visible value preserves sibling data
// ---------------------------------------------------------------------------

describe("edit round-trip — NICKNAME multi-value preservation on clear (item 6)", () => {
  it("preserves remaining NICKNAME values when first is cleared", () => {
    // NICKNAME:Jean,Petit — clearing "Jean" should keep "Petit"
    const result = editField(VCARD_NICKNAME_MULTI, (draft) => {
      draft.nickname = "";
    });
    // The remaining values should be preserved
    expect(contains(result, "Petit")).toBe(true);
    // NICKNAME property should still exist (with remaining values)
    expect(
      contains(result, "NICKNAME:Petit") ||
        contains(result, "NICKNAME:Petit,") ||
        contains(result, "NICKNAME:,Petit") ||
        contains(result, "NICKNAME:;Petit"),
    ).toBe(true);
  });
});

describe("edit round-trip — ORG secondary component preservation on clear (item 6)", () => {
  it("preserves ORG secondary component when org name is cleared", () => {
    const result = editField(VCARD_ORG_UNIT, (draft) => {
      draft.org = "";
    });
    // The secondary component (Unit) must survive even though org name is empty
    expect(contains(result, "Unit")).toBe(true);
    // The ORG property should still exist
    expect(contains(result, "ORG:;Unit") || contains(result, "ORG:;Unit")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Tests for item 7: FN follows derived N parts
// ---------------------------------------------------------------------------

describe("edit round-trip — FN follows derived N (item 7)", () => {
  const DERIVED_GIVEN_FAMILY = `BEGIN:VCARD
VERSION:3.0
FN:John Doe
N:Doe;John;;;
UID:derived-fn-test@example.com
END:VCARD`;

  const DERIVED_FAMILY_GIVEN = `BEGIN:VCARD
VERSION:3.0
FN:Doe John
N:Doe;John;;;
UID:derived-fn-family-given@example.com
END:VCARD`;

  const CUSTOM_FN = `BEGIN:VCARD
VERSION:3.0
FN:Maman
N:Doe;Jane;;;
UID:custom-fn-test@example.com
END:VCARD`;

  it("updates FN when derived from N (Given Family convention)", () => {
    const result = editField(DERIVED_GIVEN_FAMILY, (draft) => {
      draft.given = "Bob";
      draft.family = "Smith";
    });
    expect(contains(result, "FN:Bob Smith")).toBe(true);
    expect(contains(result, "N:Smith;Bob;;;")).toBe(true);
  });

  it("updates FN when derived from N (Family Given convention)", () => {
    const result = editField(DERIVED_FAMILY_GIVEN, (draft) => {
      draft.given = "Bob";
      draft.family = "Smith";
    });
    expect(contains(result, "FN:Smith Bob")).toBe(true);
    expect(contains(result, "N:Smith;Bob;;;")).toBe(true);
  });

  it("preserves custom FN (Maman) when renaming", () => {
    const result = editField(CUSTOM_FN, (draft) => {
      draft.given = "Marie";
    });
    expect(contains(result, "FN:Maman")).toBe(true);
    expect(contains(result, "N:Doe;Marie;;;")).toBe(true);
  });

  it("preserves custom FN with prefix form", () => {
    const vcard = `BEGIN:VCARD
VERSION:3.0
FN:Dupont, Jean
N:Dupont;Jean;;;
UID:custom-fn-prefix@example.com
END:VCARD`;
    const result = editField(vcard, (draft) => {
      draft.given = "Pierre";
    });
    // FN should stay as the custom value (ical.js may escape the comma)
    expect(contains(result, "dupont")).toBe(true);
    expect(contains(result, "jean")).toBe(true);
    // The FN must NOT become "Pierre Dupont" or "Dupont Pierre"
    expect(contains(result, "FN:Pierre Dupont")).toBe(false);
    expect(contains(result, "FN:Dupont Pierre")).toBe(false);
    expect(contains(result, "N:Dupont;Pierre;;;")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Tests for review item 2: isStructuredDateSource uses jCal value type, not regex
// ---------------------------------------------------------------------------

describe("edit round-trip — BDAY VALUE=text preservation via jCal value type (review item 2)", () => {
  it("preserves BDAY;VALUE=text:1950 after untouched save (digit-leading text parsed by ical.js)", () => {
    // ical.js normalizes BDAY;VALUE=text:1950 to a date with year=1950.
    // The value survives because readBirthday extracts year=1950.
    // The fix ensures the preserve-vs-clear branch uses jCal value type (not regex).
    const vcard = `BEGIN:VCARD
VERSION:3.0
FN:Bday Digit
N:Test;Bday;;;
BDAY;VALUE=text:1950
UID:bday-digit-test@example.com
END:VCARD`;
    const contact = parse(vcard);
    const draft = buildDraft(contact);
    applyDraft(contact, draft);
    const result = serialise(contact);
    // The year 1950 must survive in the output
    const lines = result.replace(/\r\n?/g, "\n").split("\n");
    const bdayLine = lines.find((l) => l.startsWith("BDAY") || l.startsWith("bday"));
    expect(bdayLine).toBeDefined();
    expect(bdayLine!.includes("1950")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Tests for review item 1: clearing all BDAY inputs removes the property
// ---------------------------------------------------------------------------

describe("edit round-trip — BDAY clear all parts (review item 1)", () => {
  it("removes BDAY when all three date parts are cleared on a structured date", () => {
    const vcard = `BEGIN:VCARD
VERSION:3.0
FN:Bday Clear All
N:Test;Bday;;;
BDAY:1987-03-14
UID:bday-clear-all@example.com
END:VCARD`;
    const contact = parse(vcard);
    const draft = buildDraft(contact);
    // User cleared all three inputs — source is now stale, every part is null
    draft.bday = draft.bday ? { ...draft.bday, year: "", month: "", day: "" } : null;
    applyDraft(contact, draft);
    const result = serialise(contact);
    const lines = result.replace(/\r\n?/g, "\n").split("\n");
    const bdayLine = lines.find((l) => l.startsWith("BDAY") || l.startsWith("bday"));
    expect(bdayLine).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// BDAY matrix — every case goes through the real ICAL.parse → parse() path
// ---------------------------------------------------------------------------

/** A minimal card around one BDAY line, with CRLF endings as servers send them. */
function bdayCard(bdayLine: string, version = "3.0"): string {
  return [
    "BEGIN:VCARD",
    `VERSION:${version}`,
    "FN:Bday Matrix",
    "N:Matrix;Bday;;;",
    bdayLine,
    "UID:bday-matrix@example.com",
    "END:VCARD",
    "",
  ].join("\r\n");
}

/** What ical.js emits for the card when nothing is edited. */
function untouched(text: string): string {
  return new ICAL.Component(ICAL.parse(text)).toString();
}

function bdayLineOf(text: string): string | undefined {
  return text.split("\r\n").find((l) => l.startsWith("BDAY"));
}

describe("BDAY matrix via real parse()", () => {
  describe.each(["3.0", "4.0"])("vCard %s", (version) => {
    it("1987-03-14: untouched save is identical", () => {
      const card = bdayCard("BDAY:1987-03-14", version);
      expect(editField(card, () => {})).toBe(untouched(card));
    });

    it("1987-03-14: editing the year applies", () => {
      const card = bdayCard("BDAY:1987-03-14", version);
      const result = editField(card, (draft) => {
        if (draft.bday) draft.bday.year = "1990";
      });
      expect(bdayLineOf(result)).toBe(
        version === "3.0" ? "BDAY;VALUE=DATE:19900314" : "BDAY:19900314",
      );
    });

    it("1987-03-14: clearing all three parts removes the property", () => {
      const card = bdayCard("BDAY:1987-03-14", version);
      const result = editField(card, (draft) => {
        if (draft.bday) {
          draft.bday.year = "";
          draft.bday.month = "";
          draft.bday.day = "";
        }
      });
      expect(bdayLineOf(result)).toBeUndefined();
    });

    it("1987-03-14: clearing the day alone keeps year and month", () => {
      const card = bdayCard("BDAY:1987-03-14", version);
      const result = editField(card, (draft) => {
        if (draft.bday) draft.bday.day = "";
      });
      expect(bdayLineOf(result)).toBe(
        version === "3.0" ? "BDAY;VALUE=DATE:1987-03" : "BDAY:1987-03",
      );
    });

    it("1987-03-14T10:30:00Z: untouched save is identical, time kept, no VALUE added", () => {
      const card = bdayCard("BDAY:1987-03-14T10:30:00Z", version);
      const result = editField(card, () => {});
      expect(result).toBe(untouched(card));
      expect(bdayLineOf(result)).toBe("BDAY:19870314T103000Z");
    });

    it("1987-03-14T10:30:00Z: editing the year keeps the time of day", () => {
      const card = bdayCard("BDAY:1987-03-14T10:30:00Z", version);
      const result = editField(card, (draft) => {
        if (draft.bday) draft.bday.year = "1990";
      });
      expect(bdayLineOf(result)).toBe("BDAY:19900314T103000Z");
    });

    it("--0314: untouched save is identical", () => {
      const card = bdayCard("BDAY:--0314", version);
      expect(editField(card, () => {})).toBe(untouched(card));
    });

    it("VALUE=text:1950: untouched save is identical", () => {
      const card = bdayCard("BDAY;VALUE=text:1950", version);
      const result = editField(card, () => {});
      expect(result).toBe(untouched(card));
      // ical.js retypes digit-only v3 text as a date (DECISIONS.md 012).
      expect(bdayLineOf(result)).toBe(
        version === "3.0" ? "BDAY;VALUE=DATE:1950" : "BDAY;VALUE=TEXT:1950",
      );
    });

    it("VALUE=text:circa 1987: parses without throwing", () => {
      const contact = parse(bdayCard("BDAY;VALUE=text:circa 1987", version));
      expect(contact.fields.bday).toEqual({
        source: "circa 1987",
        valueType: "text",
        year: null,
        month: null,
        day: null,
      });
      expect(contact.fields.fn).toBe("Bday Matrix");
    });

    it("VALUE=text:circa 1987: survives an untouched save", () => {
      const card = bdayCard("BDAY;VALUE=text:circa 1987", version);
      const result = editField(card, () => {});
      expect(bdayLineOf(result)).toBe("BDAY;VALUE=TEXT:circa 1987");
      const withoutBday = (text: string) => text.split("\r\n").filter((l) => !l.startsWith("BDAY"));
      expect(withoutBday(result)).toEqual(withoutBday(untouched(card)));
    });

    it("VALUE=text:circa 1987: survives saving an edit to another field", () => {
      const card = bdayCard("BDAY;VALUE=text:circa 1987", version);
      const result = editField(card, (draft) => {
        draft.given = "Renamed";
      });
      expect(bdayLineOf(result)).toBe("BDAY;VALUE=TEXT:circa 1987");
    });

    it("VALUE=text:circa 1987: typing a year replaces the text with a date", () => {
      const card = bdayCard("BDAY;VALUE=text:circa 1987", version);
      const result = editField(card, (draft) => {
        if (draft.bday) draft.bday.year = "1987";
      });
      expect(bdayLineOf(result)).toBe(version === "3.0" ? "BDAY;VALUE=DATE:1987" : "BDAY:1987");
    });
  });

  it("--0314: a lone month is rejected by validateDraft", () => {
    const draft = buildDraft(parse(bdayCard("BDAY:--0314")));
    if (draft.bday) draft.bday.day = "";
    expect(validateDraft(draft).bday_month).toBe("field_bday_month");
  });

  it("serialising twice gives the same text", () => {
    const contact = parse(bdayCard("BDAY;VALUE=text:circa 1987"));
    const first = serialise(contact);
    expect(serialise(contact)).toBe(first);
  });
});

describe("ADR via real parse()", () => {
  function adrCard(adrLine: string, version: string): string {
    return [
      "BEGIN:VCARD",
      `VERSION:${version}`,
      "FN:Adr Matrix",
      "N:Matrix;Adr;;;",
      adrLine,
      "END:VCARD",
      "",
    ].join("\r\n");
  }
  const adrLineOf = (text: string) => text.split("\r\n").find((l) => l.startsWith("ADR"));

  describe.each(["3.0", "4.0"])("vCard %s", (version) => {
    it("untouched save keeps parameter order", () => {
      const card = adrCard('ADR;TYPE=HOME;LABEL="1 Rue":;;1 Rue;Piltover;;0000;RT', version);
      expect(editField(card, () => {})).toBe(untouched(card));
    });

    it("untouched save keeps a list component as a list", () => {
      const card = adrCard("ADR;TYPE=home:;;Rue A,Bât B;Piltover;;0000;RT", version);
      expect(editField(card, () => {})).toBe(untouched(card));
    });

    it("editing the locality keeps the other parts and parameters as parsed", () => {
      const card = adrCard('ADR;TYPE=HOME;LABEL="x":;;Rue A,Bât B;Piltover;;0000;RT', version);
      const result = editField(card, (draft) => {
        if (draft.adr) draft.adr.locality = "Zaun";
      });
      expect(adrLineOf(result)).toBe("ADR;TYPE=HOME;LABEL=x:;;Rue A,Bât B;Zaun;;0000;RT");
    });
  });
});
