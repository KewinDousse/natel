/**
 * Tests for the demo build's in-memory CardDAV stand-in (ADR 025).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as demo from "@/dav/demo";
import type * as Real from "@/dav/index";
import { DavError } from "@/dav/types";
import { groupCardOf, isGroupCard, parse } from "@/vcard";

// The demo must offer everything the real module does, with the same types.
const api: typeof Real = demo;
void api;

const AUTH = { username: "anyone" };

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  demo.resetDemoBooks();
});

describe("the demo books", () => {
  it("lists two books whose cards all parse, groups included", async () => {
    const books = await demo.discoverAddressBooks(AUTH);
    expect(books.map((book) => book.displayName)).toEqual(["Runeterra", "Expédition 33"]);
    for (const book of books) {
      const summaries = await demo.listContacts(AUTH, book.href);
      const cards = await demo.fetchCards(
        AUTH,
        summaries.map((summary) => summary.href),
      );
      expect(cards).toHaveLength(summaries.length);
      const contacts = cards.map((card) => parse(card.vcardText, card.href, card.etag));
      const uids = new Set(contacts.map((contact) => contact.uid));
      for (const contact of contacts) {
        if (!isGroupCard(contact)) {
          expect(contact.fields.fn.length).toBeGreaterThan(0);
          continue;
        }
        // Every member is a card of the same book, so no group shows empty.
        const { members } = groupCardOf(contact);
        expect(members.length).toBeGreaterThan(0);
        for (const member of members) expect(uids).toContain(member);
      }
    }
  });

  it("takes a write with the current ETag, and refuses a stale one", async () => {
    const [book] = await demo.discoverAddressBooks(AUTH);
    const [first] = await demo.listContacts(AUTH, book?.href ?? "");
    if (!first) throw new Error("no card");
    const card = await demo.fetchCard(AUTH, first.href);
    const edited = card.vcardText.replace("END:VCARD", "NOTE:edited\r\nEND:VCARD");

    const { etag } = await demo.updateCard(AUTH, card.href, card.etag, edited);
    expect(etag).not.toBe(card.etag);
    expect((await demo.fetchCard(AUTH, card.href)).vcardText).toContain("NOTE:edited");

    await expect(demo.updateCard(AUTH, card.href, card.etag, edited)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    await expect(demo.deleteCard(AUTH, card.href, card.etag)).rejects.toBeInstanceOf(DavError);
    await demo.deleteCard(AUTH, card.href, etag);
    await expect(demo.fetchCard(AUTH, card.href)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("creates a card once, and refuses a second at the same href", async () => {
    const [book] = await demo.discoverAddressBooks(AUTH);
    const href = demo.cardHref(book?.href ?? "", "new-one");
    const text = "BEGIN:VCARD\r\nVERSION:3.0\r\nUID:new-one\r\nFN:Nouveau\r\nEND:VCARD\r\n";
    await demo.createCard(AUTH, href, text);
    expect((await demo.listContacts(AUTH, book?.href ?? "")).map((s) => s.href)).toContain(href);
    await expect(demo.createCard(AUTH, href, text)).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("keeps the edits when signing out and in, and goes back to the seed on reset", async () => {
    const [book] = await demo.discoverAddressBooks(AUTH);
    const href = demo.cardHref(book?.href ?? "", "kept");
    await demo.createCard(
      AUTH,
      href,
      "BEGIN:VCARD\r\nVERSION:3.0\r\nUID:kept\r\nFN:K\r\nEND:VCARD\r\n",
    );
    demo.clearCachedDavSessions();
    expect((await demo.listContacts(AUTH, book?.href ?? "")).map((s) => s.href)).toContain(href);
    demo.resetDemoBooks();
    expect((await demo.listContacts(AUTH, book?.href ?? "")).map((s) => s.href)).not.toContain(
      href,
    );
  });
});
