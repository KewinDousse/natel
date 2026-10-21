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
import {
  applyDraft,
  buildDraft,
  dirtyDiff,
  newDraftAddress,
  rebaseDraft,
  validateDraft,
} from "../../src/lib/contact-edit";
import { draftReducer } from "../../src/lib/draft-reducer";
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
    draft.adr = [
      {
        id: "a",
        poBox: "",
        extended: "",
        street: "123 Main St",
        locality: "Springfield",
        region: "",
        postalCode: "12345",
        country: "US",
        type: ["HOME"],
        extraParts: [],
      },
    ];
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

describe("edit round-trip: N components holding several values", () => {
  // RFC 6350 §6.2.2: a component may hold a comma-separated list of values.
  const VCARD_N_LISTS = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    "FN:Alice Test",
    "N:Test;Alice,Alix;;Dr,Prof;",
    "NOTE:before",
    "END:VCARD",
  ].join("\r\n");

  function nLine(text: string): string | undefined {
    return text.split(/\r\n/).find((line) => line.startsWith("N:"));
  }

  it("reads each list as one text", () => {
    expect(parse(VCARD_N_LISTS).fields.n).toEqual({
      family: "Test",
      given: "Alice, Alix",
      additional: "",
      prefix: "Dr, Prof",
      suffix: "",
    });
  });

  it("keeps N as it is when another field is edited", () => {
    const text = editField(VCARD_N_LISTS, (draft) => {
      draft.note = "after";
    });
    expect(nLine(text)).toBe("N:Test;Alice,Alix;;Dr,Prof;");
    expect(contains(text, "NOTE:after")).toBe(true);
  });

  it("keeps the lists of the components not edited", () => {
    const text = editField(VCARD_N_LISTS, (draft) => {
      draft.family = "Muster";
    });
    expect(nLine(text)).toBe("N:Muster;Alice,Alix;;Dr,Prof;");
  });

  it("writes an edited component as typed, a single value", () => {
    const text = editField(VCARD_N_LISTS, (draft) => {
      draft.given = "Alice, Alixe";
    });
    expect(nLine(text)).toBe("N:Test;Alice\\, Alixe;;Dr,Prof;");
    expect(parse(text).fields.n.given).toBe("Alice, Alixe");
  });

  it("keeps the components past the fifth when the name is edited", () => {
    const text = editField(
      VCARD_N_LISTS.replace("N:Test;Alice,Alix;;Dr,Prof;", "N:Test;Alice;;;;Second,Third;Jr"),
      (draft) => {
        draft.given = "Alix";
      },
    );
    expect(nLine(text)).toBe("N:Test;Alix;;;;Second,Third;Jr");
  });

  it("leaves a single-component N as it is when the name isn't edited", () => {
    const text = editField(
      VCARD_N_LISTS.replace("N:Test;Alice,Alix;;Dr,Prof;", "N:Test"),
      (draft) => {
        draft.note = "after";
      },
    );
    expect(nLine(text)).toBe("N:Test");
  });
});

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

/** What ical.js emits for the card when nothing is edited, ended as serialise() ends it. */
function untouched(text: string): string {
  return `${new ICAL.Component(ICAL.parse(text)).toString()}\r\n`;
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
        if (draft.adr[0]) draft.adr[0].locality = "Zaun";
      });
      expect(adrLineOf(result)).toBe("ADR;TYPE=HOME;LABEL=x:;;Rue A,Bât B;Zaun;;0000;RT");
    });

    it("removing the first address leaves the second as parsed, with its group", () => {
      const second = "item1.ADR;TYPE=WORK;X-KEEP=yes:;;Quai A,Quai B;Zaun;;0001;RT";
      const card = adrCard(`ADR;TYPE=HOME:;;1 Rue;Piltover;;0000;RT\r\n${second}`, version);
      const result = editField(card, (draft) => {
        draft.adr.shift();
      });
      const lines = result.split("\r\n").filter((l) => /^(item1\.)?ADR/i.test(l));
      expect(lines).toEqual([
        untouched(card)
          .split("\r\n")
          .find((l) => /^item1\./i.test(l)),
      ]);
    });

    it("editing the second address leaves the first as parsed", () => {
      const first = 'ADR;TYPE=HOME;LABEL="1 Rue":;;Rue A,Bât B;Piltover;;0000;RT';
      const card = adrCard(`${first}\r\nADR:;;Quai 2;Zaun;;0001;RT`, version);
      const result = editField(card, (draft) => {
        if (draft.adr[1]) draft.adr[1].extended = "c/o Vi";
      });
      const lines = result.split("\r\n").filter((l) => l.startsWith("ADR"));
      expect(lines).toEqual([
        untouched(card)
          .split("\r\n")
          .find((l) => l.startsWith("ADR;")),
        "ADR:;c/o Vi;Quai 2;Zaun;;0001;RT",
      ]);
    });

    it("adds a new address after the card's own", () => {
      const card = adrCard("ADR;TYPE=HOME:;;1 Rue;Piltover;;0000;RT", version);
      const result = editField(card, (draft) => {
        draft.adr.push({ ...newDraftAddress(), street: "Quai 2", locality: "Zaun" });
      });
      expect(result.split("\r\n").filter((l) => l.startsWith("ADR"))).toEqual([
        "ADR;TYPE=HOME:;;1 Rue;Piltover;;0000;RT",
        "ADR:;;Quai 2;Zaun;;;",
      ]);
    });

    it("adds no property for a new address left blank", () => {
      const card = adrCard("ADR;TYPE=HOME:;;1 Rue;Piltover;;0000;RT", version);
      const result = editField(card, (draft) => {
        draft.adr.push(newDraftAddress());
      });
      expect(result).toBe(untouched(card));
    });
  });
});

