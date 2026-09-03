/**
 * Spike script: connect to a CardDAV server, dump all vCards from the first
 * address book, and check whether parse+reserialise is lossless.
 *
 * Environment variables (all required for a live run):
 *   DAV_URL      - CardDAV server URL (e.g. https://contacts.example.com)
 *   DAV_USERNAME - Basic auth username
 *   DAV_PASSWORD - Basic auth password
 *
 * Usage: tsx scripts/spike.ts
 *
 * If no env vars are set, the script prints a skip message and exits 0 so that
 * `pnpm check` is unaffected.
 */

// triple-slash reference needed because the main tsconfig types are for
// browser + vitest; this script runs in Node via tsx.
/// <reference types="node" />

import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import ICAL from "ical.js";
import { createDAVClient } from "tsdav";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** Compute a simple line-by-line diff between two strings. */
function lineDiff(original: string, serialised: string): { lines: string[]; changed: boolean } {
  const origLines = original.split("\n");
  const serLines = serialised.split("\n");
  const maxLen = Math.max(origLines.length, serLines.length);
  const lines: string[] = [];
  let changed = false;

  for (let i = 0; i < maxLen; i++) {
    const o = origLines[i] ?? "";
    const s = serLines[i] ?? "";
    if (o !== s) {
      changed = true;
      if (o && s) {
        lines.push(`- ${o}`);
        lines.push(`+ ${s}`);
      } else if (o) {
        lines.push(`- ${o}`);
      } else {
        lines.push(`+ ${s}`);
      }
    }
  }
  return { lines, changed };
}

/** Summarise the kinds of differences observed. */
function diffKindSummary(orig: string, ser: string): string[] {
  const kinds: string[] = [];
  if (orig.replace(/\r\n?/g, "\n") !== ser.replace(/\r\n?/g, "\n")) {
    if (orig.replace(/[\r\n]/g, "") === ser.replace(/[\r\n]/g, "")) {
      kinds.push("line-ending differences only");
    } else {
      kinds.push("content differences");
    }
  }
  return kinds;
}

/** Safely extract a filename from a URL path. */
function urlToFilename(url: string): string {
  const path = new URL(url).pathname;
  const base = path.split("/").filter(Boolean).pop() ?? "unknown.vcf";
  // ensure .vcf extension
  return base.endsWith(".vcf") ? base : `${base}.vcf`;
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main() {
  const davUrl = process.env.DAV_URL;
  const username = process.env.DAV_USERNAME;
  const password = process.env.DAV_PASSWORD;

  if (!davUrl || !username || !password) {
    console.log("SKIP: set DAV_URL, DAV_USERNAME, and DAV_PASSWORD for a live run.");
    return;
  }

  const outDir = resolve(import.meta.dirname, "..", "fixtures", "private");
  await mkdir(outDir, { recursive: true });

  console.log(`Connecting to ${davUrl} ...`);

  const client = await createDAVClient({
    serverUrl: davUrl,
    credentials: { username, password },
    authMethod: "Basic",
    defaultAccountType: "carddav",
  });

  console.log("Fetching address books ...");
  const books = await client.fetchAddressBooks();
  const firstBook = books[0];
  if (!firstBook) {
    console.log("No address books found. Exiting.");
    return;
  }
  const book = firstBook;
  const bookUrl = book.url;
  const displayName = (book.displayName as string | undefined) ?? bookUrl;
  console.log(`Using address book: ${displayName}`);

  console.log("Fetching vCards ...");
  const vcards = await client.fetchVCards({ addressBook: book });
  console.log(`  found ${vcards.length} card(s)`);

  let identical = 0;
  let different = 0;
  let skipped = 0;
  const diffKinds = new Set<string>();

  for (const vcard of vcards) {
    const raw = vcard.data as string | undefined;
    const etag = vcard.etag as string | undefined;
    const url = vcard.url;
    const filename = urlToFilename(url);

    if (!raw) {
      skipped++;
      console.warn(`  WARN: ${filename} has no data, skipping`);
      continue;
    }

    // write raw vCard to fixtures/private/
    await writeFile(resolve(outDir, filename), raw, "utf-8");
    console.log(`  wrote ${filename}  (etag: ${etag ?? "none"})`);

    // parse & reserialise
    const parsed = ICAL.parse(raw);
    const component = new ICAL.Component(parsed);
    const reserialised = component.toString();

    if (raw === reserialised) {
      identical++;
    } else {
      different++;
      const { lines, changed } = lineDiff(raw, reserialised);
      if (changed) {
        console.log(`  diff for ${filename}:`);
        for (const line of lines) {
          console.log(`    ${line}`);
        }
      }
      for (const kind of diffKindSummary(raw, reserialised)) {
        diffKinds.add(kind);
      }
    }
  }

  // summary
  console.log("\n--- summary ---");
  console.log(`  total cards:     ${vcards.length}`);
  console.log(`  written:         ${vcards.length - skipped}`);
  console.log(`  identical:       ${identical}`);
  console.log(`  different:       ${different}`);
  if (skipped > 0) {
    console.log(`  skipped (no data): ${skipped}`);
  }
  if (diffKinds.size > 0) {
    console.log("  difference types:");
    for (const kind of diffKinds) {
      console.log(`    - ${kind}`);
    }
  } else {
    console.log("  difference types: none");
  }
}

main().catch((err: unknown) => {
  console.error("FATAL:", err);
  process.exitCode = 1;
});
