/**
 * useRefetchCard — fetches a fresh copy of a single vCard from the server.
 *
 * Used after a 412, to compare the lists the user changed with the card's
 * (ADR 038), and by the overwrite to obtain a fresh ETag before the PUT.
 * Throws DavError on network/auth failures.
 */
import { fetchCard } from "@/dav";
import type { DavAuth } from "@/dav/types";
import type { Contact } from "@/model/contact";
import { parse } from "@/vcard";

export function useRefetchCard(auth: DavAuth) {
  const refetchCard = async (href: string): Promise<Contact> => {
    const fresh = await fetchCard(auth, href);
    const freshContact = parse(fresh.vcardText, fresh.href, fresh.etag);
    return freshContact;
  };

  return refetchCard;
}
