/**
 * useLogin — mutation hook that verifies credentials via discoverAddressBooks.
 *
 * The mutationFn directly wraps the CardDAV discovery call and throws DavError
 * on auth or network failure. On success the books it found seed the
 * address-books query, so the directory does not discover them a second time.
 * The caller handles the rest (store + navigate).
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { discoverAddressBooks } from "@/dav";
import type { DavAddressBook, DavAuth } from "@/dav/types";
import { addressBooksKey } from "./keys";

export function useLogin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (auth: DavAuth): Promise<DavAddressBook[]> => {
      // The credential check: discovering address books requires valid auth.
      return await discoverAddressBooks(auth);
    },
    onSuccess: (books, auth) => {
      queryClient.setQueryData(addressBooksKey(auth), books);
    },
  });
}
