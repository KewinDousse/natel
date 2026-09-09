/**
 * useContacts — query hook that loads an entire address book.
 *
 * Orchestration: listContacts → fetchCard for each summary → parse each card.
 * A card that fails to fetch or parse is logged with a clear marker and
 * skipped; a single corrupt card never breaks the whole book.
 *
 * When auth or book is undefined the query is disabled and returns [].
 */
import { useQuery } from "@tanstack/react-query";
import { fetchCard, listContacts } from "@/dav";
import type { DavAddressBook, DavAuth } from "@/dav/types";
import type { Contact } from "@/model/contact";
import { parse } from "@/vcard";
import { contactsKey } from "./keys";

/**
 * Load the full content of an address book as an array of Contact objects.
 *
 * Exported as a plain async function so it can be unit-tested without React
 * (the hook is a thin wrapper).
 */
export async function loadFullBook(auth: DavAuth, bookHref: string): Promise<Contact[]> {
  const summaries = await listContacts(auth, bookHref);

  const results = await Promise.all(
    summaries.map(async (summary) => {
      // Try to fetch the raw vCard body first.
      let detail: { href: string; etag: string; vcardText: string };
      try {
        detail = await fetchCard(auth, summary.href);
      } catch (err) {
        console.warn(
          `[queries] Skipping card ${summary.href}: failed to fetch — ${err instanceof Error ? err.message : String(err)}`,
        );
        return null;
      }

      // Try to parse the vCard text into a Contact.
      try {
        return parse(detail.vcardText, detail.href, detail.etag);
      } catch (err) {
        console.warn(
          `[queries] Skipping unparseable card ${detail.href}: ${err instanceof Error ? err.message : String(err)}`,
        );
        return null;
      }
    }),
  );

  return results.filter((c): c is Contact => c !== null);
}

export function useContacts(
  auth: DavAuth | undefined,
  book: DavAddressBook | undefined,
): ReturnType<typeof useQuery<Contact[]>> {
  return useQuery<Contact[]>({
    queryKey: contactsKey(auth, book),
    queryFn: () => {
      if (auth === undefined || book === undefined) return [];
      return loadFullBook(auth, book.href);
    },
    enabled: auth !== undefined && book !== undefined,
    placeholderData: [],
  });
}
