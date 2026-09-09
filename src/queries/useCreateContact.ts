/**
 * useCreateContact — mutation hook that creates a new card.
 *
 * The hook serialises the Contact (vCard 3.0 per policy is the caller's job
 * when building the new Contact), PUTs it with If-None-Match: *, then
 * invalidates the contacts cache so the fresh card body is loaded on next
 * refetch.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createCard } from "@/dav";
import type { DavAuth } from "@/dav/types";
import type { Contact } from "@/model/contact";
import { serialise } from "@/vcard";

export function useCreateContact(auth: DavAuth, bookHref: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (contact: Contact) => {
      const vcardText = serialise(contact);
      return await createCard(auth, bookHref, vcardText);
    },
    onSuccess: () => {
      // Invalidate only the contacts query for this specific book, not all
      // books of the auth.
      void queryClient.invalidateQueries({
        queryKey: ["contacts", auth.serverUrl, auth.username, bookHref],
      });
    },
  });
}