describe("ADR: each address keeps its own property", () => {
  const A = "item1.ADR;TYPE=HOME:;;Rue A;Piltover;;0000;RT";
  const B = "item2.ADR;TYPE=WORK;X-B=b:;;Quai B,Quai C;Zaun;;0001;RT";
  const card = (...lines: string[]) =>
    [
      "BEGIN:VCARD",
      "VERSION:3.0",
      "UID:adr-identity",
      "FN:Vi",
      "N:;Vi;;;",
      ...lines,
      "END:VCARD",
      "",
    ].join("\r\n");
  const adrLines = (text: string) => text.split("\r\n").filter((l) => /^(item\d+\.)?ADR/i.test(l));
  const labelledLines = (text: string) =>
    text.split("\r\n").filter((l) => /^(item\d+\.)?(ADR|X-ABLABEL)/i.test(l));

  it.each([
    ["an unstructured value", "ADR:Just text"],
    ["an empty grouped one", "item1.ADR;TYPE=HOME;X-K=1:;;;;;;\r\nitem1.X-ABLABEL:Lab"],
  ])("keeps %s when another field is edited", (_name, lines) => {
    const text = card(lines);
    const result = editField(text, (draft) => {
      draft.given = "Violet";
    });
    expect(labelledLines(result)).toEqual(labelledLines(untouched(text)));
  });

  it("overwrites onto a card whose earlier address went elsewhere without mixing them", () => {
    const mine = parse(card(A, "item1.X-ABLABEL:Maison", B, "item2.X-ABLABEL:Bureau"));
    const draft = buildDraft(mine);
    if (draft.adr[1]) draft.adr[1].locality = "Zaun-Bas";
    const theirs = parse(card(B, "item2.X-ABLABEL:Bureau"));
    applyDraft(theirs, draft, dirtyDiff(mine, draft));
    const lines = adrLines(serialise(theirs));
    expect(lines).toEqual([
      "ITEM1.ADR;TYPE=HOME:;;Rue A;Piltover;;0000;RT",
      "ITEM2.ADR;TYPE=WORK;X-B=b:;;Quai B,Quai C;Zaun-Bas;;0001;RT",
    ]);
  });

  it("overwrites onto a card with an address added elsewhere without moving its data", () => {
    const mine = parse(card(A, B));
    const draft = buildDraft(mine);
    if (draft.adr[0]) draft.adr[0].street = "Rue A bis";
    const theirs = parse(card("item3.ADR;X-C=c:;;Cave;Zaun;;;", "item3.X-ABLABEL:Cave", A, B));
    applyDraft(theirs, draft, dirtyDiff(mine, draft));
    expect(adrLines(serialise(theirs))).toEqual([
      "ITEM1.ADR;TYPE=HOME:;;Rue A bis;Piltover;;0000;RT",
      "ITEM2.ADR;TYPE=WORK;X-B=b:;;Quai B,Quai C;Zaun;;0001;RT",
    ]);
  });

  it("keeps an address edited during a save that removed another on its own property", () => {
    const contact = parse(card(A, B, "item2.X-ABLABEL:Bureau"));
    const sent = buildDraft(contact);
    sent.adr.shift();
    const current = { ...sent, adr: sent.adr.map((adr) => ({ ...adr, locality: "Zaun-Haut" })) };
    applyDraft(contact, sent);
    const saved = parse(serialise(contact));
    const next = rebaseDraft(sent, current, saved);
    applyDraft(saved, next);
    const out = serialise(saved);
    expect(adrLines(out)).toEqual(["ITEM2.ADR;TYPE=WORK;X-B=b:;;Quai B,Quai C;Zaun-Haut;;0001;RT"]);
    expect(parse(out).fields.adr[0]?.label).toBe("Bureau");
  });
});

