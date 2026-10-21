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
  isWebUrl,
  kindOf,
  nextId,
  rebaseDraft,
  validateDraft,
  valueHref,
  withKind,
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
    expect(draft.adr).toHaveLength(1);
    expect(draft.adr[0]?.street).toBe("123 Main St");
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
    draft.email = [
      { id: "2", value: "a@b.example", type: "work", _orig: { value: "a@b.example" } },
    ];
    applyDraft(contact, draft);
    expect(contact.fields.tel).toHaveLength(1);
    expect(contact.fields.tel[0]!.value).toBe("+1-555-111-1111");
    expect(contact.fields.email).toHaveLength(1);
    expect(contact.fields.email[0]!.value).toBe("a@b.example");
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
    draft.adr = draft.adr.map((adr) => ({ ...adr, street: "456 Oak Ave" }));
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

const emptyDraft = () => ({
  family: "",
  given: "",
  tel: [],
  email: [],
  nickname: "",
  adr: [],
  bday: null,
  org: "",
  title: "",
  url: "",
  note: "",
  photo: { kind: "unchanged" as const },
});

describe("validateDraft", () => {
  it("returns no errors for a valid draft", () => {
    const contact = makeContact();
    const draft = buildDraft(contact);
    const errors = validateDraft(draft);
    expect(isValid(errors)).toBe(true);
  });

  it("asks for a name when there is no name nor organisation", () => {
    const errors = validateDraft(emptyDraft());
    expect(errors.name).toBe("field_name_required");
    expect(isValid(errors)).toBe(false);
  });

  it("takes an organisation alone as the card's name", () => {
    expect(isValid(validateDraft({ ...emptyDraft(), org: "Garage du Lac" }))).toBe(true);
  });

  it("validates email format", () => {
    const draft = {
      family: "Doe",
      given: "John",
      tel: [],
      email: [{ id: "1", value: "invalid", type: "" as const, _orig: { value: "invalid" } }],
      nickname: "",
      adr: [],
      bday: null,
      org: "",
      title: "",
      url: "",
      note: "",
      photo: { kind: "unchanged" as const },
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
        {
          id: "1",
          value: "test@example.com",
          type: "" as const,
          _orig: { value: "test@example.com" },
        },
      ],
      nickname: "",
      adr: [],
      bday: null,
      org: "",
      title: "",
      url: "",
      note: "",
      photo: { kind: "unchanged" as const },
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
      adr: [],
      bday: null,
      org: "",
      title: "",
      url: "not-a-url",
      note: "",
      photo: { kind: "unchanged" as const },
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
      adr: [],
      bday: null,
      org: "",
      title: "",
      url: "https://example.com",
      note: "",
      photo: { kind: "unchanged" as const },
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
        adr: [],
        bday: { source: "", year: "", month: "abc", day: "" },
        org: "",
        title: "",
        url: "",
        note: "",
        photo: { kind: "unchanged" as const },
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
        adr: [],
        bday: { source: "", year: "", month: "13", day: "" },
        org: "",
        title: "",
        url: "",
        note: "",
        photo: { kind: "unchanged" as const },
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
        adr: [],
        bday: { source: "", year: "", month: "", day: "15" },
        org: "",
        title: "",
        url: "",
        note: "",
        photo: { kind: "unchanged" as const },
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
        adr: [],
        bday: { source: "", year: "abc", month: "1", day: "15" },
        org: "",
        title: "",
        url: "",
        note: "",
        photo: { kind: "unchanged" as const },
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
        adr: [],
        bday: { source: "", year: "", month: "3", day: "" },
        org: "",
        title: "",
        url: "",
        note: "",
        photo: { kind: "unchanged" as const },
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
        adr: [],
        bday: { source: "", year: "2000", month: "3", day: "" },
        org: "",
        title: "",
        url: "",
        note: "",
        photo: { kind: "unchanged" as const },
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
        adr: [],
        bday: { source: "", year: "", month: "3", day: "14" },
        org: "",
        title: "",
        url: "",
        note: "",
        photo: { kind: "unchanged" as const },
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
        adr: [],
        bday: { source: "", year: "2000", month: "12", day: "31" },
        org: "",
        title: "",
        url: "",
        note: "",
        photo: { kind: "unchanged" as const },
      };
      const errors = validateDraft(draft);
      expect(errors.bday_month).toBeUndefined();
      expect(errors.bday_day).toBeUndefined();
      expect(errors.bday_year).toBeUndefined();
    });
  });
});

