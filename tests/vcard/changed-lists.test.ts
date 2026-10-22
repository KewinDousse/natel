import { describe, expect, it } from "vitest";
import { changedLists, parse } from "../../src/vcard";

const card = (...lines: string[]) =>
  parse(
    [
      "BEGIN:VCARD",
      "VERSION:3.0",
      "UID:lists",
      "FN:Vi",
      "N:;Vi;;;",
      ...lines,
      "END:VCARD",
      "",
    ].join("\r\n"),
  );

const READ = [
  "TEL;TYPE=cell:111",
  "item1.TEL:222",
  "item1.X-ABLABEL:Bateau",
  "EMAIL:vi@example.org",
  "item2.ADR:;;Rue A;;;;",
  "item2.X-ABADR:ch",
] as const;
const ALL = ["tel", "email", "adr"] as const;

describe("changedLists (ADR 038)", () => {
  it("finds nothing changed on the card as read, whatever else changed", () => {
    expect(
      changedLists(card(...READ), card(...READ, "NOTE:elsewhere", "ORG:Elsewhere"), [...ALL]),
    ).toEqual([]);
  });

  it.each([
    ["a value", ["TEL;TYPE=cell:333", ...READ.slice(1)], ["tel"]],
    ["a parameter", ["TEL;TYPE=home:111", ...READ.slice(1)], ["tel"]],
    ["the order", [READ[1], READ[2], READ[0], ...READ.slice(3)], ["tel"]],
    [
      "a group",
      ["TEL;TYPE=cell:111", "item3.TEL:222", "item3.X-ABLABEL:Bateau", ...READ.slice(3)],
      ["tel"],
    ],
    ["a label", [READ[0], READ[1], "item1.X-ABLABEL:Yacht", ...READ.slice(3)], ["tel"]],
    ["an address's country code", [...READ.slice(0, 5), "item2.X-ABADR:fr"], ["adr"]],
    ["an e-mail added", [...READ, "EMAIL:vi@work.example"], ["email"]],
  ] as const)("finds %s changed", (_, theirs, expected) => {
    expect(changedLists(card(...READ), card(...theirs), [...ALL])).toEqual(expected);
  });

  it.each([
    ["a second label", [...READ.slice(0, 3), "item1.X-ABLABEL:Yacht", ...READ.slice(3)]],
    ["an empty label", [...READ.slice(0, 3), "item1.X-ABLABEL:", ...READ.slice(3)]],
    ["a label's parameter", [READ[0], READ[1], "item1.X-ABLABEL;X-K=1:Bateau", ...READ.slice(3)]],
  ] as const)("finds %s in a phone's group", (_, theirs) => {
    expect(changedLists(card(...READ), card(...theirs), [...ALL])).toEqual(["tel"]);
  });

  it("finds a parameter on an address's country code", () => {
    const theirs = [...READ.slice(0, 5), "item2.X-ABADR;X-K=1:ch"];
    expect(changedLists(card(...READ), card(...theirs), [...ALL])).toEqual(["adr"]);
  });

  it("finds a label given to an ungrouped phone", () => {
    const theirs = ["item3.TEL;TYPE=cell:111", "item3.X-ABLABEL:Perso", ...READ.slice(1)];
    expect(changedLists(card(...READ), card(...theirs), [...ALL])).toEqual(["tel"]);
  });

  it("looks only at the lists asked for", () => {
    const theirs = ["TEL;TYPE=cell:333", ...READ.slice(1), "EMAIL:vi@work.example"];
    expect(changedLists(card(...READ), card(...theirs), ["email"])).toEqual(["email"]);
  });
});
