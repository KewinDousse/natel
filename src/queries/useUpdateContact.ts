/**
 * useUpdateContact — mutation hook that updates an existing card.
 *
 * The Contact is serialised and sent via conditional PUT (If-Match). Resolves
 * to the version the write left, parsed from the text that goes with its
 * ETag, and puts it in the cache in place of a full book refetch.
 * DavError(CONFLICT) from the dav layer propagates to the caller unmodified.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateCard } from "@/dav";
import type { DavAuth } from "@/dav/types";
import type { Contact } from "@/model/contact";
import { parse, serialise, stampRevision } from "@/vcard";
import { contactsAuthPrefix } from "./keys";
import type { LoadFullBookResult } from "./useContacts";

export function useUpdateContact(auth: DavAuth) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (contact: Contact): Promise<Contact> => {
      stampRevision(contact);
      const vcardText = serialise(contact);
      const saved = await updateCard(auth, contact.href, contact.etag, vcardText);
      return parse(saved.vcardText, saved.href, saved.etag);
    },
    onSuccess: (saved) => {
      queryClient.setQueriesData<LoadFullBookResult>(
        { queryKey: contactsAuthPrefix(auth) },
        (old) =>
          old && {
            ...old,
            contacts: old.contacts.map((c) => (c.href === saved.href ? saved : c)),
          },
      );
    },
  });
}
