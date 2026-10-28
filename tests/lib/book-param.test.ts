import { describe, expect, it } from "vitest";
import { bookParam, findBook, hrefSegment } from "@/lib/book-param";

const WORK = { href: "/dav/addressbooks/alice/work/" };
const HOME = { href: "/dav/addressbooks/alice/caf%C3%A9" };

describe("book param", () => {
  it("names a book after its href's last segment, decoded, trailing slash or not", () => {
    expect(bookParam(WORK)).toBe("work");
    expect(bookParam(HOME)).toBe("café");
  });

  it("keeps a malformed escape as it is", () => {
    expect(hrefSegment("/dav/books/50%/")).toBe("50%");
  });

  it("finds the book a param names, and nothing for an unknown or missing one", () => {
    expect(findBook([WORK, HOME], "café")).toBe(HOME);
    expect(findBook([WORK, HOME], "gone")).toBeUndefined();
    expect(findBook([WORK, HOME], undefined)).toBeUndefined();
  });

  it("opens the first of two books sharing a last segment", () => {
    const shared = { href: "/dav/addressbooks/bob/work/" };
    expect(findBook([WORK, shared], "work")).toBe(WORK);
  });
});
