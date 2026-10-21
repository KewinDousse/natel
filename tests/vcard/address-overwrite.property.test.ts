// @vitest-environment node
/**
 * Seeded randomized test of how addresses are written on a save and on an
 * overwrite (ADR 013, 036). Each case builds a card, another client's
 * version of it and a user's edit, then checks properties of the text the
 * writer gives. A failure prints its seed and the cards, to be turned into
 * a plain test in edit-roundtrip.test.ts; `PROPERTY_SEEDS=12,34` runs only those.
 *
 * Most grouped addresses carry an `X-ABADR` code of their own, which the
 * writer never matches on: the oracle follows an address by it. Identical
 * addresses share one, as a country code would.
 */

import { describe, expect, it } from "vitest";
import {
  applyDraft,
  buildDraft,
  type ContactDraft,
  type DirtyFields,
  dirtyDiff,
  type FieldKind,
} from "../../src/lib/contact-edit";
import { type DraftAction, draftReducer } from "../../src/lib/draft-reducer";
import type { Contact, VCardAddressField } from "../../src/model/contact";
import { parse, savedLabelOf, serialise, writesAddress } from "../../src/vcard";

const SEEDS = process.env.PROPERTY_SEEDS
  ? process.env.PROPERTY_SEEDS.split(",").map(Number)
  : Array.from({ length: 2000 }, (_, i) => i + 1);

// ---------------------------------------------------------------------------
// Randomness
// ---------------------------------------------------------------------------

type Rng = {
  int: (n: number) => number;
  chance: (p: number) => boolean;
  pick: <T>(items: readonly T[]) => T;
};

function rngOf(seed: number): Rng {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (n: number) => Math.floor(next() * n);
  return {
    int,
    chance: (p) => next() < p,
    pick: (items) => items[int(items.length)] as (typeof items)[number],
  };
}

// ---------------------------------------------------------------------------
// Cards as lines
// ---------------------------------------------------------------------------

/** A card line; `owner` names the logical address an ADR or X-ABADR belongs to. */
type Line = { group?: string; name: string; params: string; value: string; owner?: string };

function render(lines: Line[]): string {
  return [
    "BEGIN:VCARD",
    "VERSION:3.0",
    "UID:generated",
    "FN:Vi",
    "N:;Vi;;;",
    ...lines.map(
      (l) => `${l.group ? `${l.group.toUpperCase()}.` : ""}${l.name}${l.params}:${l.value}`,
    ),
    "END:VCARD",
    "",
  ].join("\r\n");
}

/** The lines of a serialised card, unfolded, group lowercased. */
function linesOf(text: string): Line[] {
  return text
    .replace(/\r\n[ \t]/g, "")
    .split("\r\n")
    .flatMap((line) => {
      const m = /^(?:([A-Za-z0-9-]+)\.)?([A-Za-z0-9-]+)((?:;[^:]*)?):(.*)$/.exec(line);
      if (!m) return [];
      const [, group, name = "", params = "", value = ""] = m;
      return [{ group: group?.toLowerCase(), name: name.toUpperCase(), params, value }];
    });
}

const textOf = (l: Line) => `${l.params}:${l.value}`;

const HEADER = new Set(["BEGIN", "END", "VERSION", "UID", "FN", "N"]);

function labelOf(lines: Line[], group: string | undefined): string | undefined {
  if (group === undefined) return undefined;
  return lines.find((l) => l.name === "X-ABLABEL" && l.group === group && l.value.length > 0)
    ?.value;
}

// ---------------------------------------------------------------------------
// Generator
// ---------------------------------------------------------------------------

const ADR_PARAMS = ["", ";TYPE=HOME", ";TYPE=WORK", ";TYPE=HOME;X-K=1"];
const LABELS = ["Chalet", "Atelier", String.raw`Lac\, nord`, "_$!<Home>!$_", "_$!<Work>!$_"];

function adrValue(r: Rng): string {
  const street = r.pick(["Rue A", "Rue B", "Quai C", "Rue A,Bât 2"]);
  return `;${r.pick(["", "Bât 1"])};${street};${r.pick(["Piltover", "Zaun"])};;0001;RT`;
}

