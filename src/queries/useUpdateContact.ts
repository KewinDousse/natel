/**
 * useUpdateContact — mutation hook that updates an existing card.
 *
 * The Contact is serialised and sent via conditional PUT (If-Match). On success
 * the cache is updated in-place with the fresh ETag via queryClient.setQueriesData,
 * avoiding a full book refetch. DavError(CONFLICT) from the dav layer propagates
 * to the caller unmodified.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateCard } from "@/dav";
import type { DavAuth } from "@/dav/types";
import type { Contact } from "@/model/contact";
import { serialise } from "@/vcard";
import { contactsAuthPrefix } from "./keys";
import type { LoadFullBookResult } from "./useContacts";

export function useUpdateContact(auth: DavAuth) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (contact: Contact) => {
      const vcardText = serialise(contact);
      return await updateCard(auth, contact.href, contact.etag, vcardText);
    },
    onSuccess: (result, contact) => {
      // Patch the cached Contact with the SUBMITTED contact and the new ETag
      // instead of invalidating. Spreading `contact` (not the cached copy)
      // keeps the submitted fields — serialise() mutates the shared `raw`, so
      // the cached copy on its own would hold stale fields here. The card
      // now holds the photo as written, so the next save leaves it alone.
      const saved: Contact = {
        ...contact,
        etag: result.etag,
        fields: { ...contact.fields, photo: { kind: "unchanged" } },
      };
      queryClient.setQueriesData<LoadFullBookResult>(
        { queryKey: contactsAuthPrefix(auth) },
        (old) =>
          old && {
            ...old,
            contacts: old.contacts.map((c) => (c.href === contact.href ? saved : c)),
          },
      );
    },
  });
}