describe("validateDraft: calendar dates", () => {
  const withBirthday = (year: string, month: string, day: string) =>
    validateDraft({
      ...emptyDraft(),
      family: "Doe",
      given: "John",
      bday: { source: "", year, month, day },
    });

  it.each([
    ["2025", "1", "31"],
    ["2025", "4", "30"],
    ["2025", "12", "31"],
    ["2024", "2", "29"],
    ["2000", "2", "29"],
    ["2025", "2", "28"],
    ["", "2", "29"],
    ["", "6", "30"],
  ])("accepts %s-%s-%s", (year, month, day) => {
    expect(isValid(withBirthday(year, month, day))).toBe(true);
  });

  it.each([
    ["2025", "2", "31"],
    ["2025", "2", "29"],
    ["1900", "2", "29"],
    ["2024", "2", "30"],
    ["2025", "4", "31"],
    ["2025", "6", "31"],
    ["2025", "9", "31"],
    ["2025", "11", "31"],
    ["", "2", "30"],
    ["", "4", "31"],
  ])("rejects the day of %s-%s-%s", (year, month, day) => {
    expect(withBirthday(year, month, day)).toEqual({ bday_day: "field_bday_day" });
  });

  it("leaves an out-of-range month to its own error", () => {
    expect(withBirthday("2025", "13", "31")).toEqual({ bday_month: "field_bday_month" });
  });

  const cardWith = (line: string) =>
    parse(
      ["BEGIN:VCARD", "VERSION:3.0", "FN:Ada", "N:Lovelace;Ada;;;", line, "END:VCARD"].join("\r\n"),
    );

  it("accepts Apple's year-less 29 February, stored with 1604 as its year", () => {
    expect(validateDraft(buildDraft(cardWith("BDAY;X-APPLE-OMIT-YEAR=1604:1604-02-29")))).toEqual(
      {},
    );
  });

  it("saves other fields of a card holding an impossible date from another client", () => {
    const card = cardWith("BDAY:2025-02-31");
    const draft = { ...buildDraft(card), nickname: "Ada" };
    expect(validateDraft(draft, dirtyDiff(card, draft))).toEqual({});
  });

  it("refuses that date once the birthday is edited", () => {
    const card = cardWith("BDAY:2025-02-31");
    const base = buildDraft(card);
    const draft = { ...base, bday: base.bday && { ...base.bday, year: "2024" } };
    expect(validateDraft(draft, dirtyDiff(card, draft))).toEqual({ bday_day: "field_bday_day" });
  });
});

describe("isWebUrl", () => {
  it("accepts http and https addresses", () => {
    expect(isWebUrl("https://example.org/a")).toBe(true);
    expect(isWebUrl("http://example.org")).toBe(true);
  });

  it("refuses any other scheme, also behind the whitespace the URL parser strips", () => {
    expect(isWebUrl("ms-msdt:/id PCWDiagnostic")).toBe(false);
    expect(isWebUrl("javascript:alert(1)")).toBe(false);
    expect(isWebUrl(" javascript:alert(1)")).toBe(false);
    expect(isWebUrl("\tjavascript:alert(1)")).toBe(false);
    expect(isWebUrl("data:text/html,<p>")).toBe(false);
  });

  it("refuses what isn't a URL", () => {
    expect(isWebUrl("example.org")).toBe(false);
    expect(isWebUrl("")).toBe(false);
  });
});