function otherProperty(r: Rng, hasUrl: boolean): Omit<Line, "group"> {
  const kinds = ["TEL", "EMAIL", "IMPP", "X-ABRELATEDNAMES", ...(hasUrl ? [] : ["URL"])];
  const name = r.pick(kinds);
  const value =
    name === "TEL"
      ? `+41 21 000 00 ${r.int(90) + 10}`
      : name === "EMAIL"
        ? `vi${r.int(9)}@example.org`
        : name === "URL"
          ? "https://vi.example"
          : name === "IMPP"
            ? "xmpp:vi@example.org"
            : "Jinx";
  const params = name === "TEL" && r.chance(0.5) ? ";TYPE=CELL" : "";
  return { name, params, value };
}

/** A card's lines, and each address's code by owner. */
type Generated = { lines: Line[]; codes: Map<string, string> };

function generateMine(r: Rng): Generated {
  const codes = new Map<string, string>();
  const codeOfText = new Map<string, string | null>();
  const blocks: Line[][] = [];
  let hasUrl = false;
  const addresses: Line[] = [];
  const count = r.int(5);
  for (let i = 0; i < count; i++) {
    const owner = `a${i}`;
    const twin = addresses.length > 0 && r.chance(0.2) ? r.pick(addresses) : undefined;
    const adr: Line = {
      group: twin ? twin.group : r.chance(0.8) ? "?" : undefined,
      name: "ADR",
      params: twin?.params ?? r.pick(ADR_PARAMS),
      value: twin?.value ?? adrValue(r),
      owner,
    };
    addresses.push(adr);
    const block = [adr];
    if (adr.group !== undefined) {
      const key = `${adr.params}:${adr.value}`;
      if (!codeOfText.has(key)) codeOfText.set(key, r.chance(0.85) ? `x${codeOfText.size}` : null);
      const code = codeOfText.get(key);
      if (code) {
        codes.set(owner, code);
        block.push({ group: "?", name: "X-ABADR", params: "", value: code, owner });
      }
      if (r.chance(0.5))
        block.push({ group: "?", name: "X-ABLABEL", params: "", value: r.pick(LABELS) });
      if (r.chance(0.25)) {
        const other = otherProperty(r, hasUrl);
        hasUrl ||= other.name === "URL";
        block.splice(r.int(block.length + 1), 0, { group: "?", ...other });
      }
    }
    blocks.push(block);
  }
  const others = r.int(4);
  for (let i = 0; i < others; i++) {
    const other = otherProperty(r, hasUrl);
    hasUrl ||= other.name === "URL";
    if (r.chance(0.6)) {
      const label = r.pick(["_$!<Mobile>!$_", "Bureau", "_$!<HomePage>!$_", "Jabber"]);
      blocks.push([
        { group: "?", ...other },
        { group: "?", name: "X-ABLABEL", params: "", value: label },
      ]);
    } else {
      blocks.push([other]);
    }
  }
  if (r.chance(0.3)) blocks.push([{ name: "X-FOO", params: ";X-P=1", value: "kept" }]);
  // Shuffled, so addresses mix with the other properties.
  for (let i = blocks.length - 1; i > 0; i--) {
    const j = r.int(i + 1);
    [blocks[i], blocks[j]] = [blocks[j] as Line[], blocks[i] as Line[]];
  }
  let n = 0;
  const lines = blocks.flatMap((block) => {
    if (!block.some((l) => l.group === "?")) return block;
    n += r.chance(0.15) ? 2 : 1;
    return block.map((l) => ({ ...l, group: `item${n}` }));
  });
  return { lines, codes };
}

type Theirs = Generated & { ops: string[]; regrouped: boolean };