describe("ADR: values and labels across saves", () => {
  const card = (...lines: string[]) =>
    [
      "BEGIN:VCARD",
      "VERSION:3.0",
      "UID:adr-saves",
      "FN:Vi",
      "N:;Vi;;;",
      ...lines,
      "END:VCARD",
      "",
    ].join("\r\n");
  const lines = (text: string, pattern: RegExp) =>
    text.split("\r\n").filter((l) => pattern.test(l));

  it("reads a value that isn't structured as its first part, and keeps it on an edit", () => {
    const contact = parse(card("ADR;TYPE=HOME:Just text here"));
    expect(contact.fields.adr[0]?.poBox).toBe("Just text here");
    const draft = buildDraft(contact);
    if (draft.adr[0]) draft.adr[0].street = "Rue 1";
    applyDraft(contact, draft);
    expect(lines(serialise(contact), /^ADR/)).toEqual(["ADR;TYPE=HOME:Just text here;;Rue 1;;;;"]);
  });

  it("labels an address in its own group once an earlier address is removed", () => {
    const contact = parse(
      card(
        "item1.ADR;TYPE=HOME:;;Rue A;Piltover;;;",
        "item1.X-ABLABEL:Maison",
        "item2.ADR;TYPE=WORK:;;Quai B;Zaun;;;",
        "item2.X-ABLABEL:Bureau",
        "item2.X-ABADR:ch",
      ),
    );
    let draft = buildDraft(contact);
    draft = draftReducer(draft, { type: "REMOVE_ADR", index: 0 });
    draft = draftReducer(draft, { type: "SET_ADR_TYPE", index: 0, value: "custom" });
    draft = draftReducer(draft, { type: "SET_ADR_LABEL", index: 0, value: "Atelier" });
    const out = serialise(applyDraft(contact, draft));
    expect(lines(out, /^ITEM2\./)).toEqual([
      "ITEM2.ADR;TYPE=WORK:;;Quai B;Zaun;;;",
      "ITEM2.X-ABLABEL:Atelier",
      "ITEM2.X-ABADR:ch",
    ]);
    expect(out).not.toContain("ITEM3");
  });

  it("writes a label's commas, semicolons and backslashes as vCard text", () => {
    const contact = parse(card("ADR:;;Quai 2;Genève;;;"));
    let draft = draftReducer(buildDraft(contact), {
      type: "SET_ADR_TYPE",
      index: 0,
      value: "custom",
    });
    draft = draftReducer(draft, { type: "SET_ADR_LABEL", index: 0, value: "Lac, nord; a\\b" });
    const out = serialise(applyDraft(contact, draft));
    expect(out).toContain(String.raw`ITEM1.X-ABLABEL:Lac\, nord\; a\\b`);
    expect(parse(out).fields.adr[0]?.label).toBe("Lac, nord; a\\b");
  });

  it("keeps the group a save gave an address when it was edited during that save", () => {
    const contact = parse(card());
    let sent = draftReducer(buildDraft(contact), { type: "ADD_ADR" });
    sent = draftReducer(sent, { type: "SET_ADR_PART", index: 0, part: "street", value: "New" });
    sent = draftReducer(sent, { type: "SET_ADR_TYPE", index: 0, value: "custom" });
    sent = draftReducer(sent, { type: "SET_ADR_LABEL", index: 0, value: "Chalet" });
    const current = draftReducer(sent, {
      type: "SET_ADR_PART",
      index: 0,
      part: "locality",
      value: "Zermatt",
    });
    applyDraft(contact, sent);
    const saved = parse(serialise(contact));
    applyDraft(saved, rebaseDraft(sent, current, saved));
    const out = serialise(saved);
    expect(lines(out, /ADR|ABLABEL/)).toEqual([
      "ITEM1.ADR:;;New;Zermatt;;;",
      "ITEM1.X-ABLABEL:Chalet",
    ]);
  });
});

describe("ADR: an overwrite onto a card regrouped elsewhere", () => {
  const card = (...lines: string[]) =>
    [
      "BEGIN:VCARD",
      "VERSION:3.0",
      "UID:adr-regroup",
      "FN:Vi",
      "N:;Vi;;;",
      ...lines,
      "END:VCARD",
      "",
    ].join("\r\n");

  it("gives an address a group of its own when its group went to a phone", () => {
    const mine = parse(
      card("item1.ADR:;;Rue A;Piltover;;;", "item2.ADR:;;Quai B;Zaun;;;", "item2.X-ABLABEL:Bureau"),
    );
    const theirs = parse(
      card("item1.ADR:;;Rue A;Piltover;;;", "item2.TEL:+41 21 000 00 00", "item2.X-ABLABEL:Fax"),
    );
    const draft = buildDraft(mine);
    if (draft.adr[1]) draft.adr[1].street = "Quai C";
    applyDraft(theirs, draft, dirtyDiff(mine, draft));
    const out = parse(serialise(theirs));
    expect(out.fields.tel[0]?.label).toBe("Fax");
    expect(out.fields.adr.map((adr) => [adr.street, adr.label])).toEqual([
      ["Rue A", undefined],
      ["Quai C", "Bureau"],
    ]);
  });
});

