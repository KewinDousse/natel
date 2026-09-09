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

export function useUpdateContact(auth: DavAuth) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (contact: Contact) => {
      const vcardText = serialise(contact);
      return await updateCard(auth, contact.href, contact.etag, vcardText);
    },
    onSuccess: (result, contact) => {
      // Patch the cached Contact with the new ETag instead of invalidating.
      // The body is already what we sent — only the etag changed on the server.
      queryClient.setQueriesData<Contact[]>({ queryKey: contactsAuthPrefix(auth) }, (old) =>
        old?.map((c) => (c.href === contact.href ? { ...c, etag: result.etag } : c)),
      );
    },
  });
}
