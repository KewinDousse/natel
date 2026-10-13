/**
 * loadFullBook with the real vCard helpers: group cards land in `groups`,
 * out of `contacts` (ADR 022).
 */
import { describe, expect, it, vi } from "vitest";
import { loadFullBook } from "@/queries";

vi.mock("@/dav", () => ({
  listContacts: async () => [
    { href: "/b/ada.vcf", etag: "1" },
    { href: "/b/g.vcf", etag: "2" },
  ],
  fetchCards: async () => [
    {
      href: "/b/ada.vcf",
      etag: "1",
      vcardText: "BEGIN:VCARD\r\nVERSION:3.0\r\nUID:ada\r\nFN:Ada\r\nEND:VCARD\r\n",
    },
    {
      href: "/b/g.vcf",
      etag: "2",
      vcardText:
        "BEGIN:VCARD\r\nVERSION:4.0\r\nUID:g\r\nFN:Club\r\nKIND:group\r\nMEMBER:urn:uuid:ada\r\nEND:VCARD\r\n",
    },
  ],
}));

describe("loadFullBook", () => {
  it("sorts group cards from contacts", async () => {
    const book = await loadFullBook({ username: "u" }, "/b/");
    expect(book.contacts.map((c) => c.uid)).toEqual(["ada"]);
    expect(book.groups.map((c) => c.uid)).toEqual(["g"]);
    expect(book.skipped).toEqual([]);
  });
});
