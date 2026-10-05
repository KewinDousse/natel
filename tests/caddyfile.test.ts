/**
 * The Caddyfile's file servers, read as text: the image's root holds only
 * the build, so the e2e suite never meets a hidden file to check this on.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";

const caddyfile = readFileSync(resolve(import.meta.dirname, "../Caddyfile"), "utf8");

const blocks = caddyfile.split(/^\s*(?:handle(?:_path|_errors)?|route)\b/m).slice(1);

// A .env or a .git/ left in NATEL_ROOT outside the image is never served:
// every block that serves files answers a 404 or the app instead.
it("serves no dot path from any block that serves files", () => {
  const serving = blocks.filter((block) => /^\s*file_server\b/m.test(block));
  expect(serving.length).toBeGreaterThan(0);
  for (const block of serving) {
    expect(block).toMatch(/^\s*@hidden path \*\/\.\*$/m);
    expect(block).toMatch(/^\s*(error @hidden 404|rewrite @hidden \/index\.html)$/m);
  }
});

// Its 404 then looks like a missing file's, without the year-long cache.
it("keeps dot paths out of the immutable cache header", () => {
  const cached = blocks.filter((block) => /^\s*header @exists Cache-Control/m.test(block));
  expect(cached.length).toBeGreaterThan(0);
  for (const block of cached) {
    expect(block).toMatch(/@exists \{[^}]*^\s*not path \*\/\.\*$[^}]*\}/m);
  }
});
