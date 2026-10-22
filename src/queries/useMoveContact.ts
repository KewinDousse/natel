import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { DavAddressBook, DavAuth } from "@/dav/types";
import type { Contact } from "@/model/contact";
import { parse } from "@/vcard";
import { contactsKey } from "./keys";
import { moveContact } from "./moveContact";
import type { LoadFullBookResult } from "./useContacts";

/** Keeps both books' caches in step with the move, including uncertain outcomes. */
export function useMoveContact(auth: DavAuth) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      contact,
      targetBook,
    }: {
      contact: Contact;
      sourceBook: DavAddressBook;
      targetBook: DavAddressBook;
    }) => {
      const outcome = await moveContact(auth, contact, targetBook.href);
      if (outcome.kind === "moved")
        return { ...outcome, contact: parse(outcome.text, outcome.href, outcome.etag) };
      return outcome;
    },
    onSuccess: (outcome, { contact, sourceBook, targetBook }) => {
      const sourceKey = contactsKey(auth, sourceBook);
      const targetKey = contactsKey(auth, targetBook);
      const reload = (...keys: (typeof sourceKey)[]) => {
        for (const key of keys) void queryClient.invalidateQueries({ queryKey: key });
      };
      if (outcome.kind === "moved") {
        const moved = outcome.contact;
        queryClient.setQueryData<LoadFullBookResult>(
          sourceKey,
          (old) =>
            old && { ...old, contacts: old.contacts.filter((card) => card.href !== contact.href) },
        );
        queryClient.setQueryData<LoadFullBookResult>(
          targetKey,
          (old) => old && { ...old, contacts: [...old.contacts, moved] },
        );
        return;
      }
      switch (outcome.kind) {
        case "exists":
          reload(targetKey);
          break;
        case "create_uncertain":
        case "in_both":
        case "delete_uncertain":
          reload(sourceKey, targetKey);
          break;
      }
    },
  });
}
