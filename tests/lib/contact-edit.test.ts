/**
 * Unit tests for contact-edit.ts — buildDraft, dirtyDiff, validateDraft, applyDraft.
 *
 * Covers the blocking and major fix items from the edit-mode review.
 */

import { describe, expect, it } from "vitest";
import {
  applyDraft,
  buildDraft,
  dirtyDiff,
  isDirty,
  isValid,
  validateDraft,
} from "../../src/lib/contact-edit";
import type { Contact } from "../../src/model/contact";
import { parse } from "../../src/vcard";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MINIMAL_VCARD = `BEGIN:VCARD
VERSION:3.0
FN:John Doe
N:Doe;John;;;
UID:minimal@example.com
END:VCARD`;

function makeContact(overrides?: Partial<Contact>): Contact {
  const contact = parse(MINIMAL_VCARD, "/test.vcf", "abc123");
  return { ...contact, ...overrides };
}

const GROUPED_VCARD = `BEGIN:VCARD
VERSION:3.0
FN:Grouped Contact
N:Contact;Grouped;;;
item1.EMAIL;TYPE=INTERNET:personal@example.com
item1.X-ABLabel:Personal
item3.TEL;TYPE=CELL:+1-555-444-4444
item3.X-ABLabel:Mobile
UID:grouped@example.com
END:VCARD`;

describe("buildDraft", () => {
  it("builds a draft from a minimal contact", () => {
    const contact = makeContact();
    const draft = buildDraft(contact);
    expect(draft.family).toBe("Doe");
    expect(draft.given).toBe("John");
    expect(draft.tel).toHaveLength(0);
    expect(draft.email).toHaveLength(0);
    expect(draft.nickname).toBe("");
    expect(draft.org).toBe("");
    expect(draft.title).toBe("");
    expect(draft.url).toBe("");
    expect(draft.note).toBe("");
  });

  it("preserves _orig params on draft fields (item 1)", () => {
    const contact = parse(GROUPED_VCARD);
    const draft = buildDraft(contact);
    // TEL field should carry _orig with the original params
    expect(draft.tel[0]?._orig).toBeDefined();
    expect(draft.tel[0]?._orig.value).toBe("+1-555-444-4444");
    expect(draft.tel[0]?._orig.params).toBeDefined();
  });

  it("copies ADR and BDAY as new objects", () => {
    const vcard = `BEGIN:VCARD
VERSION:3.0
FN:Test Contact
N:Test;Contact;;;
ADR;TYPE=HOME:;;123 Main St;Springfield;;;US
BDAY:1987-03-14
UID:test@example.com
END:VCARD`;
    const contact = parse(vcard);
    const draft = buildDraft(contact);
    expect(draft.adr).not.toBeNull();
    expect(draft.adr!.street).toBe("123 Main St");
    expect(draft.bday).not.toBeNull();
    expect(draft.bday!.year).toBe("1987");
    expect(draft.bday!.month).toBe("3");
    expect(draft.bday!.day).toBe("14");
  });
});

describe("applyDraft", () => {
  it("does not overwrite FN (item 2)", () => {
    const vcard = `BEGIN:VCARD
VERSION:3.0
FN:Maman
N:Doe;Jane;;;
UID:maman@example.com
END:VCARD`;
    const contact = parse(vcard);
    const draft = buildDraft(contact);
    draft.family = "Martin";
    applyDraft(contact, draft);
    // FN should remain "Maman" — not derived from N
    expect(contact.fields.fn).toBe("Maman");
  });

  it("preserves group params on TEL (item 1)", () => {
    const contact = parse(GROUPED_VCARD);
    const draft = buildDraft(contact);
    if (draft.tel[0]) draft.tel[0].value = "+1-555-444-4445";
    applyDraft(contact, draft);
    // The TEL should have its group preserved
    const tel = contact.fields.tel[0];
    expect(tel).toBeDefined();
    expect(tel!.value).toBe("+1-555-444-4445");
    // Should have params (at minimum the TYPE from the original)
    expect(tel!.params).toBeDefined();
  });

  it("updates N.family and N.given", () => {
    const contact = makeContact();
    const draft = buildDraft(contact);
    draft.family = "Smith";
    draft.given = "Bob";
    applyDraft(contact, draft);
    expect(contact.fields.n.family).toBe("Smith");
    expect(contact.fields.n.given).toBe("Bob");
  });

  it("assigns tel and email from draft", () => {
    const contact = makeContact();
    const draft = buildDraft(contact);
    draft.tel = [
      { id: "1", value: "+1-555-111-1111", type: "cell", _orig: { value: "+1-555-111-1111" } },
    ];
    draft.email = [{ id: "2", value: "a@b.com", type: "work", _orig: { value: "a@b.com" } }];
    applyDraft(contact, draft);
    expect(contact.fields.tel).toHaveLength(1);
    expect(contact.fields.tel[0]!.value).toBe("+1-555-111-1111");
    expect(contact.fields.email).toHaveLength(1);
    expect(contact.fields.email[0]!.value).toBe("a@b.com");
  });
});

