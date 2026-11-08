import { execFileSync } from "node:child_process";
import { cpus, platform, release } from "node:os";
import { type BrowserContext, expect, test } from "@playwright/test";
import { APP_URL, DAV_URL, PASSWORD, SAMPLES, SIZES, USER } from "./env";

const HOME = `/${USER}/`;
const EMPTY_BOOK = `empty-${process.pid}`;
// As many rows as fit in the list pane at 1280 × 720.
const FIRST_ROWS = 10;

async function dav(method: string, path: string, body?: string): Promise<void> {
  const response = await fetch(`${DAV_URL}${path}`, {
    method,
    headers: {
      Authorization: `Basic ${btoa(`${USER}:${PASSWORD}`)}`,
      "Content-Type": method === "PUT" ? "text/vcard; charset=utf-8" : "application/xml",
      ...(method === "PUT" ? { "If-None-Match": "*" } : { Depth: "0" }),
    },
    body,
  });
  await response.text();
  expect(response.ok, `${method} ${path}: HTTP ${response.status}`).toBe(true);
}

async function createBook(path: string, name: string): Promise<void> {
  await dav(
    "MKCOL",
    path,
    `<mkcol xmlns="DAV:" xmlns:C="urn:ietf:params:xml:ns:carddav"><set><prop>
      <resourcetype><collection/><C:addressbook/></resourcetype>
      <displayname>${name}</displayname>
    </prop></set></mkcol>`,
  );
}

function revision(): string | null {
  try {
    return execFileSync("git", ["describe", "--always", "--dirty"], { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

async function seedRadicaleBook(book: string, contacts: number): Promise<void> {
  const cards = Array.from({ length: contacts }, (_, index) => {
    const id = String(index).padStart(5, "0");
    const letter = String.fromCharCode(65 + (index % 26));
    return `${[
      "BEGIN:VCARD",
      "VERSION:3.0",
      `UID:contact-${id}`,
      `FN:${letter}lex Example ${id}`,
      `N:Example ${id};${letter}lex;;;`,
      `ORG:Example company ${index % 20}`,
      `EMAIL;TYPE=WORK:contact-${id}@example.test`,
      `TEL;TYPE=CELL:+4179${String(index).padStart(7, "0")}`,
      "ADR;TYPE=WORK:;;1 Example street;Lausanne;;1000;Switzerland",
      "NOTE:Synthetic contact for the address book opening benchmark.",
      "END:VCARD",
    ].join("\r\n")}\r\n`;
  });
  const path = `${HOME}${book}/`;
  // Radicale's collection import keeps fixture setup outside the timed path.
  await dav("PUT", path, cards.join(""));
  await dav(
    "PROPPATCH",
    path,
    `<propertyupdate xmlns="DAV:"><set><prop>
    <displayname>${book}</displayname>
  </prop></set></propertyupdate>`,
  );
}

async function measure(context: BrowserContext, book: string, contacts: number): Promise<number> {
  const page = await context.newPage();
  await page.goto(`/contacts/${EMPTY_BOOK}`);
  await expect(page.locator('#list p[aria-live="polite"]')).toHaveText("0 contacts");
  await page.getByRole("button", { name: "Address book: Empty" }).click();
  const choice = page.getByRole("menuitemradio", { name: book, exact: true });
  await choice.evaluate(
    (button, { book, contacts, FIRST_ROWS }) => {
      const list = document.getElementById("list");
      if (!list) throw new Error("Missing contact list");
      button.addEventListener(
        "click",
        () => {
          const start = performance.now();
          const observer = new MutationObserver(() => {
            const counter = list.querySelector('p[aria-live="polite"]');
            if (counter?.textContent?.trim() !== `${contacts} contacts`) return;
            const rows = list.querySelectorAll(`a[href^="/contacts/${book}/"]`);
            const first = rows[0]?.getBoundingClientRect();
            // The first rows of the viewport, whether or not the others are mounted.
            if (!first || first.height === 0 || rows.length < Math.min(contacts, FIRST_ROWS))
              return;
            observer.disconnect();
            // Allow a paint opportunity for the rows.
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                performance.measure("book-open", { start, end: performance.now() });
              });
            });
          });
          observer.observe(list, { childList: true, subtree: true, characterData: true });
        },
        { once: true, capture: true },
      );
    },
    { book, contacts, FIRST_ROWS },
  );
  await choice.click();
  await page.waitForFunction(
    () => performance.getEntriesByName("book-open").length === 1,
    undefined,
    { timeout: 120_000 },
  );
  const duration = await page.evaluate(() => {
    const entry = performance.getEntriesByName("book-open")[0];
    if (!entry) throw new Error("Missing book opening measurement");
    return entry.duration;
  });
  await expect(page.locator('#list p[aria-live="polite"]')).toHaveText(`${contacts} contacts`);
  return duration;
}