describe("ADR: labels and sources at the edges", () => {
  const card = (...lines: string[]) =>
    [
      "BEGIN:VCARD",
      "VERSION:3.0",
      "UID:adr-edges",
      "FN:Vi",
      "N:;Vi;;;",
      ...lines,
      "END:VCARD",
      "",
    ].join("\r\n");

  it("reads another client's escaped phone label as text, and keeps its line on an edit", () => {
    const contact = parse(card("item1.TEL:111", String.raw`item1.X-ABLABEL:a\,b\;c\\d`));
    expect(contact.fields.tel[0]?.label).toBe(String.raw`a,b;c\d`);
    const draft = buildDraft(contact);
    draft.given = "Vy";
    applyDraft(contact, draft);
    expect(serialise(contact)).toContain(String.raw`X-ABLABEL:a\,b\;c\\d`);
  });

  it("flags a label with no address under it", () => {
    let draft = draftReducer(buildDraft(parse(card())), { type: "ADD_ADR" });
    draft = draftReducer(draft, { type: "SET_ADR_TYPE", index: 0, value: "custom" });
    draft = draftReducer(draft, { type: "SET_ADR_LABEL", index: 0, value: "Chalet" });
    expect(validateDraft(draft).adr_0).toBe("field_adr_empty");
    draft = draftReducer(draft, { type: "SET_ADR_PART", index: 0, part: "street", value: "Rue 1" });
    expect(validateDraft(draft).adr_0).toBeUndefined();
  });

  it("finds the saved property by what an address sent, among another client's", () => {
    const contact = parse(card("item1.ADR:;;Rue A;;;;"));
    const sent = draftReducer(buildDraft(contact), {
      type: "SET_ADR_PART",
      index: 0,
      part: "locality",
      value: "Zaun",
    });
    const current = draftReducer(sent, {
      type: "SET_ADR_PART",
      index: 0,
      part: "postalCode",
      value: "1000",
    });
    const saved = parse(card("item7.ADR:;;Quai Z;;;;", "item1.ADR:;;Rue A;Zaun;;;"));
    const rebased = rebaseDraft(sent, current, saved).adr[0];
    expect(rebased?.source?.params.group).toBe("item1");
    expect(rebased?.postalCode).toBe("1000");
  });
});

describe("ADR: a group shared with another labelled property", () => {
  const card = (...lines: string[]) =>
    [
      "BEGIN:VCARD",
      "VERSION:3.0",
      "UID:adr-shared",
      "FN:Vi",
      "N:;Vi;;;",
      ...lines,
      "END:VCARD",
      "",
    ].join("\r\n");

  it("leaves the phone its label when the address picks a type", () => {
    const contact = parse(card("item1.ADR:;;Rue A;;;;", "item1.TEL:123", "item1.X-ABLABEL:Shared"));
    const draft = draftReducer(buildDraft(contact), {
      type: "SET_ADR_TYPE",
      index: 0,
      value: "work",
    });
    const out = parse(serialise(applyDraft(contact, draft)));
    expect(out.fields.tel[0]?.label).toBe("Shared");
    expect(out.fields.adr[0]?.label).toBeUndefined();
  });

  it("writes an address's own label back over a rename elsewhere, in its group", () => {
    const mine = parse(
      card(
        "item1.ADR:;;Rue A;;;;",
        "item1.X-ABLABEL:Chalet",
        "item1.X-ABADR:ch",
        "item2.ADR:;;Quai B;;;;",
      ),
    );
    const theirs = parse(
      card(
        "item1.ADR:;;Rue A;;;;",
        "item1.X-ABLABEL:Maison de vacances",
        "item1.X-ABADR:ch",
        "item2.ADR:;;Quai B;;;;",
      ),
    );
    const draft = buildDraft(mine);
    if (draft.adr[1]) draft.adr[1].street = "Quai C";
    applyDraft(theirs, draft, dirtyDiff(mine, draft));
    const out = serialise(theirs);
    expect(out).toContain("ITEM1.ADR:;;Rue A;;;;");
    expect(out).toContain("ITEM1.X-ABLABEL:Chalet");
    expect(out).toContain("ITEM1.X-ABADR:ch");
    expect(out).not.toContain("Maison de vacances");
    expect(out).not.toContain("ITEM3");
  });
});