describe("dirtyDiff", () => {
  it("detects no changes on identical draft", () => {
    const contact = makeContact();
    const draft = buildDraft(contact);
    const diff = dirtyDiff(contact, draft);
    expect(isDirty(diff)).toBe(false);
  });

  it("detects family name change", () => {
    const contact = makeContact();
    const draft = buildDraft(contact);
    draft.family = "Smith";
    const diff = dirtyDiff(contact, draft);
    expect(diff.family).toBe(true);
    expect(isDirty(diff)).toBe(true);
  });

  it("detects tel change", () => {
    const contact = parse(GROUPED_VCARD);
    const draft = buildDraft(contact);
    if (draft.tel[0]) draft.tel[0].value = "+1-555-444-4445";
    const diff = dirtyDiff(contact, draft);
    expect(diff.tel).toBe(true);
  });

  it("detects adr change", () => {
    const vcard = `BEGIN:VCARD
VERSION:3.0
FN:Test
N:Test;Test;;;
ADR:;;123 Main St;;;;
UID:test@example.com
END:VCARD`;
    const contact = parse(vcard);
    const draft = buildDraft(contact);
    draft.adr = draft.adr ? { ...draft.adr, street: "456 Oak Ave" } : null;
    const diff = dirtyDiff(contact, draft);
    expect(diff.adr).toBe(true);
  });

  it("detects bday change", () => {
    const vcard = `BEGIN:VCARD
VERSION:3.0
FN:Test
N:Test;Test;;;
BDAY:1987-03-14
UID:test@example.com
END:VCARD`;
    const contact = parse(vcard);
    const draft = buildDraft(contact);
    draft.bday = draft.bday ? { ...draft.bday, year: "1990" } : null;
    const diff = dirtyDiff(contact, draft);
    expect(diff.bday).toBe(true);
  });

  it("keeps typed birthday text as-is and treats a zero-padded equal value as clean", () => {
    const contact = parse(`BEGIN:VCARD
VERSION:3.0
FN:Test
N:Test;Test;;;
BDAY:1987-03-14
UID:test@example.com
END:VCARD`);
    const draft = buildDraft(contact);
    if (draft.bday) draft.bday.month = "03";
    expect(dirtyDiff(contact, draft).bday).toBe(false);
    if (draft.bday) draft.bday.year = "19x";
    expect(draft.bday?.year).toBe("19x");
    expect(dirtyDiff(contact, draft).bday).toBe(true);
    expect(validateDraft(draft).bday_year).toBe("field_bday_year");
  });
});

