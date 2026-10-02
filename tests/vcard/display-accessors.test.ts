/**
 * Tests for the read-only display accessors added for the contact page
 * (TITLE, ADR, BDAY, NOTE, CATEGORIES). Additive module: they must never
 * modify `raw` or touch the editable subset.
 */

import { describe, expect, it } from "vitest";
import { addressOf, birthdayOf, groupsOf, jobTitleOf, noteOf, parse, serialise } from "@/vcard";

const CARD_RICH = [
  "BEGIN:VCARD",
  "VERSION:3.0",
  "UID:u-rich",
  "FN:Katarina Du Couteau-Laurent",
  "N:Du Couteau-Laurent;Katarina;;;",
  "TITLE:Lame de Noxus",
  "ORG:Haut Commandement de Noxus",
  "TEL;TYPE=CELL:+41790000001",
  "ADR;TYPE=WORK:;;Place du Bastion 2;Noxus;NX;0000;Runeterra",
  "BDAY:1987-03-14",
  "CATEGORIES:Travail,Fosse de Noxus",
  "NOTE:Rencontrée à la Fosse de Noxus.\\nPréfère les messages aux appels.",
  "END:VCARD",
].join("\r\n");

describe("jobTitleOf", () => {
  it("returns the TITLE value", () => {
    expect(jobTitleOf(parse(CARD_RICH))).toBe("Lame de Noxus");
  });

  it("returns an empty string when TITLE is absent", () => {
    const card = CARD_RICH.replace("\r\nTITLE:Lame de Noxus", "");
    expect(jobTitleOf(parse(card))).toBe("");
  });
});

describe("addressOf", () => {
  it("exposes the structured parts of ADR as a plain object", () => {
    const address = addressOf(parse(CARD_RICH));
    expect(address).toEqual({
      poBox: "",
      extended: "",
      street: "Place du Bastion 2",
      locality: "Noxus",
      region: "NX",
      postalCode: "0000",
      country: "Runeterra",
      extraParts: [],
      type: ["WORK"],
    });
  });

  it("returns null when ADR is absent", () => {
    const card = CARD_RICH.replace(
      "\r\nADR;TYPE=WORK:;;Place du Bastion 2;Noxus;NX;0000;Runeterra",
      "",
    );
    expect(addressOf(parse(card))).toBeNull();
  });

  it("reads the TYPE parameter as an array", () => {
    const card = CARD_RICH.replace("ADR;TYPE=WORK:", "ADR;TYPE=HOME:");
    expect(addressOf(parse(card))?.type).toEqual(["HOME"]);
  });
});

describe("birthdayOf", () => {
  it("reads a full date as plain parts plus the raw source", () => {
    const birthday = birthdayOf(parse(CARD_RICH));
    expect(birthday).toEqual({
      source: "1987-03-14",
      year: 1987,
      month: 3,
      day: 14,
      valueType: "date",
    });
  });

  it("keeps a month-day (no year) with year null", () => {
    const card = CARD_RICH.replace("BDAY:1987-03-14", "BDAY:--03-14");
    expect(birthdayOf(parse(card))).toEqual({
      source: "--03-14",
      year: null,
      month: 3,
      day: 14,
      valueType: "date",
    });
  });

  it("keeps a year-only date with month/day null", () => {
    const card = CARD_RICH.replace("BDAY:1987-03-14", "BDAY:1987");
    expect(birthdayOf(parse(card))).toEqual({
      source: "1987",
      year: 1987,
      month: null,
      day: null,
      valueType: "date",
    });
  });

  it("returns null when BDAY is absent", () => {
    const card = CARD_RICH.replace("\r\nBDAY:1987-03-14", "");
    expect(birthdayOf(parse(card))).toBeNull();
  });
});

describe("noteOf", () => {
  it("returns the NOTE text with whitespace preserved", () => {
    expect(noteOf(parse(CARD_RICH))).toBe(
      "Rencontrée à la Fosse de Noxus.\nPréfère les messages aux appels.",
    );
  });

  it("returns an empty string when NOTE is absent", () => {
    const card = CARD_RICH.replace(
      "\r\nNOTE:Rencontrée à la Fosse de Noxus.\\nPréfère les messages aux appels.",
      "",
    );
    expect(noteOf(parse(card))).toBe("");
  });
});

describe("groupsOf", () => {
  it("flattens a multi-value CATEGORIES property", () => {
    expect(groupsOf(parse(CARD_RICH))).toEqual(["Travail", "Fosse de Noxus"]);
  });

  it("flattens several CATEGORIES properties in order", () => {
    const card = CARD_RICH.replace("CATEGORIES:Travail,Fosse de Noxus", "CATEGORIES:Famille");
    const withSecond = card.replace("\r\nEND:VCARD", "\r\nCATEGORIES:Voisins\r\nEND:VCARD");
    expect(groupsOf(parse(withSecond))).toEqual(["Famille", "Voisins"]);
  });

  it("returns an empty array when CATEGORIES is absent", () => {
    const card = CARD_RICH.replace("\r\nCATEGORIES:Travail,Fosse de Noxus", "");
    expect(groupsOf(parse(card))).toEqual([]);
  });
});

describe("read-only guarantee", () => {
  it("none of the accessors modifies the raw component", () => {
    const contact = parse(CARD_RICH);
    const before = serialise(contact);
    jobTitleOf(contact);
    addressOf(contact);
    birthdayOf(contact);
    noteOf(contact);
    groupsOf(contact);
    expect(serialise(contact)).toBe(before);
  });
});