describe("ADR: an overwrite onto groups changed elsewhere", () => {
  const card = (...lines: string[]) =>
    [
      "BEGIN:VCARD",
      "VERSION:3.0",
      "UID:adr-renumbered",
      "FN:Vi",
      "N:;Vi;;;",
      ...lines,
      "END:VCARD",
      "",
    ].join("\r\n");
  const labels = (text: string) => parse(text).fields.adr.map((adr) => [adr.street, adr.label]);

  it("gives each address its own label when another client renumbered the groups", () => {
    const mine = parse(
      card(
        "item1.ADR:;;Rue A;;;;",
        "item1.X-ABLABEL:Chalet",
        "item2.ADR:;;Quai B;;;;",
        "item2.X-ABLABEL:Atelier",
      ),
    );
    const theirs = parse(card("item1.ADR:;;Quai B;;;;", "item1.X-ABLABEL:Atelier"));
    const draft = buildDraft(mine);
    if (draft.adr[1]) draft.adr[1].street = "Quai C";
    applyDraft(theirs, draft, dirtyDiff(mine, draft));
    const out = serialise(theirs);
    expect(labels(out)).toEqual([
      ["Rue A", "Chalet"],
      ["Quai C", "Atelier"],
    ]);
    expect(out.match(/X-ABLABEL/g)).toHaveLength(2);
  });

  it("brings back the label of an address deleted elsewhere", () => {
    const mine = parse(
      card("item1.ADR:;;Rue A;;;;", "item2.ADR:;;Quai B;;;;", "item2.X-ABLABEL:Atelier"),
    );
    const theirs = parse(card("item1.ADR:;;Rue A;;;;"));
    const draft = buildDraft(mine);
    if (draft.adr[1]) draft.adr[1].street = "Quai C";
    applyDraft(theirs, draft, dirtyDiff(mine, draft));
    expect(labels(serialise(theirs))).toEqual([
      ["Rue A", undefined],
      ["Quai C", "Atelier"],
    ]);
  });

  it("finds a grouped address in its new group before an identical one without a group", () => {
    const mine = parse(card("ADR:;;Rue A;;;;", "item1.ADR:;;Rue A;;;;", "item1.X-ABADR:ch"));
    const theirs = parse(card("ADR:;;Rue A;;;;", "item2.ADR:;;Rue A;;;;", "item2.X-ABADR:ch"));
    const draft = draftReducer(buildDraft(mine), { type: "REMOVE_ADR", index: 0 });
    applyDraft(theirs, draft, dirtyDiff(mine, draft));
    const out = serialise(theirs);
    expect(out).toContain("ITEM2.ADR:;;Rue A;;;;\r\nITEM2.X-ABADR:ch");
    expect(out).not.toContain("\r\nADR:");
  });

  it("gives an address deleted elsewhere a property of its own, not one added elsewhere", () => {
    const mine = parse(card("item1.ADR:;;Rue A;;;;", "item1.X-ABADR:fr"));
    const theirs = parse(card("item2.ADR:;;Cave;;;;", "item2.X-ABADR:de"));
    const draft = draftReducer(buildDraft(mine), {
      type: "SET_ADR_PART",
      index: 0,
      part: "street",
      value: "Rue A2",
    });
    applyDraft(theirs, draft, dirtyDiff(mine, draft));
    const out = serialise(theirs);
    expect(out).toContain("\r\nADR:;;Rue A2;;;;");
    expect(out).not.toContain("ITEM2.ADR");
  });

  it("leaves an address changed elsewhere off its group once another address holds it", () => {
    const mine = parse(
      card(
        "item1.ADR;TYPE=HOME:;;Rue A;Lausanne;;1000;Suisse",
        "item1.X-ABADR:ch",
        "item2.ADR;TYPE=WORK:;;Rue B;Paris;;75000;France",
        "item2.X-ABADR:fr",
        "item2.X-ABLABEL:Bureau",
      ),
    );
    const theirs = parse(
      card(
        "item2.ADR;TYPE=HOME:;;Rue A 2;Lausanne;;1000;Suisse",
        "item2.X-ABADR:ch",
        "item1.ADR;TYPE=WORK:;;Rue B;Paris;;75000;France",
        "item1.X-ABADR:fr",
        "item1.X-ABLABEL:Bureau",
      ),
    );
    const draft = draftReducer(buildDraft(mine), { type: "REMOVE_ADR", index: 1 });
    applyDraft(theirs, draft, dirtyDiff(mine, draft));
    const out = serialise(theirs);
    expect(out).toContain("\r\nADR;TYPE=HOME:;;Rue A;Lausanne;;1000;Suisse");
    expect(out).not.toContain("ITEM1.ADR");
  });

  it("gives no address another's X-ABADR when groups were renumbered and both changed elsewhere", () => {
    const mine = parse(
      card(
        "item1.TEL:+41 1",
        "item1.X-ABLABEL:Bureau",
        "item2.ADR;TYPE=HOME:;;Rue A;Lausanne;;1000;Suisse",
        "item2.X-ABADR:ch",
        "item3.ADR;TYPE=WORK:;;Rue B;Paris;;75000;France",
        "item3.X-ABADR:fr",
      ),
    );
    const theirs = parse(
      card(
        "item1.ADR;TYPE=HOME:;;Rue A 2;Lausanne;;1000;Suisse",
        "item1.X-ABADR:ch",
        "item2.ADR;TYPE=WORK:;;Rue B 2;Paris;;75000;France",
        "item2.X-ABADR:fr",
      ),
    );
    const draft = draftReducer(buildDraft(mine), {
      type: "SET_ADR_PART",
      index: 0,
      part: "extended",
      value: "c/o X",
    });
    applyDraft(theirs, draft, dirtyDiff(mine, draft));
    const out = serialise(theirs);
    expect(out).toContain("\r\nADR;TYPE=HOME:;c/o X;Rue A;Lausanne;;1000;Suisse");
    expect(out).toContain("\r\nADR;TYPE=WORK:;;Rue B;Paris;;75000;France");
    expect(out).not.toMatch(/ITEM\d\.ADR/);
  });

  it("gives an address deleted elsewhere a property of its own, not one the user removed", () => {
    const mine = parse(
      card(
        "item1.ADR:;;Rue A;;;;",
        "item1.X-ABADR:fr",
        "item2.ADR:;;Quai B;;;;",
        "item2.X-ABADR:ch",
      ),
    );
    const theirs = parse(card("item1.ADR:;;Rue A;;;;", "item1.X-ABADR:fr"));
    let draft = draftReducer(buildDraft(mine), { type: "REMOVE_ADR", index: 0 });
    draft = draftReducer(draft, { type: "SET_ADR_TYPE", index: 0, value: "work" });
    applyDraft(theirs, draft, dirtyDiff(mine, draft));
    const out = serialise(theirs);
    expect(out).toContain("\r\nADR;TYPE=work:;;Quai B;;;;");
    expect(out).not.toContain("ITEM1.ADR");
  });

  it("finds a later address's saved property when an earlier one was changed elsewhere", () => {
    const contact = parse(card("item1.ADR:;;Rue A;;;;"));
    let sent = draftReducer(buildDraft(contact), { type: "ADD_ADR" });
    sent = draftReducer(sent, { type: "SET_ADR_PART", index: 1, part: "street", value: "New" });
    sent = draftReducer(sent, { type: "SET_ADR_TYPE", index: 1, value: "custom" });
    sent = draftReducer(sent, { type: "SET_ADR_LABEL", index: 1, value: "Chalet" });
    const current = draftReducer(sent, {
      type: "SET_ADR_PART",
      index: 1,
      part: "locality",
      value: "Zermatt",
    });
    const saved = parse(
      card("item1.ADR:;;Rue A bis;;;;", "item2.ADR:;;New;;;;", "item2.X-ABLABEL:Chalet"),
    );
    applyDraft(saved, rebaseDraft(sent, current, saved));
    const out = serialise(saved);
    expect(out).toContain("ITEM2.ADR:;;New;Zermatt;;;");
    expect(out.match(/X-ABLABEL/g)).toHaveLength(1);
  });

  it("leaves an unchanged custom label in place on a group shared with a phone", () => {
    const contact = parse(
      card("item1.ADR:;;Rue A;;;;", "item1.TEL:123", "item1.X-ABLABEL:Shared", "ADR:;;Quai B;;;;"),
    );
    let draft = draftReducer(buildDraft(contact), {
      type: "SET_ADR_TYPE",
      index: 0,
      value: "custom",
    });
    draft = draftReducer(draft, {
      type: "SET_ADR_PART",
      index: 1,
      part: "street",
      value: "Quai C",
    });
    const out = serialise(applyDraft(contact, draft));
    expect(out).toContain("ITEM1.ADR:;;Rue A;;;;");
    expect(out.match(/X-ABLABEL/g)).toHaveLength(1);
  });
});