/** `mine` as another client saved it since. */
function generateTheirs(r: Rng, mine: Generated): Theirs {
  let lines = mine.lines.map((l) => ({ ...l }));
  const codes = new Map(mine.codes);
  const ops: string[] = [];
  let regrouped = false;
  const groups = () => [...new Set(lines.flatMap((l) => (l.group ? [l.group] : [])))];
  const freeGroup = () => {
    const used = new Set(groups());
    let n = 1;
    while (used.has(`item${n}`)) n++;
    return `item${n}`;
  };
  // Identical addresses differ only by group: which one another client
  // changed or removed is a guess, so it changes neither.
  const mineAdrs = mine.lines.filter((l) => l.name === "ADR");
  const twins = new Set(
    mineAdrs
      .filter((l) => mineAdrs.some((o) => o !== l && textOf(o) === textOf(l)))
      .map((l) => l.owner),
  );
  const opCount = r.int(4);
  for (let k = 0; k < opCount; k++) {
    const adrs = lines.filter((l) => l.name === "ADR");
    const single = adrs.filter((l) => !twins.has(l.owner));
    const op = r.pick(["renumber", "compact", "swap", "text", "recode", "add", "remove", "label"]);
    if (op === "compact" && groups().length > 0) {
      // As Apple saves: a property and its label may go, then groups count
      // from 1. Not the website, which the user may edit here.
      const alone = groups().filter(
        (g) => !lines.some((l) => l.group === g && (l.name === "ADR" || l.name === "URL")),
      );
      if (alone.length > 0 && r.chance(0.5)) {
        const gone = r.pick(alone);
        lines = lines.filter((l) => l.group !== gone);
      }
      const map = new Map(groups().map((g, i) => [g, `item${i + 1}`]));
      lines = lines.map((l) => (l.group ? { ...l, group: map.get(l.group) } : l));
      ops.push("compact");
      regrouped = true;
    } else if (op === "renumber" && groups().length > 0) {
      const shift = 1 + r.int(3);
      const map = new Map(groups().map((g) => [g, `item${Number(g.slice(4)) + shift}`]));
      lines = lines.map((l) => (l.group ? { ...l, group: map.get(l.group) } : l));
      ops.push(`renumber +${shift}`);
      regrouped = true;
    } else if (op === "swap" && groups().length > 1) {
      const all = groups();
      const a = r.pick(all);
      const b = r.pick(all.filter((g) => g !== a));
      lines = lines.map((l) =>
        l.group === a ? { ...l, group: b } : l.group === b ? { ...l, group: a } : l,
      );
      ops.push(`swap ${a} ${b}`);
      regrouped = true;
    } else if (op === "recode" && single.length > 0) {
      // As Apple saves an address: it groups one without a group, and changes
      // the X-ABADR of one whose country changed.
      const target = r.pick(single);
      const owner = target.owner ?? "";
      if (target.group === undefined) target.group = freeGroup();
      else target.value = `${target.value} neu`;
      lines = lines.filter((l) => !(l.name === "X-ABADR" && l.owner === owner));
      const code = { group: target.group, name: "X-ABADR", params: "", value: `z${k}`, owner };
      lines.splice(lines.indexOf(target) + 1, 0, code);
      codes.set(owner, code.value);
      ops.push(`recode ${owner}`);
    } else if (op === "text" && single.length > 0) {
      const target = r.pick(single);
      if (r.chance(0.7)) {
        target.value = target.value.replace(/;([^;]*);([^;]*);/, ";$1;$2 bis;");
      } else {
        const params = target.params === ";TYPE=WORK" ? ";TYPE=HOME" : ";TYPE=WORK";
        // Not onto another address's text, as read or since: they would be twins.
        const text = `${params}:${target.value}`;
        if ([...adrs, ...mineAdrs].some((l) => textOf(l) === text)) continue;
        target.params = params;
      }
      ops.push(`text ${target.owner}`);
    } else if (op === "add") {
      const owner = `t${k}`;
      const group = r.chance(0.8) ? freeGroup() : undefined;
      // A text of its own: one identical to the user's would be one of theirs.
      const value = `;;Cave ${k};Zaun;;0002;RT`;
      const added: Line[] = [{ group, name: "ADR", params: r.pick(ADR_PARAMS), value, owner }];
      if (group !== undefined) {
        codes.set(owner, `y${k}`);
        added.push({ group, name: "X-ABADR", params: "", value: `y${k}`, owner });
        if (r.chance(0.5)) added.push({ group, name: "X-ABLABEL", params: "", value: "Cave" });
      }
      lines.splice(r.int(lines.length + 1), 0, ...added);
      ops.push(`add ${owner}`);
    } else if (op === "remove" && single.length > 0) {
      const target = r.pick(single);
      lines = lines.filter((l) => l.owner !== target.owner);
      const rest = lines.filter((l) => l.group === target.group);
      if (rest.every((l) => l.name === "X-ABLABEL")) {
        lines = lines.filter((l) => target.group === undefined || l.group !== target.group);
      }
      ops.push(`remove ${target.owner}`);
    } else if (op === "label") {
      const grouped = adrs.filter((l) => l.group !== undefined);
      if (grouped.length === 0) continue;
      const { group } = r.pick(grouped);
      const label = lines.find((l) => l.name === "X-ABLABEL" && l.group === group);
      if (label === undefined) {
        lines.push({ group, name: "X-ABLABEL", params: "", value: "Nouveau" });
      } else if (r.chance(0.6)) {
        label.value = "Renamed";
      } else {
        lines = lines.filter((l) => l !== label);
      }
      ops.push(`label ${group}`);
    }
  }
  return { lines, codes, ops, regrouped };
}

