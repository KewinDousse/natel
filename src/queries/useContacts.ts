/**
 * useContacts — query hook that loads an entire address book.
 *
 * Orchestration: listContacts → fetchCards (batched multiget) → parse each card.
 * A card that fails to fetch or parse is logged with a clear marker and
 * its href is tracked in skipped[]; a single corrupt card never breaks the
 * whole book.
 *
 * When auth or book is undefined the query is disabled and returns [].
 */
import { useQuery } from "@tanstack/react-query";
import { fetchCards, listContacts } from "@/dav";
import type { DavAddressBook, DavAuth } from "@/dav/types";
import type { Contact } from "@/model/contact";
import { parse } from "@/vcard";
import { contactsKey } from "./keys";

/**
 * Result of loading a full address book.
 *
 * `contacts` — successfully parsed Contact objects.
 * `skipped`  — hrefs that were listed but could not be fetched or parsed.
 */
export type LoadFullBookResult = {
  contacts: Contact[];
  skipped: string[];
};

/**
 * Load the full content of an address book as an array of Contact objects.
 *
 * Exported as a plain async function so it can be unit-tested without React
 * (the hook is a thin wrapper).
 */
export async function loadFullBook(auth: DavAuth, bookHref: string): Promise<LoadFullBookResult> {
  const summaries = await listContacts(auth, bookHref);
  const allHrefs = summaries.map((s) => s.href);

  // Fetch all cards in one batched addressbook-multiget.
  const details = await fetchCards(auth, allHrefs);

  // Map the batched results back to requested hrefs to find what's missing.
  const fetchedHrefs = new Set(details.map((d) => d.href));
  const skipped: string[] = allHrefs.filter((h) => !fetchedHrefs.has(h));

  const contacts: Contact[] = [];
  for (const detail of details) {
    try {
      const contact = parse(detail.vcardText, detail.href, detail.etag);
      contacts.push(contact);
    } catch (err) {
      console.warn(
        `[queries] Skipping unparseable card ${detail.href}: ${err instanceof Error ? err.message : String(err)}`,
      );
      skipped.push(detail.href);
    }
  }

  return { contacts, skipped };
}

export function useContacts(
  auth: DavAuth | undefined,
  book: DavAddressBook | undefined,
): ReturnType<typeof useQuery<LoadFullBookResult>> {
  return useQuery<LoadFullBookResult>({
    queryKey: contactsKey(auth, book),
    queryFn: () => {
      if (auth === undefined || book === undefined) return { contacts: [], skipped: [] };
      return loadFullBook(auth, book.href);
    },
    enabled: auth !== undefined && book !== undefined,
    placeholderData: { contacts: [], skipped: [] },
  });
}
