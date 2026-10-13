/**
 * Tests for src/queries/groupChanges.ts (ADR 022), with src/dav mocked and
 * the real vCard helpers.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DavError } from "@/dav/types";
import { groupDelta, overwriteGroupChange, writeGroupChanges } from "@/queries";
import { groupCardOf, parse } from "@/vcard";

const { mockUpdateCard, mockCreateCard, mockFetchCard } = vi.hoisted(() => ({
  mockUpdateCard: vi.fn(),
  mockCreateCard: vi.fn(),
  mockFetchCard: vi.fn(),
}));

vi.mock("@/dav", () => ({
  cardHref: (book: string, uid: string) => `${book}${uid}.vcf`,
  updateCard: mockUpdateCard,
  createCard: mockCreateCard,
  fetchCard: mockFetchCard,
}));

const AUTH = { username: "u" };
const BOOK = "/b/";
const group = (href: string, name: string, members: string[], extra: string[] = []) =>
  parse(
    [
      "BEGIN:VCARD",
      "VERSION:3.0",
      `UID:${href}`,
      `FN:${name}`,
      "X-ADDRESSBOOKSERVER-KIND:group",
      ...members.map((m) => `X-ADDRESSBOOKSERVER-MEMBER:urn:uuid:${m}`),
      ...extra,
      "END:VCARD",
      "",
    ].join("\r\n"),
    `${BOOK}${href}.vcf`,
    `"${href}"`,
  );

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-09T12:34:56Z"));
  vi.clearAllMocks();
  mockUpdateCard.mockImplementation(async (_a, href: string) => ({ href, etag: '"new"' }));
  mockCreateCard.mockImplementation(async (_a, href: string) => ({ href, etag: '"created"' }));
});

afterEach(() => vi.useRealTimers());

describe("groupDelta", () => {
  it("lists added and removed names", () => {
    expect(groupDelta(["A", "B"], ["B", "C"])).toEqual({ added: ["C"], removed: ["A"] });
  });
});

describe("writeGroupChanges", () => {
  it("adds the member to the first group card of that name, keeping unknown data", async () => {
    const b = group("b", "Famille", ["bob"], ["X-KEEP:yes"]);
    const a = group("a", "Famille", []);
    const { written, failures } = await writeGroupChanges(
      AUTH,
      BOOK,
      "ada",
      { added: ["Famille"], removed: [] },
      [b, a],
    );
    expect(failures).toEqual([]);
    expect(mockUpdateCard).toHaveBeenCalledTimes(1);
    const [, href, etag, text] = mockUpdateCard.mock.calls[0] ?? [];
    expect([href, etag]).toEqual([`${BOOK}a.vcf`, '"a"']);
    expect(text).toContain("X-ADDRESSBOOKSERVER-MEMBER:urn:uuid:ada");
    expect(written.map((c) => [c.href, c.etag])).toEqual([[`${BOOK}a.vcf`, '"new"']]);
  });

  it("moves the REV of a group card it writes to the save's time", async () => {
    const a = group("a", "Famille", [], ["REV:2026-10-07T21:17:12Z"]);
    await writeGroupChanges(AUTH, BOOK, "ada", { added: ["Famille"], removed: [] }, [a]);
    const [, , , text] = mockUpdateCard.mock.calls[0] ?? [];
    expect(text).toContain("\r\nREV:20261009T123456Z\r\n");
  });

  it("creates a group card when none has the name", async () => {
    const { written } = await writeGroupChanges(
      AUTH,
      BOOK,
      "ada",
      { added: ["Club"], removed: [] },
      [],
    );
    expect(mockCreateCard).toHaveBeenCalledTimes(1);
    expect(groupCardOf(written[0] ?? group("x", "", []))).toEqual({
      name: "Club",
      members: ["ada"],
    });
  });

  it("creates a failed group card again at the same href, with the same UID", async () => {
    mockCreateCard.mockRejectedValueOnce(new DavError("offline", "NETWORK"));
    const first = await writeGroupChanges(AUTH, BOOK, "ada", { added: ["Club"], removed: [] }, []);
    const failure = first.failures[0];
    expect(failure?.newCard).toBeDefined();
    const retry = await writeGroupChanges(
      AUTH,
      BOOK,
      "ada",
      { added: ["Club"], removed: [] },
      [],
      new Map([["Club", failure?.newCard ?? group("x", "", [])]]),
    );
    expect(retry.failures).toEqual([]);
    const [firstHref, secondHref] = mockCreateCard.mock.calls.map((call) => call[1]);
    expect(secondHref).toBe(firstHref);
    expect(secondHref).toBe(failure?.cardHref);
  });

  it("writes nothing for a name the contact is already in", async () => {
    await writeGroupChanges(AUTH, BOOK, "ada", { added: ["F"], removed: [] }, [
      group("a", "F", ["ada"]),
    ]);
    expect(mockUpdateCard).not.toHaveBeenCalled();
  });

  it("takes the contact out of every group card of a removed name", async () => {
    const cards = [
      group("a", "F", ["ada", "bob"]),
      group("b", "F", ["ada"]),
      group("c", "G", ["ada"]),
    ];
    await writeGroupChanges(AUTH, BOOK, "urn:uuid:ada", { added: [], removed: ["F"] }, cards);
    expect(mockUpdateCard.mock.calls.map((call) => call[1])).toEqual([
      `${BOOK}a.vcf`,
      `${BOOK}b.vcf`,
    ]);
    for (const call of mockUpdateCard.mock.calls) expect(call[3]).not.toContain("uuid:ada");
  });

  it("keeps going after a failure and says which group", async () => {
    const conflict = new DavError("412", "CONFLICT");
    mockUpdateCard.mockRejectedValueOnce(conflict);
    const { written, failures } = await writeGroupChanges(
      AUTH,
      BOOK,
      "ada",
      { added: ["F"], removed: ["G"] },
      [group("a", "F", []), group("c", "G", ["ada"])],
    );
    expect(failures).toEqual([
      { name: "F", kind: "add", cardHref: `${BOOK}a.vcf`, error: conflict },
    ]);
    expect(written.map((c) => c.href)).toEqual([`${BOOK}c.vcf`]);
  });
});

describe("overwriteGroupChange", () => {
  it("applies only this contact's change to the fresh card", async () => {
    mockFetchCard.mockResolvedValue({
      href: `${BOOK}a.vcf`,
      etag: '"fresh"',
      vcardText: group("a", "F", ["carl"], ["REV:2026-10-07T21:17:12Z"]).raw.toString(),
    });
    const card = await overwriteGroupChange(AUTH, `${BOOK}a.vcf`, "ada", "add");
    expect(mockUpdateCard).toHaveBeenCalledWith(
      AUTH,
      `${BOOK}a.vcf`,
      '"fresh"',
      expect.stringContaining("urn:uuid:carl"),
    );
    expect(groupCardOf(card).members).toEqual(["carl", "ada"]);
    expect(mockUpdateCard.mock.calls[0]?.[3]).toContain("\r\nREV:20261009T123456Z\r\n");
  });
});
