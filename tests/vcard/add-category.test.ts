/**
 * addCategory (ADR 052): a membership written as CATEGORIES changes that
 * property only, and every other line of the card round-trips unchanged.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { addCategory, groupsOf, parse, serialiseRaw } from "@/vcard";

const card = (lines: string[]) => parse(["BEGIN:VCARD", ...lines, "END:VCARD", ""].join("\r\n"));

const unfolded = (text: string) => text.replace(/\r\n[ \t]/g, "").split("\r\n");
const isCategories = (line: string) => /^([a-z0-9-]+\.)?categories[;:]/i.test(line);
/** The lines with the first CATEGORIES cut to its name and parameters, and its index. */
const withoutFirstValue = (lines: string[]) => {
  const index = lines.findIndex(isCategories);
  return {
    index,
    lines: lines.map((line, i) => (i === index ? line.slice(0, line.indexOf(":")) : line)),
  };
};

describe("addCategory", () => {
  it("joins the first CATEGORIES, keeping its parameters and group prefix", () => {
    const c = card([
      "VERSION:3.0",
      "UID:c",
      "item1.CATEGORIES;X-P=1:Travail",
      "CATEGORIES:Famille",
    ]);
    expect(addCategory(c, "Club")).toBe(true);
    const text = serialiseRaw(c);
    expect(text).toMatch(/item1\.CATEGORIES;X-P=1:Travail,Club\r\n/i);
    expect(text).toContain("CATEGORIES:Famille\r\n");
  });

  it("adds a CATEGORIES property to a card without one", () => {
    const c = card(["VERSION:4.0", "UID:c", "FN:Ada"]);
    expect(addCategory(c, "Club")).toBe(true);
    expect(serialiseRaw(c)).toContain("CATEGORIES:Club\r\n");
  });

  it("replaces a first CATEGORIES holding only a blank value", () => {
    const c = card(["VERSION:3.0", "UID:c", "CATEGORIES: "]);
    expect(addCategory(c, "Club")).toBe(true);
    expect(serialiseRaw(c)).toContain("CATEGORIES:Club\r\n");
  });

  it("changes nothing for a name a value already holds, spaces aside", () => {
    const c = card(["VERSION:3.0", "UID:c", "CATEGORIES:Travail, Club "]);
    const before = serialiseRaw(c);
    expect(addCategory(c, "Club")).toBe(false);
    expect(serialiseRaw(c)).toBe(before);
  });

  it("escapes a comma in both versions, and a semicolon in 3.0", () => {
    for (const version of ["3.0", "4.0"]) {
      const c = card([`VERSION:${version}`, "UID:c", "CATEGORIES:Travail"]);
      addCategory(c, "Amis, proches");
      addCategory(c, "a;b");
      const text = serialiseRaw(c);
      expect(text).toContain(
        version === "3.0"
          ? "CATEGORIES:Travail,Amis\\, proches,a\\;b"
          : "CATEGORIES:Travail,Amis\\, proches,a;b",
      );
      expect(groupsOf(parse(text))).toEqual(["Travail", "Amis, proches", "a;b"]);
    }
  });
});

const fixtureDirs = [resolve(import.meta.dirname, "../fixtures/public")];
const privateDir = resolve(import.meta.dirname, "../fixtures/private");
if (existsSync(privateDir)) fixtureDirs.push(privateDir);
const fixtures = fixtureDirs.flatMap((dir) =>
  readdirSync(dir)
    .filter((name) => name.endsWith(".vcf"))
    .map((name) => resolve(dir, name)),
);

describe("addCategory round-trip", () => {
  it.each(fixtures)("changes only CATEGORIES in %s", (path) => {
    const original = readFileSync(path, "utf-8");
    const before = unfolded(serialiseRaw(parse(original)));
    const contact = parse(original);
    const groups = groupsOf(contact);
    expect(addCategory(contact, "Natel, test")).toBe(true);
    const after = unfolded(serialiseRaw(contact));

    // Only the first CATEGORIES value changes, or a CATEGORIES line is added.
    const was = withoutFirstValue(before);
    const now = withoutFirstValue(after);
    if (was.index >= 0) {
      expect(now.lines).toEqual(was.lines);
    } else {
      expect(now.lines[now.index]).toBe("CATEGORIES");
      expect(now.lines.filter((_, i) => i !== now.index)).toEqual(before);
    }
    expect(groupsOf(parse(after.join("\r\n")))).toEqual([...groups, "Natel, test"]);
  });
});