describe("ADR: a group shared with a property Natel doesn't show", () => {
  const card = (...lines: string[]) =>
    [
      "BEGIN:VCARD",
      "VERSION:3.0",
      "UID:adr-unshown",
      "FN:Vi",
      "N:;Vi;;;",
      ...lines,
      "END:VCARD",
      "",
    ].join("\r\n");

  it("leaves an IMPP its label when the address sharing its group is labelled", () => {
    const contact = parse(
      card(
        "item1.ADR:;;Rue A;;;;",
        "item1.X-ABADR:ch",
        "item1.IMPP:xmpp:vi@example.org",
        "item1.X-ABLABEL:Jabber",
      ),
    );
    let draft = draftReducer(buildDraft(contact), {
      type: "SET_ADR_TYPE",
      index: 0,
      value: "custom",
    });
    draft = draftReducer(draft, { type: "SET_ADR_LABEL", index: 0, value: "Chalet" });
    const out = serialise(applyDraft(contact, draft));
    expect(out).toContain("ITEM1.IMPP:xmpp:vi@example.org");
    expect(out).toContain("ITEM1.X-ABLABEL:Jabber");
    expect(out).toContain("ITEM2.ADR:;;Rue A;;;;");
    expect(out).toContain("ITEM2.X-ABADR:ch");
    expect(out).toContain("ITEM2.X-ABLABEL:Chalet");
  });

  it("leaves a relation its label on an overwrite onto a group renumbered elsewhere", () => {
    const mine = parse(card("item1.ADR:;;Rue A;;;;", "item1.X-ABLABEL:Chalet"));
    const theirs = parse(
      card("item1.X-ABRELATEDNAMES:Mom", "item1.X-ABLABEL:_$!<Mother>!$_", "ADR:;;Rue A;;;;"),
    );
    const draft = buildDraft(mine);
    if (draft.adr[0]) draft.adr[0].street = "Rue B";
    applyDraft(theirs, draft, dirtyDiff(mine, draft));
    const out = serialise(theirs);
    expect(out).toContain("ITEM1.X-ABRELATEDNAMES:Mom");
    expect(out).toContain("ITEM1.X-ABLABEL:_$!<Mother>!$_");
    expect(parse(out).fields.adr.map((adr) => [adr.street, adr.label])).toEqual([
      ["Rue B", "Chalet"],
    ]);
  });
});

describe("ADR: an overwrite onto a group given to an unlabelled property", () => {
  const card = (...lines: string[]) =>
    [
      "BEGIN:VCARD",
      "VERSION:3.0",
      "UID:adr-unlabelled",
      "FN:Vi",
      "N:;Vi;;;",
      ...lines,
      "END:VCARD",
      "",
    ].join("\r\n");

  it.each([["item1.IMPP:xmpp:a@example.org"], ["item1.TEL:123"]])(
    "moves the address and its label away from %s",
    (other) => {
      const mine = parse(card("item1.ADR:;;Rue A;P;;;", "item1.X-ABLABEL:Chalet"));
      const theirs = parse(card(other, "item2.ADR:;;Rue A;P;;;", "item2.X-ABLABEL:Chalet"));
      const draft = buildDraft(mine);
      if (draft.adr[0]) draft.adr[0].street = "Rue A2";
      applyDraft(theirs, draft, dirtyDiff(mine, draft));
      const out = serialise(theirs);
      expect(out).toContain(other.replace("item1", "ITEM1"));
      expect(out).not.toMatch(/ITEM1\.(ADR|X-ABLABEL)/);
      expect(parse(out).fields.adr.map((adr) => [adr.street, adr.label])).toEqual([
        ["Rue A2", "Chalet"],
      ]);
    },
  );
});