describe("validateDraft", () => {
  it("returns no errors for a valid draft", () => {
    const contact = makeContact();
    const draft = buildDraft(contact);
    const errors = validateDraft(draft);
    expect(isValid(errors)).toBe(true);
  });

  it("rejects empty family and given", () => {
    const draft = {
      family: "",
      given: "",
      tel: [],
      email: [],
      nickname: "",
      adr: null,
      bday: null,
      org: "",
      title: "",
      url: "",
      note: "",
    };
    const errors = validateDraft(draft);
    expect(errors.family).toBe("field_required");
    expect(errors.given).toBe("field_required");
    expect(isValid(errors)).toBe(false);
  });

  it("validates email format", () => {
    const draft = {
      family: "Doe",
      given: "John",
      tel: [],
      email: [{ id: "1", value: "invalid", type: "", _orig: { value: "invalid" } }],
      nickname: "",
      adr: null,
      bday: null,
      org: "",
      title: "",
      url: "",
      note: "",
    };
    const errors = validateDraft(draft);
    expect(errors.email_0).toBe("field_email_invalid");
  });

  it("accepts valid email", () => {
    const draft = {
      family: "Doe",
      given: "John",
      tel: [],
      email: [
        { id: "1", value: "test@example.com", type: "", _orig: { value: "test@example.com" } },
      ],
      nickname: "",
      adr: null,
      bday: null,
      org: "",
      title: "",
      url: "",
      note: "",
    };
    const errors = validateDraft(draft);
    expect(errors.email_0).toBeUndefined();
  });

  it("validates URL format", () => {
    const draft = {
      family: "Doe",
      given: "John",
      tel: [],
      email: [],
      nickname: "",
      adr: null,
      bday: null,
      org: "",
      title: "",
      url: "not-a-url",
      note: "",
    };
    const errors = validateDraft(draft);
    expect(errors.url).toBe("field_url_invalid");
  });

  it("accepts valid URL", () => {
    const draft = {
      family: "Doe",
      given: "John",
      tel: [],
      email: [],
      nickname: "",
      adr: null,
      bday: null,
      org: "",
      title: "",
      url: "https://example.com",
      note: "",
    };
    const errors = validateDraft(draft);
    expect(errors.url).toBeUndefined();
  });

  describe("BDAY validation (item 21)", () => {
    it("rejects NaN month", () => {
      const draft = {
        family: "Doe",
        given: "John",
        tel: [],
        email: [],
        nickname: "",
        adr: null,
        bday: { source: "", year: "", month: "abc", day: "" },
        org: "",
        title: "",
        url: "",
        note: "",
      };
      const errors = validateDraft(draft);
      expect(errors.bday_month).toBe("field_bday_month");
    });

    it("rejects month out of range", () => {
      const draft = {
        family: "Doe",
        given: "John",
        tel: [],
        email: [],
        nickname: "",
        adr: null,
        bday: { source: "", year: "", month: "13", day: "" },
        org: "",
        title: "",
        url: "",
        note: "",
      };
      const errors = validateDraft(draft);
      expect(errors.bday_month).toBe("field_bday_month");
    });

    it("rejects day without month", () => {
      const draft = {
        family: "Doe",
        given: "John",
        tel: [],
        email: [],
        nickname: "",
        adr: null,
        bday: { source: "", year: "", month: "", day: "15" },
        org: "",
        title: "",
        url: "",
        note: "",
      };
      const errors = validateDraft(draft);
      expect(errors.bday_month).toBe("field_bday_month");
    });

    it("rejects NaN year", () => {
      const draft = {
        family: "Doe",
        given: "John",
        tel: [],
        email: [],
        nickname: "",
        adr: null,
        bday: { source: "", year: "abc", month: "1", day: "15" },
        org: "",
        title: "",
        url: "",
        note: "",
      };
      const errors = validateDraft(draft);
      expect(errors.bday_year).toBe("field_bday_year");
    });

    it("rejects month-only (no year, no day)", () => {
      const draft = {
        family: "Doe",
        given: "John",
        tel: [],
        email: [],
        nickname: "",
        adr: null,
        bday: { source: "", year: "", month: "3", day: "" },
        org: "",
        title: "",
        url: "",
        note: "",
      };
      const errors = validateDraft(draft);
      expect(errors.bday_month).toBe("field_bday_month");
    });

    it("accepts year and month (no day)", () => {
      const draft = {
        family: "Doe",
        given: "John",
        tel: [],
        email: [],
        nickname: "",
        adr: null,
        bday: { source: "", year: "2000", month: "3", day: "" },
        org: "",
        title: "",
        url: "",
        note: "",
      };
      const errors = validateDraft(draft);
      expect(errors.bday_month).toBeUndefined();
    });

    it("accepts month and day (no year)", () => {
      const draft = {
        family: "Doe",
        given: "John",
        tel: [],
        email: [],
        nickname: "",
        adr: null,
        bday: { source: "", year: "", month: "3", day: "14" },
        org: "",
        title: "",
        url: "",
        note: "",
      };
      const errors = validateDraft(draft);
      expect(errors.bday_month).toBeUndefined();
    });

    it("accepts valid month and day", () => {
      const draft = {
        family: "Doe",
        given: "John",
        tel: [],
        email: [],
        nickname: "",
        adr: null,
        bday: { source: "", year: "2000", month: "12", day: "31" },
        org: "",
        title: "",
        url: "",
        note: "",
      };
      const errors = validateDraft(draft);
      expect(errors.bday_month).toBeUndefined();
      expect(errors.bday_day).toBeUndefined();
      expect(errors.bday_year).toBeUndefined();
    });
  });
});
