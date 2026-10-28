import { describe, expect, it } from "vitest";
import { similarContactFinder } from "@/lib/import-similar";
import { parse } from "@/vcard";

function contact(uid: string, lines: string[]) {
  return parse(
    ["BEGIN:VCARD", "VERSION:3.0", `UID:${uid}`, ...lines, "END:VCARD", ""].join("\r\n"),
  );
}

const BOOK = [
  contact("ada", ["FN:Ada Lovelace", "N:Lovelace;Ada;;;", "EMAIL:Ada@Example.org"]),
  contact("bob", ["FN:Bob", "N:;Bob;;;", "TEL:079 000 00 01"]),
  contact("team", ["FN:Team", "N:Team;;;;", "X-ADDRESSBOOKSERVER-KIND:group"]),
];

describe("similarContactFinder", () => {
  const similarTo = similarContactFinder(BOOK);

  it("matches the same name, whatever the case, accents and extra spaces", () => {
    expect(similarTo(contact("x", ["FN:ADA  lovelacé", "N:;;;;"]))?.uid).toBe("ada");
  });

  it("matches the same e-mail address, whatever the case", () => {
    expect(similarTo(contact("x", ["FN:A. L.", "EMAIL:ada@example.ORG"]))?.uid).toBe("ada");
  });

  it("matches a Swiss number written nationally or internationally", () => {
    expect(similarTo(contact("x", ["FN:Robert", "TEL:+41 79 000 00 01"]))?.uid).toBe("bob");
  });

  it("matches nothing else, and never a group card", () => {
    expect(similarTo(contact("x", ["FN:Grace Hopper", "TEL:079 000 00 02"]))).toBeNull();
    expect(similarTo(contact("x", ["FN:Team", "N:Team;;;;"]))).toBeNull();
  });
});