describe("ADR: X-ABADR follows the address it belongs to", () => {
  const card = (...lines: string[]) =>
    [
      "BEGIN:VCARD",
      "VERSION:3.0",
      "UID:adr-abadr",
      "FN:Vi",
      "N:;Vi;;;",
      ...lines,
      "END:VCARD",
      "",
    ].join("\r\n");

  it("stays in a group another address still holds", () => {
    const contact = parse(
      card(
        "item1.ADR:;;Rue A;;;;",
        "item1.ADR:;;Quai B;;;;",
        "item1.X-ABADR:ch",
        "item1.X-ABLABEL:Shared",
      ),
    );
    let draft = draftReducer(buildDraft(contact), {
      type: "SET_ADR_TYPE",
      index: 1,
      value: "custom",
    });
    draft = draftReducer(draft, { type: "SET_ADR_LABEL", index: 1, value: "Atelier" });
    const out = serialise(applyDraft(contact, draft));
    expect(out).toContain("ITEM1.X-ABADR:ch");
    expect(out).toContain("ITEM1.X-ABLABEL:Shared");
    expect(out).toContain("ITEM2.ADR:;;Quai B;;;;");
    expect(out).toContain("ITEM2.X-ABLABEL:Atelier");
  });

  it("moves with an address that leaves an IMPP's group for a type", () => {
    const contact = parse(
      card(
        "item1.ADR:;;Rue A;;;;",
        "item1.X-ABADR:ch",
        "item1.IMPP:xmpp:a@example.org",
        "item1.X-ABLABEL:Jabber",
      ),
    );
    const draft = draftReducer(buildDraft(contact), {
      type: "SET_ADR_TYPE",
      index: 0,
      value: "work",
    });
    const out = serialise(applyDraft(contact, draft));
    expect(out).toContain("ITEM1.IMPP:xmpp:a@example.org");
    expect(out).toContain("ITEM1.X-ABLABEL:Jabber");
    expect(out).toContain("ITEM2.ADR;TYPE=work:;;Rue A;;;;");
    expect(out).toContain("ITEM2.X-ABADR:ch");
  });
});

