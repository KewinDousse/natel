/**
 * File side of the .vcf export (ADR 020): the file's name, and handing the
 * built text to the browser as a download.
 */

/**
 * `<book>.vcf`, after the book's display name, else the last segment of its
 * href, with characters file systems refuse replaced by `_`.
 */
export function exportFileName(book: { displayName: string; href: string }): string {
  return `${safeBase(bookName(book))}.vcf`;
}

/** A book's display name, else the last segment of its href. */
export function bookName(book: { displayName: string; href: string }): string {
  const segment = book.href.replace(/\/+$/, "").split("/").pop() ?? "";
  let decoded = segment;
  try {
    decoded = decodeURIComponent(segment);
  } catch {
    // A malformed escape: the raw segment still names the book.
  }
  return book.displayName.trim() || decoded || "contacts";
}

/** Trimmed of the dots and spaces Windows drops or refuses at the ends. */
function safeBase(name: string): string {
  const cleaned = name
    // biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are refused too
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_")
    .replace(/^[.\s]+|[.\s]+$/g, "");
  return cleaned || "contacts";
}

/** Save `text` as `fileName` through a temporary link. */
export function downloadText(text: string, fileName: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "text/vcard;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  // Revoked a moment later: some browsers start the download asynchronously.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