describe("valueHref", () => {
  it("leaves an ordinary address or number as it is", () => {
    expect(valueHref("mailto", "katarina@noxus.example")).toBe("mailto:katarina@noxus.example");
    expect(valueHref("mailto", "jürgen@münchen.example")).toBe("mailto:jürgen@münchen.example");
    expect(valueHref("tel", "+41 79 000 00 01")).toBe("tel:+41 79 000 00 01");
    expect(valueHref("tel", "+41 21 000 00 00;ext=12")).toBe("tel:+41 21 000 00 00;ext=12");
    expect(valueHref("sms", "+41790000001")).toBe("sms:+41790000001");
  });

  it("encodes what the scheme would read as its own syntax", () => {
    expect(valueHref("mailto", "a@example.org?bcc=b@example.org&body=Hi")).toBe(
      "mailto:a@example.org%3Fbcc%3Db@example.org%26body%3DHi",
    );
    expect(valueHref("mailto", "a@example.org#x")).toBe("mailto:a@example.org%23x");
    expect(valueHref("sms", "+41790000001?body=Hi")).toBe("sms:+41790000001%3Fbody=Hi");
    expect(valueHref("tel", "*21#")).toBe("tel:*21%23");
    expect(valueHref("mailto", "a@example.org%0Abcc:b@example.org")).toBe(
      "mailto:a@example.org%250Abcc:b@example.org",
    );
  });
});

describe("kindOf", () => {
  it("reads Mobile before Travail before Domicile, in any case", () => {
    expect(kindOf(["VOICE", "CELL"])).toBe("cell");
    expect(kindOf(["home", "work"])).toBe("work");
    expect(kindOf(["PREF", "HOME"])).toBe("home");
  });

  it("reads anything else as Autre", () => {
    expect(kindOf(["INTERNET", "PREF"])).toBe("");
    expect(kindOf([])).toBe("");
  });
});

describe("withKind", () => {
  it("puts the new kind first and keeps the other values in the list's case", () => {
    expect(withKind(["HOME", "PREF"], "work")).toEqual(["WORK", "PREF"]);
    expect(withKind(["INTERNET", "PREF"], "work")).toEqual(["WORK", "INTERNET", "PREF"]);
    expect(withKind(["cell", "voice"], "home")).toEqual(["home", "voice"]);
  });

  it("drops only the kinds for Autre", () => {
    expect(withKind(["HOME", "PREF"], "")).toEqual(["PREF"]);
  });

  it("leaves a single kind", () => {
    expect(withKind(["HOME", "CELL"], "cell")).toEqual(["CELL"]);
  });

  it("starts a list when there was none", () => {
    expect(withKind([], "home")).toEqual(["home"]);
  });
});

describe("applyDraft limited to dirty fields", () => {
  const MINE = `BEGIN:VCARD
VERSION:3.0
FN:John Doe
N:Doe;John;;;
TEL;TYPE=CELL:+41 79 000 00 00
NOTE:old note
UID:dirty@example.com
END:VCARD`;
  const THEIRS = `BEGIN:VCARD
VERSION:3.0
FN:John Doe
N:Doe;John;;;
TEL;TYPE=CELL:+41 79 000 00 21
NOTE:their note
UID:dirty@example.com
END:VCARD`;

  it("applies only the fields the user changed onto the fresh copy", () => {
    const original = parse(MINE);
    const draft = buildDraft(original);
    draft.given = "Johnny";
    const fresh = applyDraft(parse(THEIRS), draft, dirtyDiff(original, draft));

    expect(fresh.fields.n.given).toBe("Johnny");
    expect(fresh.fields.fn).toBe("Johnny Doe");
    expect(fresh.fields.tel[0]?.value).toBe("+41 79 000 00 21");
    expect(fresh.fields.note).toBe("their note");
  });

  it("counts a replaced or removed photo as a change, and applies it onto the fresh copy", () => {
    const original = parse(MINE);
    const draft = buildDraft(original);
    expect(dirtyDiff(original, draft).photo).toBe(false);
    draft.photo = { kind: "removed" };
    const dirty = dirtyDiff(original, draft);
    expect(dirty.photo).toBe(true);
    expect(isDirty(dirty)).toBe(true);
    expect(applyDraft(parse(THEIRS), draft, dirty).fields.photo).toEqual({ kind: "removed" });
    const png = { kind: "replaced", mediaType: "image/png", base64: "iVBO" } as const;
    original.fields.photo = png;
    draft.photo = { ...png, base64: "iVBOR" };
    expect(dirtyDiff(original, draft).photo).toBe(true);
    draft.photo = png;
    expect(dirtyDiff(original, draft).photo).toBe(false);
    original.fields.photo = { kind: "unchanged" };
    const untouched = buildDraft(original);
    expect(
      applyDraft(parse(THEIRS), untouched, dirtyDiff(original, untouched)).fields.photo,
    ).toEqual({ kind: "unchanged" });
  });

  it("applies every field when no dirty filter is given", () => {
    const original = parse(MINE);
    const draft = buildDraft(original);
    const fresh = applyDraft(parse(THEIRS), draft);
    expect(fresh.fields.tel[0]?.value).toBe("+41 79 000 00 00");
    expect(fresh.fields.note).toBe("old note");
  });
});

