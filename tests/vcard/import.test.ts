/**
 * Tests for the .vcf import helpers in src/vcard: splitting a file into the
 * cards' original texts, reading what an import needs, adding a missing UID.
 */
import { describe, expect, it } from "vitest";
import { readImportCard, splitCards, withUid } from "@/vcard";

const ADA =
  "BEGIN:VCARD\r\nVERSION:3.0\r\nUID:ada\r\nFN:Ada Lovelace\r\nN:Lovelace;Ada;;;\r\nEND:VCARD\r\n";
const BOB = "BEGIN:VCARD\nVERSION:4.0\nFN:Bob\nX-CUSTOM;X-P=1:keep me\nEND:VCARD\n";

describe("splitCards", () => {
  it("keeps each card's text exactly, line endings included", () => {
    expect(splitCards(ADA + BOB)).toEqual([ADA, BOB]);
  });

  it("drops a byte order mark and text between cards", () => {
    expect(splitCards(`﻿${ADA}\r\nnoise\r\n${BOB}`)).toEqual([ADA, BOB]);
  });

  it("matches BEGIN and END in any case", () => {
    const lower = "begin:vcard\r\nversion:3.0\r\nfn:X\r\nend:vcard\r\n";
    expect(splitCards(lower)).toEqual([lower]);
  });

  it("keeps a card nested in another (vCard 2.1 AGENT) inside it", () => {
    const nested =
      "BEGIN:VCARD\r\nFN:A\r\nAGENT:\r\nBEGIN:VCARD\r\nFN:B\r\nEND:VCARD\r\nEND:VCARD\r\n";
    expect(splitCards(nested)).toEqual([nested]);
  });

  it("keeps a card cut short, for the parser to reject", () => {
    expect(splitCards("BEGIN:VCARD\r\nFN:A\r\n")).toEqual(["BEGIN:VCARD\r\nFN:A\r\n"]);
  });

  it("ends a card cut short where the next one begins", () => {
    const cut = "BEGIN:VCARD\r\nFN:A\r\n";
    expect(splitCards(cut + ADA + BOB)).toEqual([cut, ADA, BOB]);
  });

  it("finds nothing in a file without cards", () => {
    expect(splitCards("hello\r\n")).toEqual([]);
  });
});

describe("readImportCard", () => {
  it("reads the UID and FN", () => {
    expect(readImportCard(ADA)).toEqual({ uid: "ada", name: "Ada Lovelace" });
  });

  it("reads a card without UID as null", () => {
    expect(readImportCard(BOB)).toEqual({ uid: null, name: "Bob" });
  });

  it("keeps the UID exactly as written", () => {
    const card = "BEGIN:VCARD\r\nVERSION:3.0\r\nUID: spaced \r\nFN:A\r\nEND:VCARD\r\n";
    expect(readImportCard(card).uid).toBe(" spaced ");
  });

  it("falls back to N for the name", () => {
    const card = "BEGIN:VCARD\r\nVERSION:3.0\r\nN:Favre;Alain;;;\r\nEND:VCARD\r\n";
    expect(readImportCard(card).name).toBe("Alain Favre");
  });

  it("throws on a card ical.js can't read", () => {
    expect(() => readImportCard("BEGIN:VCARD\r\nFN:A\r\n")).toThrow();
  });
});

describe("withUid", () => {
  it("adds the UID just before END:VCARD, in the card's line ending", () => {
    expect(withUid(BOB, "u-1")).toBe(
      "BEGIN:VCARD\nVERSION:4.0\nFN:Bob\nX-CUSTOM;X-P=1:keep me\nUID:u-1\nEND:VCARD\n",
    );
    const crlf = ADA.replace("UID:ada\r\n", "");
    expect(withUid(crlf, "u-2")).toBe(
      ADA.replace("UID:ada\r\n", "").replace("END:VCARD", "UID:u-2\r\nEND:VCARD"),
    );
  });

  it("keeps bare CR line endings", () => {
    expect(withUid("BEGIN:VCARD\rFN:A\rEND:VCARD\r", "u")).toBe(
      "BEGIN:VCARD\rFN:A\rUID:u\rEND:VCARD\r",
    );
  });

  it("works on a card without a final line ending", () => {
    expect(withUid("BEGIN:VCARD\r\nFN:A\r\nEND:VCARD", "u")).toBe(
      "BEGIN:VCARD\r\nFN:A\r\nUID:u\r\nEND:VCARD",
    );
  });
});
