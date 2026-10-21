import { describe, expect, it } from "vitest";
import { applyDraft, buildDraft, dirtyDiff, isDirty } from "@/lib/contact-edit";
import { type DraftAction, draftReducer } from "@/lib/draft-reducer";
import { parse, serialise, unshownPropertiesOf } from "@/vcard";

const CARD = [
  "BEGIN:VCARD",
  "VERSION:3.0",
  "UID:labels",
  "FN:Ada",
  "N:;Ada;;;",
  "item1.TEL;TYPE=CELL,VOICE;X-KEEP=yes:111",
  "item1.X-ABLABEL:Chalet",
  "item2.EMAIL;TYPE=HOME,INTERNET:ada@example.com",
  "item2.X-ABLABEL:Cabane",
  "item3.ADR;TYPE=HOME:;;Rue 1;Lausanne;;1000;Suisse",
  "item3.X-ABLABEL:Atelier",
  "item4.URL;TYPE=HOME:https://example.com",
  "item4.X-ABLABEL:_$!<HomePage>!$_",
  "item5.URL:https://other.example.com",
  "item5.X-ABLABEL:Second site",
  "item6.X-ABRELATEDNAMES:Bob",
  "item6.X-ABLABEL:_$!<Mother>!$_",
  "item1.X-KEEP:untouched",
  "END:VCARD",
  "",
].join("\r\n");

function edit(actions: DraftAction[]) {
  const contact = parse(CARD);
  const draft = actions.reduce(draftReducer, buildDraft(contact));
  applyDraft(contact, draft);
  return serialise(contact);
}

