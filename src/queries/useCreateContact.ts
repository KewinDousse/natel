/**
 * useCreateContact — mutation hook that creates a new card.
 *
 * The hook serialises the Contact (vCard 3.0 per policy is the caller's job
 * when building the new Contact), PUTs it with If-None-Match: * at an href
 * named after its UID (ADR 016), then adds it to the book's cached contacts
 * with its new href and ETag, so its page can open at once without a book
 * refetch. Resolves to the created Contact. A 412 (a card is already there)
 * propagates as DavError CONFLICT.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { cardHref, createCard } from "@/dav";
import type { DavAuth } from "@/dav/types";
import type { Contact } from "@/model/contact";
import { serialise } from "@/vcard";
import { contactsKey } from "./keys";
import type { LoadFullBookResult } from "./useContacts";

export function useCreateContact(auth: DavAuth, bookHref: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (contact: Contact): Promise<Contact> => {
      const vcardText = serialise(contact);
      const { href, etag } = await createCard(auth, cardHref(bookHref, contact.uid), vcardText);
      return { ...contact, href, etag };
    },
    onSuccess: (created) => {
      queryClient.setQueryData<LoadFullBookResult>(
        contactsKey(auth, { href: bookHref }),
        (old) => old && { ...old, contacts: [...old.contacts, created] },
      );
    },
  });
}
