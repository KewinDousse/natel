/**
 * Tests for src/queries/moveContact.ts — every outcome of ADR 021, with
 * src/dav mocked and the real vCard helpers.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DavError } from "@/dav/types";
import { moveContact } from "@/queries";
import { parse } from "@/vcard";

const { mockFetchCard, mockCreateCard, mockDeleteCard } = vi.hoisted(() => ({
  mockFetchCard: vi.fn(),
  mockCreateCard: vi.fn(),
  mockDeleteCard: vi.fn(),
}));

vi.mock("@/dav", () => ({
  cardHref: (book: string, uid: string) => `${book}${encodeURIComponent(uid)}.vcf`,
  fetchCard: mockFetchCard,
  createCard: mockCreateCard,
  deleteCard: mockDeleteCard,
}));

const AUTH = { username: "u", password: "p" };
const SOURCE = "/dav/u/home/ada.vcf";
const TARGET = "/dav/u/work/";
const TEXT = "BEGIN:VCARD\nVERSION:3.0\nUID:ada\nFN:Ada\nX-KEEP:yes\nEND:VCARD\n";
const CRLF = TEXT.replaceAll("\n", "\r\n");
const source = parse(CRLF, SOURCE, '"e1"');

const NET = new DavError("net", "NETWORK");
const ODD = new DavError("500", "UNEXPECTED");
const GONE = new DavError("404", "NOT_FOUND");
const CHANGED = new DavError("412", "CONFLICT");

beforeEach(() => {
  vi.clearAllMocks();
  mockFetchCard.mockResolvedValue({ href: SOURCE, etag: '"e1"', vcardText: TEXT });
  mockCreateCard.mockImplementation(async (_a, href: string) => ({ href, etag: '"c1"' }));
  mockDeleteCard.mockResolvedValue(undefined);
});

describe("moveContact", () => {
  it("creates the card as the server has it, in CRLF, then deletes the source", async () => {
    expect(await moveContact(AUTH, source, TARGET)).toEqual({
      kind: "moved",
      href: `${TARGET}ada.vcf`,
      etag: '"c1"',
      text: CRLF,
    });
    expect(mockCreateCard).toHaveBeenCalledWith(AUTH, `${TARGET}ada.vcf`, CRLF);
    expect(mockDeleteCard).toHaveBeenCalledWith(AUTH, SOURCE, '"e1"');
  });

  it("restores the final line break the multiget dropped", async () => {
    mockFetchCard.mockResolvedValue({ href: SOURCE, etag: '"e1"', vcardText: TEXT.trimEnd() });
    await moveContact(AUTH, source, TARGET);
    expect(mockCreateCard).toHaveBeenCalledWith(AUTH, `${TARGET}ada.vcf`, CRLF);
  });

  it("gives a card without UID the source href's name", async () => {
    mockFetchCard.mockResolvedValue({
      href: "/dav/u/home/x%40y.vcf",
      etag: '"e1"',
      vcardText: "BEGIN:VCARD\nVERSION:3.0\nFN:Ada\nEND:VCARD\n",
    });
    const noUid = { ...source, href: "/dav/u/home/x%40y.vcf" };
    await moveContact(AUTH, noUid, TARGET);
    expect(mockCreateCard).toHaveBeenCalledWith(
      AUTH,
      `${TARGET}x%40y.vcf`,
      "BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Ada\r\nUID:x@y\r\nEND:VCARD\r\n",
    );
  });

  it("treats a blank UID as missing", async () => {
    mockFetchCard.mockResolvedValue({
      href: SOURCE,
      etag: '"e1"',
      vcardText: "BEGIN:VCARD\nVERSION:3.0\nitem1.UID;VALUE=text: \nFN:Ada\nEND:VCARD\n",
    });
    await moveContact(AUTH, source, TARGET);
    expect(mockCreateCard).toHaveBeenCalledWith(
      AUTH,
      `${TARGET}ada.vcf`,
      "BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Ada\r\nUID:ada\r\nEND:VCARD\r\n",
    );
  });

  it("stops before writing when the card changed or went away", async () => {
    mockFetchCard.mockResolvedValueOnce({ href: SOURCE, etag: '"e2"', vcardText: TEXT });
    expect(await moveContact(AUTH, source, TARGET)).toEqual({ kind: "stale" });
    mockFetchCard.mockRejectedValueOnce(GONE);
    expect(await moveContact(AUTH, source, TARGET)).toEqual({ kind: "stale" });
    expect(mockCreateCard).not.toHaveBeenCalled();
  });

  it("writes nothing when the fetch fails otherwise", async () => {
    mockFetchCard.mockRejectedValueOnce(NET);
    expect(await moveContact(AUTH, source, TARGET)).toEqual({ kind: "failed", error: NET });
    expect(mockCreateCard).not.toHaveBeenCalled();
  });

  it("reports a card already at the target href", async () => {
    mockCreateCard.mockRejectedValueOnce(CHANGED);
    expect(await moveContact(AUTH, source, TARGET)).toEqual({ kind: "exists" });
    expect(mockDeleteCard).not.toHaveBeenCalled();
  });

  it("shows a create refused outright as an error", async () => {
    for (const err of [new DavError("403", "AUTH"), new DavError("413", "TOO_LARGE")]) {
      mockCreateCard.mockRejectedValueOnce(err);
      expect(await moveContact(AUTH, source, TARGET)).toEqual({ kind: "failed", error: err });
    }
    expect(mockDeleteCard).not.toHaveBeenCalled();
  });

  it("never deletes the source when the create may have landed", async () => {
    for (const err of [NET, ODD, new DavError("lost", "MAYBE_TOO_LARGE")]) {
      mockCreateCard.mockRejectedValueOnce(err);
      expect(await moveContact(AUTH, source, TARGET)).toEqual({ kind: "create_uncertain" });
    }
    expect(mockDeleteCard).not.toHaveBeenCalled();
  });

  it("undoes the copy when the source refuses the delete", async () => {
    for (const err of [CHANGED, GONE, new DavError("403", "AUTH")]) {
      mockDeleteCard.mockReset();
      mockDeleteCard.mockRejectedValueOnce(err).mockResolvedValueOnce(undefined);
      expect(await moveContact(AUTH, source, TARGET)).toEqual({
        kind: "delete_refused",
        error: err,
      });
      expect(mockDeleteCard).toHaveBeenLastCalledWith(AUTH, `${TARGET}ada.vcf`, '"c1"');
    }
  });

  it("counts a copy already gone as undone", async () => {
    mockDeleteCard.mockRejectedValueOnce(CHANGED).mockRejectedValueOnce(GONE);
    expect(await moveContact(AUTH, source, TARGET)).toEqual({
      kind: "delete_refused",
      error: CHANGED,
    });
  });

  it("says the contact may be in both books when the undo fails", async () => {
    mockDeleteCard.mockRejectedValueOnce(CHANGED).mockRejectedValueOnce(NET);
    expect(await moveContact(AUTH, source, TARGET)).toEqual({ kind: "in_both" });
  });

  it("never undoes the copy when the delete may have landed", async () => {
    mockDeleteCard.mockRejectedValueOnce(NET);
    expect(await moveContact(AUTH, source, TARGET)).toEqual({ kind: "delete_uncertain" });
    expect(mockDeleteCard).toHaveBeenCalledTimes(1);
  });
});
