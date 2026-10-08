/**
 * Cards written by real clients (the real-device test), as Baïkal stored them:
 * Bob from iCloud's web export, imported through Natel; Alice from DAVx⁵ on
 * Android. Each test replays the edit made in Natel during the device test
 * and checks that nothing but the edited properties changes (invariant 4).
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ICAL from "ical.js";
import { describe, expect, it } from "vitest";
import { applyDraft, buildDraft, type ContactDraft } from "../../src/lib/contact-edit";
import { type DraftAction, draftReducer } from "../../src/lib/draft-reducer";
import { parse, serialise } from "../../src/vcard";

function fixture(name: string): string {
  return readFileSync(resolve(import.meta.dirname, "../../fixtures/public", name), "utf8");
}

/** The card after the form's actions, unfolded so a long line can be matched whole. */
function edit(text: string, actions: (draft: ContactDraft) => DraftAction[]): string {
  const start = buildDraft(parse(text));
  const draft = actions(start).reduce(draftReducer, start);
  return serialise(applyDraft(parse(text), draft)).replace(/\r?\n[ \t]/g, "");
}

/**
 * Each property as ical.js reads it, so the equivalent forms it writes
 * (a TYPE list for repeated TYPE, the basic date form, the group's case)
 * compare equal to the ones they replace.
 */
function properties(text: string): string[] {
  const card = new ICAL.Component(ICAL.parse(text));
  return card
    .getAllProperties()
    .map((p) => {
      const [name, params, type, ...values] = p.toJSON() as [
        string,
        Record<string, unknown>,
        string,
        ...unknown[],
      ];
      const group = typeof params.group === "string" ? params.group.toLowerCase() : undefined;
      return JSON.stringify([name, { ...params, group }, type, values]);
    })
    .sort();
}

function named(props: string[], name: string): string[] {
  return props.filter((p) => p.startsWith(`["${name}",`));
}

function without(props: string[], name: string): string[] {
  return props.filter((p) => !p.startsWith(`["${name}",`));
}

describe("apple-bob.vcf (iCloud web export)", () => {
  const card = fixture("apple-bob.vcf");

  it("keeps every other property when a phone and a note line are added", () => {
    const out = edit(card, (draft) => [
      { type: "ADD_TEL" },
      { type: "SET_TEL", index: draft.tel.length, value: "+41 31 000 00 04" },
      { type: "SET_NOTE", value: `${draft.note}\nLigne 3 : modifiée dans Natel` },
    ]);

    const before = without(properties(card), "note");
    const after = without(properties(out), "note");
    expect(after).toEqual(
      [
        ...before,
        JSON.stringify(["tel", { group: undefined }, "phone-number", ["+41 31 000 00 04"]]),
      ].sort(),
    );
    expect(named(properties(out), "note")).toEqual([
      JSON.stringify([
        "note",
        { group: undefined },
        "text",
        ["Ligne 1 : accents éàüç\nLigne 2 : emoji 🍏\nLigne 3 : modifiée dans Natel"],
      ]),
    ]);
  });

  it("writes Apple's labels, related names and year-less birthday back with their parameters", () => {
    const out = edit(card, (draft) => [{ type: "SET_NOTE", value: `${draft.note}\nLigne 3` }]);

    expect(out).toContain("ITEM2.X-ABLABEL:Chalet");
    expect(out).toContain("ITEM3.X-ABRELATEDNAMES;TYPE=pref:Marguerite Pommé");
    expect(out).toContain("ITEM3.X-ABLABEL:_$!<Mother>!$_");
    expect(out).toContain("BDAY;X-APPLE-OMIT-YEAR=1604;VALUE=DATE:16040714");
    expect(out).toContain("X-PHONETIC-FIRST-NAME:Bobe");
  });
});

describe("davx5-alice.vcf (DAVx⁵ 4.5.20, vCard 4.0)", () => {
  const card = fixture("davx5-alice.vcf");

  it("keeps every other property, the photo included, when the organisation changes", () => {
    const out = edit(card, () => [{ type: "SET_ORG", value: "Robots Fictifs SA" }]);

    expect(without(properties(out), "org")).toEqual(without(properties(card), "org"));
    expect(named(properties(out), "org")).toEqual([
      JSON.stringify(["org", { group: undefined }, "text", ["Robots Fictifs SA"]]),
    ]);
  });
});
