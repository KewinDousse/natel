/**
 * Round-trip tests for vCard parse/serialise.
 *
 * For every .vcf file under fixtures/public/ and fixtures/private/ (if it
 * exists), asserts that serialise(parse(x)) is semantically equal to x.
 *
 * Semantic equality = same multiset of properties (name, group, parameters,
 * value), order ignored.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import ICAL from "ical.js";
import { describe, expect, it } from "vitest";
import { parse, serialise } from "../../src/vcard";

// ---------------------------------------------------------------------------
// Normalisation helpers
// ---------------------------------------------------------------------------

/** Normalise CRLF / lone CR to LF. */
function normaliseCRLF(s: string): string {
  return s.replace(/\r\n?/g, "\n");
}

/** Unfold a vCard string per RFC 6350 §3.2 — handles both CRLF and LF. */
function unfold(s: string): string {
  return s.replace(/\r?\n[ \t]/g, "");
}

/**
 * Normalise both CRLF and folding so we can compare for byte-equality.
 * Returns a string that should be byte-identical if the only differences
 * are line-ending and folding style.
 *
 * Also pads N structured values to 5 components so that single-component
 * forms like `N:Doe` compare equal to `N:Doe;;;;`.
 */
function normalise(s: string): string {
  let result = normaliseCRLF(unfold(s));
  // Pad N values to exactly 5 components
  result = result.replace(/^N:.*$/gm, (line) => {
    const parts = line.slice(2).split(";");
    while (parts.length < 5) parts.push("");
    return `N:${parts.join(";")}`;
  });
  return result;
}

// ---------------------------------------------------------------------------
// Semantic equality
// ---------------------------------------------------------------------------

/** jCal representation of a single vCard property: [name, params, type, value]. */
type JCalProperty = [string, Record<string, string | string[]>, string, unknown];

/**
 * Extract properties from vCard text as a canonical sorted set of tuples.
 * Each tuple is (name, group, type, params-sorted, value-stringified) so
 * that deep-equality comparison is straightforward.
 */
function getCanonicalProps(text: string): string[] {
  const jCal = ICAL.parse(text);
  const comp = new ICAL.Component(jCal);
  const props = comp.getAllProperties();

  const items: string[] = props.map((p) => {
    const j = p.toJSON() as JCalProperty;
    const name = j[0].toLowerCase();
    const params = j[1] ?? {};
    const type = j[2] ?? "";
    const rawValue = p.getFirstValue();

    // Extract group from params
    const group = (params.group as string | undefined) ?? "";

    // Sort params keys (excluding 'group' which we already extracted)
    const sortedParams: Record<string, string | string[]> = {};
    for (const key of Object.keys(params).sort()) {
      if (key !== "group") {
        sortedParams[key] = params[key] as string | string[];
      }
    }

    // Canonical value string — for structured properties (e.g. N), pad
    // to design length so that single-component forms like N:Doe compare
    // equal to their 5-component serialised form N:Doe;;;;.
    let valueStr: string;
    const structuredNames = new Set(["n"]);
    if (structuredNames.has(name) && !Array.isArray(rawValue)) {
      const parts = [String(rawValue ?? ""), "", "", "", ""];
      valueStr = JSON.stringify(parts);
    } else if (
      rawValue !== null &&
      typeof rawValue === "object" &&
      "value" in (rawValue as unknown as Record<string, unknown>)
    ) {
      valueStr = String((rawValue as unknown as { value: string }).value);
    } else if (Array.isArray(rawValue)) {
      valueStr = JSON.stringify(rawValue);
    } else {
      valueStr = String(rawValue ?? "");
    }

    return JSON.stringify({ name, group, type, params: sortedParams, value: valueStr });
  });

  return items.sort();
}

/**
 * Assert that two vCard texts are semantically equal — same properties,
 * same parameters, same values — ignoring property order and format
 * differences (folding, line endings).
 */
function assertSemanticallyEqual(original: string, serialised: string) {
  const origProps = getCanonicalProps(original);
  const serProps = getCanonicalProps(serialised);

  if (origProps.length !== serProps.length) {
    // Detailed comparison for error reporting
    const origSet = new Set(origProps);
    const serSet = new Set(serProps);
    const missing = origProps.filter((p) => !serSet.has(p));
    const extra = serProps.filter((p) => !origSet.has(p));
    console.error("Missing from serialised:", missing);
    console.error("Extra in serialised:", extra);
  }

  expect(serProps).toEqual(origProps);
}

/**
 * Check whether the property order in the serialised vCard matches the
 * original. If it does, byte-equality can be enforced (after normalising
 * CRLF, folding, and structured-value padding).
 *
 * BEGIN, VERSION, and END are excluded because their position in the jCal
 * array is not guaranteed to match the text order.
 */
function propertyOrderPreserved(original: string, serialised: string): boolean {
  const origComp = new ICAL.Component(ICAL.parse(original));
  const serComp = new ICAL.Component(ICAL.parse(serialised));

  const skipNames = new Set(["begin", "version", "end"]);
  const origNames = origComp
    .getAllProperties()
    .map((p) => p.name.toLowerCase())
    .filter((n) => !skipNames.has(n));
  const serNames = serComp
    .getAllProperties()
    .map((p) => p.name.toLowerCase())
    .filter((n) => !skipNames.has(n));

  return JSON.stringify(origNames) === JSON.stringify(serNames);
}

// ---------------------------------------------------------------------------
// Fixture collection
// ---------------------------------------------------------------------------

const fixtureDirs = [resolve(import.meta.dirname, "../../fixtures/public")];

// Include private dir only if it exists
const privateDir = resolve(import.meta.dirname, "../../fixtures/private");
if (existsSync(privateDir)) {
  fixtureDirs.push(privateDir);
}

function collectVcfFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".vcf"))
    .map((f) => resolve(dir, f));
}

const fixtures = fixtureDirs.flatMap((dir) => collectVcfFiles(dir));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("vCard round-trip", () => {
  it.each(fixtures)("semantic equality for %s", (filePath) => {
    const original = readFileSync(filePath, "utf-8");

    // Parse + serialise
    const contact = parse(original);
    const serialised = serialise(contact);

    // 1) Must be parseable
    expect(() => ICAL.parse(serialised)).not.toThrow();

    // 2) Semantic equality — must ALWAYS hold
    assertSemanticallyEqual(original, serialised);

    // 3) Byte-equality when possible — enforced for fixtures whose property
    //    order is preserved (no TEL/EMAIL reordering).  Property-order
    //    differences are a benign side-effect of removeAllProperties +
    //    addProperty in serialise(); when order is unchanged, any remaining
    //    byte difference signals a regression.
    const orderSame = propertyOrderPreserved(original, serialised);
    if (orderSame) {
      const origNorm = normalise(original);
      const serNorm = normalise(serialised);
      expect(origNorm).toBe(serNorm);
    } else {
      console.log(`  [info] not byte-equal for ${filePath} (property order changed)`);
    }
  });

  // Additional sanity: parse preserves the raw component
  it("parse sets raw that serialises without loss", () => {
    const vcard = fixtures[0];
    if (!vcard) {
      // No fixtures — skip
      return;
    }
    const original = readFileSync(vcard, "utf-8");
    const contact = parse(original);
    // The raw component should serialise to a valid vCard
    const rawStr = contact.raw.toString();
    expect(() => ICAL.parse(rawStr)).not.toThrow();
  });
});

// Ensure there is at least one test even when no fixtures exist
if (fixtures.length === 0) {
  describe("vCard round-trip", () => {
    it("no fixtures found — skipping", () => {
      expect(true).toBe(true);
    });
  });
}
