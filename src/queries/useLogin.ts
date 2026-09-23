/**
 * useLogin — mutation hook that verifies credentials via discoverAddressBooks.
 *
 * The mutationFn directly wraps the CardDAV discovery call and throws DavError
 * on auth or network failure. The caller handles onSuccess (store + navigate).
 */
import { useMutation } from "@tanstack/react-query";
import { discoverAddressBooks } from "@/dav";
import type { DavAddressBook, DavAuth } from "@/dav/types";

export function useLogin() {
  return useMutation({
    mutationFn: async (auth: DavAuth): Promise<DavAddressBook[]> => {
      // The credential check: discovering address books requires valid auth.
      return await discoverAddressBooks(auth);
    },
  });
}