describe("grouped X-ABLABEL", () => {
  it("reads labels for the displayed phone, email, address and URL", () => {
    const { fields } = parse(CARD);
    expect(fields.tel[0]?.label).toBe("Chalet");
    expect(fields.email[0]?.label).toBe("Cabane");
    expect(fields.adr[0]?.label).toBe("Atelier");
    expect(fields.urlField?.label).toBe("_$!<HomePage>!$_");
  });

  it("excludes only displayed label properties from unshown information", () => {
    const unshown = unshownPropertiesOf(parse(CARD)).join("\n");
    expect(unshown).not.toContain("X-ABLABEL:Chalet");
    expect(unshown).not.toContain("X-ABLABEL:Atelier");
    expect(unshown).not.toContain("X-ABLABEL:Cabane");
    expect(unshown).not.toContain("X-ABLABEL:_$!<HomePage>!$_");
    expect(unshown).toContain("X-ABLABEL:Second site");
    expect(unshown).toContain("X-ABLABEL:_$!<Mother>!$_");
  });

  it("keeps labels and unknown group properties when only a value changes", () => {
    const out = edit([{ type: "SET_TEL", index: 0, value: "222" }]);
    expect(out).toContain("ITEM1.X-ABLABEL:Chalet");
    expect(out).toContain("ITEM1.X-KEEP:untouched");
    expect(out).toContain("ITEM1.TEL;TYPE=CELL,VOICE;X-KEEP=yes:222");
  });

  it.each([
    [
      { type: "SET_TEL_TYPE", index: 0, value: "cell" },
      "ITEM1",
      "TEL;TYPE=CELL,VOICE;X-KEEP=yes:111",
    ],
    [
      { type: "SET_EMAIL_TYPE", index: 0, value: "work" },
      "ITEM2",
      "EMAIL;TYPE=WORK,INTERNET:ada@example.com",
    ],
    [
      { type: "SET_ADR_TYPE", index: 0, value: "home" },
      "ITEM3",
      "ADR;TYPE=HOME:;;Rue 1;Lausanne;;1000;Suisse",
    ],
    [{ type: "SET_URL_TYPE", value: "work" }, "ITEM4", "URL;TYPE=WORK:https://example.com"],
  ] as const)(
    "drops only the chosen group's label when a type is selected (%j)",
    (action, group, line) => {
      const out = edit([action]);
      expect(out).not.toContain(`${group}.X-ABLABEL`);
      expect(out).toContain(`${group}.${line}`);
      expect(out).toContain("ITEM6.X-ABLABEL:_$!<Mother>!$_");
      expect(out).toContain("ITEM5.X-ABLABEL:Second site");
    },
  );

  it("counts choosing the existing underlying type as an edit", () => {
    const contact = parse(CARD);
    const draft = buildDraft(contact);
    expect(isDirty(dirtyDiff(contact, draft))).toBe(false);
    const edited = draftReducer(draft, { type: "SET_TEL_TYPE", index: 0, value: "cell" });
    expect(dirtyDiff(contact, edited).tel).toBe(true);
  });

  it("matches group names case-insensitively, never associates an ungrouped label", () => {
    const contact = parse(
      CARD.replace("item1.X-ABLABEL", "ITEM1.X-ABLABEL").replace("item2.X-ABLABEL", "X-ABLABEL"),
    );
    expect(contact.fields.tel[0]?.label).toBe("Chalet");
    expect(contact.fields.email[0]?.label).toBeUndefined();
  });

  it("preserves labels on value edits in vCard 4.0 too", () => {
    const contact = parse(CARD.replace("VERSION:3.0", "VERSION:4.0"));
    const draft = draftReducer(buildDraft(contact), { type: "SET_NOTE", value: "Note" });
    expect(serialise(applyDraft(contact, draft))).toContain("ITEM1.X-ABLABEL:Chalet");
  });

  it("restores an address's original type when the label is reselected", () => {
    const contact = parse(CARD);
    let draft = buildDraft(contact);
    draft = draftReducer(draft, { type: "SET_ADR_TYPE", index: 0, value: "work" });
    draft = draftReducer(draft, { type: "SET_ADR_TYPE", index: 0, value: "label" });
    expect(dirtyDiff(contact, draft).adr).toBe(false);
    expect(serialise(applyDraft(contact, draft))).toContain("ITEM3.X-ABLABEL:Atelier");
  });

  it("labels an address without a group in a group of its own", () => {
    const contact = parse(CARD.replace("UID:labels", "UID:labels\r\nADR:;;Quai 2;Genève;;1201;"));
    const out = serialise(
      applyDraft(
        contact,
        [
          { type: "SET_ADR_TYPE", index: 0, value: "custom" },
          { type: "SET_ADR_LABEL", index: 0, value: " Bateau " },
        ].reduce<ReturnType<typeof buildDraft>>(
          (draft, action) => draftReducer(draft, action as DraftAction),
          buildDraft(contact),
        ),
      ),
    );
    expect(out).toContain("ITEM7.ADR:;;Quai 2;Genève;;1201;");
    expect(out).toContain("ITEM7.X-ABLABEL:Bateau");
    expect(out).toContain("ITEM3.X-ABLABEL:Atelier");
    expect(parse(out).fields.adr.map((adr) => adr.label)).toEqual(["Bateau", "Atelier"]);
  });

  it("renames an address's own label in place, starting from it", () => {
    const contact = parse(CARD);
    let draft = draftReducer(buildDraft(contact), {
      type: "SET_ADR_TYPE",
      index: 0,
      value: "custom",
    });
    expect(draft.adr[0]?.customLabel).toBe("Atelier");
    expect(dirtyDiff(contact, draft).adr).toBe(false);
    draft = draftReducer(draft, { type: "SET_ADR_LABEL", index: 0, value: "Forge" });
    expect(dirtyDiff(contact, draft).adr).toBe(true);
    const out = serialise(applyDraft(contact, draft));
    expect(out).toContain("ITEM3.X-ABLABEL:Forge");
    expect(out).not.toContain("Atelier");
    expect(out).toContain("ITEM3.ADR;TYPE=HOME:;;Rue 1;Lausanne;;1000;Suisse");
  });

  it("moves an address sharing a phone's group to its own before labelling it", () => {
    const contact = parse(CARD.replace("item3.ADR", "item1.ADR"));
    let draft = draftReducer(buildDraft(contact), {
      type: "SET_ADR_TYPE",
      index: 0,
      value: "custom",
    });
    draft = draftReducer(draft, { type: "SET_ADR_LABEL", index: 0, value: "Bateau" });
    const out = parse(serialise(applyDraft(contact, draft)));
    expect(out.fields.tel[0]?.label).toBe("Chalet");
    expect(out.fields.adr[0]?.label).toBe("Bateau");
  });

  it("drops an address's label when the custom one is left empty", () => {
    const out = edit([
      { type: "SET_ADR_TYPE", index: 0, value: "custom" },
      { type: "SET_ADR_LABEL", index: 0, value: "  " },
    ]);
    expect(out).not.toContain("ITEM3.X-ABLABEL");
    expect(out).toContain("ITEM3.ADR;TYPE=HOME:;;Rue 1;Lausanne;;1000;Suisse");
  });

  it("starts a custom label empty from one of Apple's built-in labels", () => {
    const contact = parse(CARD.replace("X-ABLABEL:Atelier", "X-ABLABEL:_$!<Work>!$_"));
    const draft = draftReducer(buildDraft(contact), {
      type: "SET_ADR_TYPE",
      index: 0,
      value: "custom",
    });
    expect(draft.adr[0]?.customLabel).toBe("");
  });

  it("drops the right label when another phone row is removed", () => {
    const contact = parse(CARD.replace("item1.TEL", "TEL:000\r\nitem1.TEL"));
    let draft = buildDraft(contact);
    draft = draftReducer(draft, { type: "REMOVE_TEL", index: 0 });
    draft = draftReducer(draft, { type: "SET_TEL_TYPE", index: 0, value: "work" });
    const out = serialise(applyDraft(contact, draft));
    expect(out).toContain("ITEM1.TEL;X-KEEP=yes;TYPE=WORK,VOICE:111");
    expect(out).not.toContain("ITEM1.X-ABLABEL");
    expect(out).toContain("ITEM1.X-KEEP:untouched");
  });

  it("refreshes cached labels of every field sharing an edited group", () => {
    const contact = parse(
      CARD.replace("item2.EMAIL", "item1.EMAIL").replace("item3.ADR", "item1.ADR"),
    );
    const draft = draftReducer(buildDraft(contact), {
      type: "SET_TEL_TYPE",
      index: 0,
      value: "work",
    });
    serialise(applyDraft(contact, draft));
    expect(contact.fields.tel[0]?.label).toBeUndefined();
    expect(contact.fields.email[0]?.label).toBeUndefined();
    expect(contact.fields.adr[0]?.label).toBeUndefined();
    expect(contact.fields.tel[0]?.dropLabel).toBeUndefined();
    expect(isDirty(dirtyDiff(contact, buildDraft(contact)))).toBe(false);
  });

  it("never applies a removed URL's type to the subsequent URL", () => {
    const out = edit([{ type: "SET_URL", value: "" }]);
    expect(out).toContain("ITEM5.URL:https://other.example.com");
    expect(out).not.toContain("ITEM5.URL;TYPE=");
    expect(out).toContain("ITEM5.X-ABLABEL:Second site");
  });

  it("reads the first non-empty label and keeps unshown duplicates", () => {
    const contact = parse(
      CARD.replace(
        "item1.X-ABLABEL:Chalet",
        "item1.X-ABLABEL:\r\nitem1.X-ABLABEL:Chalet\r\nitem1.X-ABLABEL:Duplicate",
      ),
    );
    expect(contact.fields.tel[0]?.label).toBe("Chalet");
    expect(unshownPropertiesOf(contact).join("\n")).toContain("ITEM1.X-ABLABEL:Duplicate");
  });
});