test.beforeAll(async () => {
  await dav("PROPFIND", HOME);
  await createBook(`${HOME}${EMPTY_BOOK}/`, "Empty");
});

for (const contacts of SIZES) {
  test(`opens a book with ${contacts} contacts`, async ({ browser, request }, testInfo) => {
    // A repeat or retry on the same server needs its own collection.
    const book = `performance-${contacts}-${testInfo.repeatEachIndex}-${testInfo.retry}`;
    const samplesMs: number[] = [];
    let completed = false;
    let failure: string | undefined;
    try {
      await test.step(`seed ${contacts} contacts`, () => seedRadicaleBook(book, contacts));
      const response = await request.post(`${APP_URL}/session`, {
        headers: { Origin: APP_URL },
        data: { username: USER, password: PASSWORD },
      });
      expect(response.status()).toBe(200);
      const storageState = await request.storageState();
      // Each opening gets an empty browser cache and TanStack Query cache.
      for (let sample = 0; sample <= SAMPLES; sample++) {
        const context = await browser.newContext({
          storageState,
          baseURL: APP_URL,
          locale: "en-US",
          viewport: { width: 1280, height: 720 },
        });
        try {
          const label = sample === 0 ? "warm-up" : `sample ${sample}`;
          const ms = await test.step(label, () => measure(context, book, contacts), {
            timeout: 120_000,
          });
          console.log(`${contacts} contacts, ${label}: ${ms.toFixed(0)} ms`);
          if (sample > 0) samplesMs.push(ms);
        } finally {
          await context.close();
        }
      }
      completed = true;
    } catch (error) {
      failure = error instanceof Error ? error.message : String(error);
      throw error;
    } finally {
      // Openings that finished before a timeout are the fast ones, so they get no statistics.
      const sorted = completed ? [...samplesMs].sort((a, b) => a - b) : [];
      const lower = sorted[Math.floor((sorted.length - 1) / 2)];
      const upper = sorted[Math.floor(sorted.length / 2)];
      const medianMs = lower === undefined || upper === undefined ? null : (lower + upper) / 2;
      if (medianMs !== null) {
        console.log(`${contacts} contacts: median ${medianMs.toFixed(0)} ms`);
      }
      await testInfo.attach(`book-opening-${contacts}.json`, {
        contentType: "application/json",
        body: JSON.stringify(
          {
            measuredAt: new Date().toISOString(),
            revision: revision(),
            browser: browser.version(),
            platform: `${platform()} ${release()}`,
            cpu: cpus()[0]?.model,
            node: process.version,
            viewport: { width: 1280, height: 720 },
            server: "Radicale (local loopback)",
            contacts,
            warmupsPerSize: 1,
            samplesPerSize: SAMPLES,
            status: completed ? "complete" : "incomplete",
            failure,
            samplesMs,
            medianMs,
            minMs: sorted[0] ?? null,
            maxMs: sorted.at(-1) ?? null,
          },
          null,
          2,
        ),
      });
    }
  });
}
