import { describe, expect, it } from "vitest";
import {
  buildDraft,
  cardConflict,
  dirtyDiff,
  dirtySections,
  nextId,
} from "../../src/lib/contact-edit";
import { parse } from "../../src/vcard";

const card = (...lines: string[]) =>
  parse(["BEGIN:VCARD", "VERSION:3.0", "UID:sections", ...lines, "END:VCARD", ""].join("\r\n"));

const READ = [
  "FN:Vi Example",
  "N:Example;Vi;;;",
  "TEL;TYPE=cell:111",
  "EMAIL:vi@example.org",
  "NOTE:Met at the market",
];

const replacing = (from: string, to: string) => READ.map((line) => (line === from ? to : line));

const NOTHING_EDITED = dirtyDiff(card(...READ), buildDraft(card(...READ)));

const elsewhere = (theirs: string[], read = READ) =>
  cardConflict(card(...read), card(...theirs), NOTHING_EDITED).elsewhere;

describe("card conflict", () => {
  it("finds nothing when only properties the page doesn't show changed", () => {
    expect(elsewhere([...READ, "REV:2026-11-16T10:00:00Z"])).toEqual([]);
  });

  it("finds nothing when only how a field is written changed", () => {
    expect(elsewhere(replacing("TEL;TYPE=cell:111", "item7.TEL;TYPE=CELL:111"))).toEqual([]);
  });

  it.each([
    ["the name", replacing("N:Example;Vi;;;", "N:Example;Viola;;;"), ["name"]],
    ["a phone's type", replacing("TEL;TYPE=cell:111", "TEL;TYPE=work:111"), ["tel"]],
    ["the note", replacing("NOTE:Met at the market", "NOTE:Met at the fair"), ["note"]],
    ["a birthday added", [...READ, "BDAY:1990-05-01"], ["bday"]],
  ] as const)("finds %s changed elsewhere", (_, theirs, expected) => {
    expect(elsewhere([...theirs])).toEqual(expected);
  });

  it("names the sections in the form's order", () => {
    const theirs = [...replacing("NOTE:Met at the market", "NOTE:Elsewhere"), "ORG:Elsewhere"];
    expect(elsewhere(theirs)).toEqual(["org", "note"]);
  });

  it("finds a website's type changed elsewhere", () => {
    const read = [...READ, "URL;TYPE=work:https://example.org"];
    expect(elsewhere([...READ, "URL;TYPE=home:https://example.org"], read)).toEqual(["url"]);
  });

  it("finds nothing when only how the birthday is written changed", () => {
    expect(elsewhere([...READ, "BDAY:1990-05-01"], [...READ, "BDAY:19900501"])).toEqual([]);
  });

  it("gives a field added to the draft being edited an id of its own", () => {
    const draft = buildDraft(card(...READ));
    elsewhere(["FN:Vi", "N:;;;;"]);
    const ids = [...draft.tel, ...draft.email].map((field) => field.id);
    expect(ids).not.toContain(nextId());
  });

  it("names a list changed on both sides apart from the other sections", () => {
    const base = card(...READ);
    const draft = buildDraft(base);
    const mine = { ...draft, tel: draft.tel.map((field) => ({ ...field, value: "333" })) };
    const theirs = card(...replacing("TEL;TYPE=cell:111", "TEL;TYPE=cell:222"), "ORG:Elsewhere");
    expect(cardConflict(base, theirs, dirtyDiff(base, mine))).toEqual({
      lists: ["tel"],
      elsewhere: ["org"],
    });
  });
});

describe("dirty sections", () => {
  it("names a section once for any of its fields, in the form's order", () => {
    const base = card(...READ);
    const draft = { ...buildDraft(base), note: "Mine", given: "Vivian", family: "Other" };
    expect(dirtySections(dirtyDiff(base, draft))).toEqual(["name", "note"]);
  });
});