/** The user's edit: actions applied one by one, each picked on the draft so far. */
function generateEdit(
  r: Rng,
  start: ContactDraft,
  phoneTypes: boolean,
): { draft: ContactDraft; actions: DraftAction[] } {
  let draft = start;
  const actions: DraftAction[] = [];
  const act = (action: DraftAction) => {
    actions.push(action);
    draft = draftReducer(draft, action);
  };
  const kinds: FieldKind[] = ["cell", "work", "home", ""];
  const count = r.chance(0.15) ? 0 : 1 + r.int(3);
  for (let k = 0; k < count; k++) {
    const index = draft.adr.length > 0 ? r.int(draft.adr.length) : -1;
    const adr = draft.adr[index];
    switch (r.pick(["part", "part", "remove", "add", "type", "label", "phone", "phone", "url"])) {
      case "part":
        if (adr === undefined) break;
        act({
          type: "SET_ADR_PART",
          index,
          part: r.pick(["street", "locality", "extended", "postalCode", "country"] as const),
          value: r.pick(["Rue Z", "Zaun", "", "Bât 9", "1000"]),
        });
        break;
      case "remove":
        if (adr !== undefined) act({ type: "REMOVE_ADR", index });
        break;
      case "add": {
        act({ type: "ADD_ADR" });
        const added = draft.adr.length - 1;
        if (r.chance(0.85)) {
          act({
            type: "SET_ADR_PART",
            index: added,
            part: "street",
            value: r.pick(["Rue N", "Rue A"]),
          });
        }
        if (r.chance(0.4)) {
          act({ type: "SET_ADR_TYPE", index: added, value: "custom" });
          act({ type: "SET_ADR_LABEL", index: added, value: r.pick(["Chalet", "Neuf"]) });
        }
        break;
      }
      case "type":
        if (adr === undefined) break;
        act({
          type: "SET_ADR_TYPE",
          index,
          value: r.pick([
            "home",
            "work",
            "",
            "custom",
            ...(adr.label === undefined ? [] : ["label" as const]),
          ]),
        });
        break;
      case "label":
        if (adr === undefined) break;
        if (adr.customLabel === undefined) act({ type: "SET_ADR_TYPE", index, value: "custom" });
        act({
          type: "SET_ADR_LABEL",
          index,
          value: r.pick(["Chalet", "Atelier", "", "Lac, nord"]),
        });
        break;
      case "phone": {
        if (!phoneTypes) break;
        const email = r.chance(0.5);
        const list = email ? draft.email : draft.tel;
        if (list.length === 0) break;
        const i = r.int(list.length);
        const value = r.pick(kinds);
        act(
          email
            ? { type: "SET_EMAIL_TYPE", index: i, value }
            : { type: "SET_TEL_TYPE", index: i, value },
        );
        break;
      }
      case "url":
        if (draft.url.length > 0) act({ type: "SET_URL_TYPE", value: r.pick(kinds) });
        break;
    }
  }
  return { draft, actions };
}

// ---------------------------------------------------------------------------
// Oracle
// ---------------------------------------------------------------------------

/** An address the save writes, with the line and X-ABADR it was read with (none for a new one). */
type Written = {
  owner: string;
  source?: Line;
  read?: string;
  adr: VCardAddressField;
  label: string | undefined;
};

type Check = {
  /** The lines of the card the save starts from: `mine`, or `theirs` for an overwrite. */
  baseLines: Line[];
  baseCodes: Map<string, string>;
  out: string;
  written: Written[];
  /** Groups whose label this save drops with a phone's, e-mail's or website's type (ADR 030). */
  dropped: Set<string>;
  /** Indices whose TYPE this save may rewrite, by property name. */
  retyped: Map<string, Set<number>>;
};

/**
 * The X-ABADR values an address may carry, `codes` being those of the card
 * saved onto. One found on it by its text carries the one it has there; one
 * in its group with the X-ABADR it was read with keeps it. Any other can't
 * be told from one removed and another added: it carries its own or none,
 * never another's.
 */
function allowedCodes(base: Line[], codes: Map<string, string>, address: Written): string[][] {
  const { source, owner, read } = address;
  if (source === undefined) return [[]];
  const own = codes.get(owner);
  const now = base.find((l) => l.name === "ADR" && l.owner === owner);
  const found =
    now !== undefined &&
    (textOf(now) === textOf(source) || (now.group === source.group && own === read));
  if (found) return [own === undefined ? [] : [own]];
  return own === undefined ? [[]] : [[], [own]];
}