describe("rebaseDraft", () => {
  const savedText = `BEGIN:VCARD
VERSION:3.0
FN:John Doe
N:Doe;John;;;
TEL;TYPE=CELL:+41 79 000 00 00
NOTE:from the server
UID:minimal@example.com
END:VCARD`;

  it("follows the saved card when nothing changed during the save", () => {
    const sent = buildDraft(makeContact());
    const saved = parse(savedText, "/test.vcf", "new");
    expect(rebaseDraft(sent, sent, saved)).toEqual(buildDraft(saved));
  });

  it("keeps what was typed during the save, and gives new fields unused ids", () => {
    const sent = { ...buildDraft(makeContact()), note: "sent" };
    const extra = {
      id: nextId(),
      value: "+41 79 000 00 21",
      type: "" as const,
      _orig: { value: "" },
    };
    const extra2 = {
      id: nextId(),
      value: "+41 79 000 00 22",
      type: "" as const,
      _orig: { value: "" },
    };
    const current = { ...sent, title: "typed meanwhile", tel: [extra, extra2] };
    const saved = parse(savedText, "/test.vcf", "new");

    const rebased = rebaseDraft(sent, current, saved);
    expect(rebased.note).toBe("from the server");
    expect(rebased.title).toBe("typed meanwhile");
    expect(rebased.tel).toBe(current.tel);
    expect([extra.id, extra2.id]).not.toContain(nextId());
  });
});

describe("applyDraft on an organisation's card", () => {
  const card = (lines: string) =>
    parse(`BEGIN:VCARD\r\nVERSION:3.0\r\nUID:org@example.com\r\n${lines}\r\nEND:VCARD`);

  it("names a card with only an organisation after it", () => {
    const contact = card("FN:\r\nN:;;;;");
    const draft = { ...buildDraft(contact), org: "Garage du Lac" };
    expect(applyDraft(contact, draft).fields.fn).toBe("Garage du Lac");
  });

  it("follows a renamed organisation when the card was named after it", () => {
    const contact = card("FN:Garage du Lac\r\nN:;;;;\r\nORG:Garage du Lac");
    const draft = { ...buildDraft(contact), org: "Garage du Port" };
    expect(applyDraft(contact, draft).fields.fn).toBe("Garage du Port");
  });

  it("takes the organisation's name when the person's name is cleared", () => {
    const contact = card("FN:Jean Dupont\r\nN:Dupont;Jean;;;\r\nORG:Garage du Lac");
    const draft = { ...buildDraft(contact), family: "", given: "" };
    expect(applyDraft(contact, draft).fields.fn).toBe("Garage du Lac");
  });

  it("leaves the name alone when the edit doesn't touch it", () => {
    const contact = card("FN:Acme sa\r\nN:;;;;\r\nORG:ACME SA");
    const draft = { ...buildDraft(contact), note: "Fermé le lundi" };
    expect(applyDraft(contact, draft).fields.fn).toBe("Acme sa");
  });

  it("keeps a name of its own", () => {
    const contact = card("FN:Le garagiste\r\nN:Dupont;Jean;;;\r\nORG:Garage du Lac");
    const draft = { ...buildDraft(contact), family: "", given: "" };
    expect(applyDraft(contact, draft).fields.fn).toBe("Le garagiste");
  });
});