describe("ADR: a label this save drops with another property's type", () => {
  const card = (...lines: string[]) =>
    [
      "BEGIN:VCARD",
      "VERSION:3.0",
      "UID:adr-dropped",
      "FN:Vi",
      "N:;Vi;;;",
      ...lines,
      "END:VCARD",
      "",
    ].join("\r\n");

  it("drops it for an address sharing an e-mail's group, which stays put", () => {
    const contact = parse(
      card("item1.EMAIL:a@example.org", "item1.ADR:;;Rue A;;;;", "item1.X-ABLABEL:Chalet"),
    );
    const draft = draftReducer(buildDraft(contact), {
      type: "SET_EMAIL_TYPE",
      index: 0,
      value: "work",
    });
    const out = serialise(applyDraft(contact, draft));
    expect(out).toContain("ITEM1.ADR:;;Rue A;;;;");
    expect(out).not.toContain("X-ABLABEL");
  });

  it("moves an address picking a type out of a website's group, whose label goes", () => {
    const contact = parse(
      card("item1.URL:https://a.example", "item1.ADR:;;Rue A;;;;", "item1.X-ABLABEL:Chalet"),
    );
    let draft = draftReducer(buildDraft(contact), { type: "SET_URL_TYPE", value: "work" });
    draft = draftReducer(draft, { type: "SET_ADR_TYPE", index: 0, value: "work" });
    const out = serialise(applyDraft(contact, draft));
    expect(out).toContain("ITEM1.URL;TYPE=work:https://a.example");
    expect(out).toContain("ITEM2.ADR;TYPE=work:;;Rue A;;;;");
    expect(out).not.toContain("X-ABLABEL");
  });

  it("keeps an address's own label on an overwrite onto a website's group, groups swapped elsewhere", () => {
    const mine = parse(
      card(
        "item1.URL:https://a.example",
        "item1.X-ABLABEL:_$!<HomePage>!$_",
        "item2.ADR:;;Rue A;;;;",
        "item2.X-ABLABEL:Chalet",
      ),
    );
    const theirs = parse(
      card(
        "item2.URL:https://a.example",
        "item2.X-ABLABEL:_$!<HomePage>!$_",
        "item1.ADR:;;Rue A;;;;",
        "item1.X-ABLABEL:Chalet",
      ),
    );
    let draft = draftReducer(buildDraft(mine), { type: "SET_URL_TYPE", value: "work" });
    draft = draftReducer(draft, {
      type: "SET_ADR_PART",
      index: 0,
      part: "street",
      value: "Rue A2",
    });
    applyDraft(theirs, draft, dirtyDiff(mine, draft));
    const out = serialise(theirs);
    expect(parse(out).fields.adr.map((adr) => [adr.street, adr.label])).toEqual([
      ["Rue A2", "Chalet"],
    ]);
    expect(parse(out).fields.urlField?.label).toBeUndefined();
  });

  it("keeps the label of an address whose group took a website's same label elsewhere", () => {
    const mine = parse(
      card(
        "item1.URL:https://a.example",
        "item1.X-ABLABEL:Chalet",
        "item2.ADR:;;Rue A;;;;",
        "item2.X-ABLABEL:Chalet",
      ),
    );
    const theirs = parse(
      card(
        "item2.URL:https://a.example",
        "item2.X-ABLABEL:Chalet",
        "item1.ADR:;;Rue A;;;;",
        "item1.X-ABLABEL:Chalet",
      ),
    );
    let draft = draftReducer(buildDraft(mine), { type: "SET_URL_TYPE", value: "work" });
    draft = draftReducer(draft, {
      type: "SET_ADR_PART",
      index: 0,
      part: "street",
      value: "Rue A2",
    });
    applyDraft(theirs, draft, dirtyDiff(mine, draft));
    expect(parse(serialise(theirs)).fields.adr.map((adr) => [adr.street, adr.label])).toEqual([
      ["Rue A2", "Chalet"],
    ]);
  });

  it("keeps each address's X-ABADR on an overwrite onto renumbered groups", () => {
    const mine = parse(
      card(
        "item1.ADR:;;Rue A;;;;",
        "item1.X-ABADR:fr",
        "item2.ADR:;;Quai B;;;;",
        "item2.X-ABADR:ch",
      ),
    );
    const theirs = parse(
      card(
        "item1.ADR:;;Quai B;;;;",
        "item1.X-ABADR:ch",
        "item2.ADR:;;Rue A;;;;",
        "item2.X-ABADR:fr",
      ),
    );
    const draft = draftReducer(buildDraft(mine), {
      type: "SET_ADR_PART",
      index: 1,
      part: "street",
      value: "Quai C",
    });
    applyDraft(theirs, draft, dirtyDiff(mine, draft));
    const out = serialise(theirs);
    expect(out).toContain("ITEM1.ADR:;;Quai C;;;;");
    expect(out).toContain("ITEM1.X-ABADR:ch");
    expect(out).toContain("ITEM2.ADR:;;Rue A;;;;");
    expect(out).toContain("ITEM2.X-ABADR:fr");
  });

  it("gives each of two identical addresses its own group back when another client regrouped one", () => {
    const mine = parse(
      card(
        "item1.ADR:;;Rue A;;;;",
        "item1.X-ABADR:fr",
        "item1.X-ABLABEL:L1",
        "item2.ADR:;;Rue A;;;;",
        "item2.X-ABADR:ch",
        "item2.X-ABLABEL:L2",
        "ADR:;;Rue C;;;;",
      ),
    );
    const theirs = parse(
      card(
        "item2.ADR:;;Rue A;;;;",
        "item2.X-ABADR:ch",
        "item2.X-ABLABEL:L2",
        "item3.ADR:;;Rue A;;;;",
        "item3.X-ABADR:fr",
        "item3.X-ABLABEL:L1",
        "ADR:;;Rue C;;;;",
      ),
    );
    const draft = draftReducer(buildDraft(mine), {
      type: "SET_ADR_PART",
      index: 2,
      part: "street",
      value: "Rue D",
    });
    applyDraft(theirs, draft, dirtyDiff(mine, draft));
    const out = serialise(theirs);
    expect(out).toContain("ITEM2.X-ABADR:ch\r\nITEM2.X-ABLABEL:L2");
    expect(out).toContain("ITEM3.X-ABADR:fr\r\nITEM3.X-ABLABEL:L1");
    expect(out).toContain("ADR:;;Rue D;;;;");
  });

  it("renames the label the address shows when an empty one comes first in its group", () => {
    const contact = parse(
      card("item1.ADR:;;Rue A;;;;", "item1.X-ABLABEL:", "item1.X-ABLABEL:Deux"),
    );
    let draft = draftReducer(buildDraft(contact), {
      type: "SET_ADR_TYPE",
      index: 0,
      value: "custom",
    });
    draft = draftReducer(draft, { type: "SET_ADR_LABEL", index: 0, value: "Neuf" });
    const out = serialise(applyDraft(contact, draft));
    expect(out).toContain("ITEM1.X-ABLABEL:Neuf");
    expect(out).not.toContain("Deux");
  });

  it("puts an address changed elsewhere back in its own group when the user removed an earlier one", () => {
    const lines = (b: string) =>
      card(
        "item1.ADR:;;Rue A;;;;",
        "item1.X-ABADR:fr",
        "item1.X-ABLABEL:LA",
        `item2.ADR:;;${b};;;;`,
        "item2.X-ABADR:ch",
        "item2.X-ABLABEL:LB",
        "item3.ADR:;;Rue C;;;;",
      );
    const mine = parse(lines("Rue B"));
    const theirs = parse(lines("Rue B2"));
    const draft = draftReducer(buildDraft(mine), { type: "REMOVE_ADR", index: 0 });
    applyDraft(theirs, draft, dirtyDiff(mine, draft));
    const out = serialise(theirs);
    expect(out).not.toContain("ITEM1.ADR");
    expect(out).toContain("ITEM1.X-ABLABEL:LA");
    expect(out).toContain("ITEM2.ADR:;;Rue B;;;;\r\nITEM2.X-ABADR:ch\r\nITEM2.X-ABLABEL:LB");
  });
});