function check({ baseLines, baseCodes, out, written, dropped, retyped }: Check): string[] {
  const problems: string[] = [];
  const outLines = linesOf(out);
  const outAdrs = outLines.filter((l) => l.name === "ADR");
  const outFields = parse(out).fields.adr;

  if (outAdrs.length !== written.length) {
    problems.push(`P0 writes ${outAdrs.length} addresses, expected ${written.length}`);
    return problems;
  }
  const withoutType = (params: string) => params.replace(/;TYPE=[^;:]*/gi, "");
  written.forEach((address, i) => {
    const { owner, adr, label, source } = address;
    const line = outAdrs[i] as Line;
    const field = outFields[i];
    const parts = (a: VCardAddressField | undefined) =>
      JSON.stringify([
        a?.poBox,
        a?.extended,
        a?.street,
        a?.locality,
        a?.region,
        a?.postalCode,
        a?.country,
        a?.extraParts,
        a?.type,
      ]);
    if (parts(field) !== parts(adr)) {
      problems.push(`P0 address ${i} (${owner}) reads ${parts(field)}, expected ${parts(adr)}`);
    }
    const params = withoutType(source?.params ?? "");
    if (withoutType(line.params) !== params) {
      problems.push(`P0 address ${i} (${owner}) has parameters ${line.params}, expected ${params}`);
    }
    // P2: the X-ABADR of its group is its own.
    const codes = JSON.stringify(
      outLines
        .filter((l) => l.name === "X-ABADR" && line.group !== undefined && l.group === line.group)
        .map((l) => l.value),
    );
    const allowed = allowedCodes(baseLines, baseCodes, address).map((c) => JSON.stringify(c));
    if (!allowed.includes(codes)) {
      problems.push(
        `P2 address ${i} (${owner}, ${line.group ?? "no group"}) carries X-ABADR ${codes}, expected ${allowed.join(" or ")}`,
      );
    }
    // P3: it shows the label it is saved with.
    const shown = field?.label;
    const saved = line.group !== undefined && dropped.has(line.group) ? undefined : label;
    if (shown !== saved) {
      problems.push(`P3 address ${i} (${owner}) shows label ${shown}, expected ${saved}`);
    }
  });

  // P4: what the UI doesn't edit stays.
  // Each property but the addresses, by name, with its group's label.
  const shown = (lines: Line[], name: string, dropping: boolean) =>
    lines
      .filter((l) => l.name === name)
      .map((l, j) => {
        const params = retyped.get(name)?.has(j)
          ? l.params.replace(/;TYPE=[^;:]*/gi, "")
          : l.params;
        const drops = dropping && l.group !== undefined && dropped.has(l.group);
        const label = drops ? undefined : labelOf(lines, l.group);
        return `${l.group ?? ""}.${name}${params}:${l.value} [${label ?? ""}]`;
      });
  const names = new Set(
    [...baseLines, ...outLines]
      .map((l) => l.name)
      .filter((name) => !HEADER.has(name) && !["ADR", "X-ABADR", "X-ABLABEL"].includes(name)),
  );
  for (const name of names) {
    const was = shown(baseLines, name, true);
    const now = shown(outLines, name, false);
    if (JSON.stringify(was) !== JSON.stringify(now)) {
      problems.push(`P4 ${name} lines ${JSON.stringify(now)}, expected ${JSON.stringify(was)}`);
    }
  }
  const abadr = (lines: Line[]) =>
    lines
      .filter((l) => l.name === "X-ABADR")
      .map((l) => l.value)
      .sort();
  if (JSON.stringify(abadr(outLines)) !== JSON.stringify(abadr(baseLines))) {
    problems.push(`P4 X-ABADR values ${abadr(outLines)}, expected ${abadr(baseLines)}`);
  }

  // P5: saving the output unchanged gives it back.
  const again = parse(out);
  const twice = serialise(applyDraft(again, buildDraft(again)));
  if (twice !== out) problems.push("P5 saving the output again changes it");
  return problems;
}

