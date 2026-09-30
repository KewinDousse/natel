/**
 * Export of an address book as one .vcf file (ADR 020): the book is fetched
 * again and each card written as the server returned it, cards the app can't
 * parse included. A listed card that can't be fetched fails the export
 * rather than leave it out of the file.
 */
import { fetchCards, listContacts } from "@/dav";
import type { DavAuth } from "@/dav/types";

/** Some listed cards couldn't be fetched; `missing` says how many. */
export class IncompleteExportError extends Error {
  constructor(readonly missing: number) {
    super(`${missing} cards could not be fetched`);
    this.name = "IncompleteExportError";
  }
}

export async function exportVcf(auth: DavAuth, bookHref: string): Promise<string> {
  const summaries = await listContacts(auth, bookHref);
  const details = await fetchCards(
    auth,
    summaries.map((summary) => summary.href),
  );
  const fetched = new Set(details.map((detail) => detail.href));
  const missing = summaries.filter((summary) => !fetched.has(summary.href)).length;
  if (missing > 0) throw new IncompleteExportError(missing);
  return details
    .map(({ vcardText }) => (/(\r\n|\n|\r)$/.test(vcardText) ? vcardText : `${vcardText}\r\n`))
    .join("");
}
