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

import { describe, expect, it } from "vitest";
import { applyDraft, buildDraft } from "../../src/lib/contact-edit";
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
  it("preserves BDAY VALUE=text on untouched round-trip via manual construction", () => {
    // ical.js cannot directly parse BDAY;VALUE=text, so we construct the
    // contact manually to test that serialise preserves text BDAY values.
    const contact = parse(`BEGIN:VCARD
VERSION:3.0
FN:Bday Text Test
N:Test;Bday;;;
BDAY:2000-01-01
UID:bday-text-test@example.com
END:VCARD`);
    // Simulate a text BDAY by setting source with non-numeric text
    contact.fields.bday = { source: "circa 1987", year: null, month: null, day: null };
    const draft = buildDraft(contact);
    applyDraft(contact, draft);
    const result = serialise(contact);
    // The text value should be preserved (not deleted)
    expect(result.replace(/\r\n?/g, "\n")).toContain("circa 1987");
  });

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