/** Groups whose label the save drops with a phone's, e-mail's or website's type. */
function droppedGroups(
  base: Contact,
  draft: ContactDraft,
  take: (f: "tel" | "email" | "url") => boolean,
) {
  const dropped = new Set<string>();
  const groupParam = (params: Record<string, string | string[]> | undefined) => {
    const group = params?.group ?? params?.GROUP;
    return typeof group === "string" ? group.toLowerCase() : undefined;
  };
  for (const [key, list] of [
    ["tel", draft.tel],
    ["email", draft.email],
  ] as const) {
    if (!take(key)) continue;
    for (const field of list) {
      const group = groupParam(field._orig.params);
      if (field._orig.label !== undefined && field.type !== "label" && group) dropped.add(group);
    }
  }
  const url = base.fields.urlField;
  if (take("url") && url?.label !== undefined && draft.urlType !== "label") {
    const group = groupParam(url.params);
    if (group) dropped.add(group);
  }
  return dropped;
}

function retypedOf(actions: DraftAction[], take: (f: "tel" | "email" | "url") => boolean) {
  const retyped = new Map<string, Set<number>>([
    ["TEL", new Set()],
    ["EMAIL", new Set()],
    ["URL", new Set()],
  ]);
  for (const action of actions) {
    if (action.type === "SET_TEL_TYPE" && take("tel")) retyped.get("TEL")?.add(action.index);
    if (action.type === "SET_EMAIL_TYPE" && take("email")) retyped.get("EMAIL")?.add(action.index);
    if (action.type === "SET_URL_TYPE" && take("url")) retyped.get("URL")?.add(0);
  }
  return retyped;
}

// ---------------------------------------------------------------------------
// Cases
// ---------------------------------------------------------------------------

function runCase(seed: number): string[] {
  const r = rngOf(seed);
  const mine = generateMine(r);
  const mineText = render(mine.lines);
  const theirs = generateTheirs(r, mine);
  const theirsText = render(theirs.lines);
  const problems: string[] = [];

  // P1: an unedited save gives the card back.
  const unedited = parse(mineText);
  if (serialise(applyDraft(unedited, buildDraft(unedited))) !== mineText) {
    problems.push("P1 an unedited save changes the card");
  }

  const start = buildDraft(parse(mineText));
  // A phone's label drop targets the group it was read in: an overwrite onto
  // a card regrouped elsewhere is left out.
  const { draft, actions } = generateEdit(r, start, !theirs.regrouped);
  const mineAdrs = mine.lines.filter((l) => l.name === "ADR");
  const report = (mode: string, list: string[], out: string) => {
    for (const p of list) problems.push(`${mode}: ${p}\n--- output\n${out}`);
  };
  const save = (mode: string, base: Generated, dirty?: DirtyFields) => {
    const contact = parse(render(base.lines));
    const take = (f: "tel" | "email" | "url") => dirty === undefined || dirty[f];
    const baseAdrs = base.lines.filter((l) => l.name === "ADR");
    const written: Written[] =
      dirty === undefined || dirty.adr
        ? draft.adr.filter(writesAddress).map((adr) => {
            const source = mineAdrs[start.adr.findIndex((a) => a.id === adr.id)];
            const owner = source?.owner ?? "new";
            const read = mine.codes.get(owner);
            return { owner, source, read, adr, label: savedLabelOf(adr) };
          })
        : contact.fields.adr.map((adr, i) => {
            const source = baseAdrs[i];
            const owner = source?.owner ?? "?";
            return { owner, source, read: base.codes.get(owner), adr, label: adr.label };
          });
    const dropped = droppedGroups(contact, draft, take);
    const out = serialise(applyDraft(contact, draft, dirty));
    const retyped = retypedOf(actions, take);
    report(
      mode,
      check({ baseLines: base.lines, baseCodes: base.codes, out, written, dropped, retyped }),
      out,
    );
  };
  save("save", mine);
  save("overwrite", theirs, dirtyDiff(parse(mineText), draft));
  return problems.map(
    (p) =>
      `seed ${seed} — ${p}\n--- mine\n${mineText}--- theirs (${theirs.ops.join(", ") || "unchanged"})\n${theirsText}--- actions\n${JSON.stringify(actions)}`,
  );
}

describe("addresses on a save and an overwrite, randomized", () => {
  it(`hold their identity, labels and the rest of the card over ${SEEDS.length} seeds`, () => {
    const failures = SEEDS.flatMap(runCase);
    const kinds = new Map<string, number>();
    for (const f of failures) {
      const kind = /— (\w+: P\d)/.exec(f)?.[1] ?? "?";
      kinds.set(kind, (kinds.get(kind) ?? 0) + 1);
    }
    const summary = [JSON.stringify([...kinds]), ...failures.slice(0, 3)].join("\n\n");
    expect(failures.length, summary).toBe(0);
  }, 30_000);
});
