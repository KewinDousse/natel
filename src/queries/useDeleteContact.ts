/**
 * useDeleteContact — mutation hook that deletes a card.
 *
 * Sends a conditional DELETE (If-Match) and removes the contact from the
 * cache on success. DavError(CONFLICT) propagates to the caller unmodified.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { deleteCard } from "@/dav";
import type { DavAuth } from "@/dav/types";
import type { Contact } from "@/model/contact";
import { contactsAuthPrefix } from "./keys";

export function useDeleteContact(auth: DavAuth) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (contact: Contact) => {
      await deleteCard(auth, contact.href, contact.etag);
    },
    onSuccess: (_result, contact) => {
      // Remove the deleted contact from every cached book of this auth.
      queryClient.setQueriesData<Contact[]>({ queryKey: contactsAuthPrefix(auth) }, (old) =>
        old?.filter((c) => c.href !== contact.href),
      );
    },
  });
}
