/**
 * The address book in the URL (`/contacts/$book/…`, ADR 043), so a reload or
 * a shared link opens the same book. A book goes by the last segment of its
 * href: books sit side by side in the user's home, so the segment tells them
 * apart and reads well. Two books with the same last segment, under
 * different parents, would share a param: the first one discovered opens.
 */

/** The last segment of a book's href, decoded. */
export function hrefSegment(href: string): string {
  const segment = href.replace(/\/+$/, "").split("/").pop() ?? "";
  try {
    return decodeURIComponent(segment);
  } catch {
    // A malformed escape: the raw segment still names the book.
    return segment;
  }
}

/** The `$book` param that names `book`. */
export function bookParam(book: { href: string }): string {
  return hrefSegment(book.href);
}

/** The book `param` names, if the server still has it. */
export function findBook<Book extends { href: string }>(
  books: readonly Book[],
  param: string | undefined,
): Book | undefined {
  if (param === undefined) return undefined;
  return books.find((book) => bookParam(book) === param);
}
