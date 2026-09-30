/**
 * WCAG 2.2 AA contrast of the colour tokens in src/index.css, light and dark,
 * read from the hex each token carries in its comment. Text needs 4.5:1;
 * large text (A–Z letters) and non-text UI (field borders, focus ring) 3:1.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(import.meta.dirname, "../../src/index.css"), "utf8");

function tokens(block: string): Record<string, string> {
  const found: Record<string, string> = {};
  for (const [, name, hex] of block.matchAll(/--([\w-]+):[^;]*;\s*\/\*\s*(#[0-9A-Fa-f]{6})/g)) {
    if (name && hex) found[name] = hex;
  }
  return found;
}

const light = tokens(/^:root \{([\s\S]*?)^\}/m.exec(css)?.[1] ?? "");
const darkOnly = tokens(
  /@media \(prefers-color-scheme: dark\) \{([\s\S]*?)^\}/m.exec(css)?.[1] ?? "",
);
const dark = { ...light, ...darkOnly };

it("finds both palettes", () => {
  expect(Object.keys(light).length).toBeGreaterThan(20);
  // Every colour the light palette has is redefined in dark.
  expect(Object.keys(darkOnly).sort()).toEqual(Object.keys(light).sort());
});

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16) / 255);
  const [r = 0, g = 0, b = 0] = channels.map((c) =>
    c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((high ?? 0) + 0.05) / ((low ?? 0) + 0.05);
}

const PAIRS: [string, string, number][] = [
  ["foreground", "background", 4.5],
  ["foreground", "muted", 4.5],
  ["foreground", "card", 4.5],
  ["muted-foreground", "background", 4.5],
  ["muted-foreground", "muted", 4.5],
  ["muted-foreground", "card", 4.5],
  ["primary-foreground", "primary", 4.5],
  ["brand", "background", 3],
  ["brand", "muted", 3],
  ["brand-surface-foreground", "brand-surface", 4.5],
  ["destructive", "background", 4.5],
  ["destructive", "muted", 4.5],
  ["destructive-foreground", "destructive", 4.5],
  ["success", "background", 4.5],
  ["warning", "background", 4.5],
  ["warning", "muted", 4.5],
  ["highlight-foreground", "highlight", 4.5],
  ["selection-foreground", "selection", 4.5],
  ["muted-foreground", "selection", 4.5],
  ["avatar-foreground", "avatar", 4.5],
  ["input", "background", 3],
  ["input", "muted", 3],
  ["input", "card", 3],
  ["ring", "background", 3],
  ["ring", "muted", 3],
  // The book switcher's menu.
  ["foreground", "popover", 4.5],
  ["muted-foreground", "popover", 4.5],
  ["success", "popover", 4.5],
];

describe.each([
  ["light", light],
  ["dark", dark],
])("%s tokens", (_mode, palette) => {
  it.each(PAIRS)("%s on %s reaches %s:1", (fore, back, minimum) => {
    const a = palette[fore];
    const b = palette[back];
    expect(a, fore).toBeDefined();
    expect(b, back).toBeDefined();
    expect(contrast(a ?? "", b ?? "")).toBeGreaterThanOrEqual(minimum);
  });
});
