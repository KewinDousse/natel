/**
 * useLogin — mutation hook that opens a session, then discovers the books.
 *
 * natel-session checks the credentials against the CardDAV server when the
 * session opens and throws DavError on auth or network failure. On success
 * the books found seed the address-books query, so the directory does not
 * discover them a second time. The caller handles the rest (store + navigate).
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { closeSession, discoverAddressBooks, openSession } from "@/dav";
import type { DavAddressBook, DavAuth, DavCredentials } from "@/dav/types";
import { addressBooksKey } from "./keys";

export function useLogin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      credentials: DavCredentials,
    ): Promise<{ auth: DavAuth; books: DavAddressBook[] }> => {
      const auth = await openSession(credentials);
      try {
        return { auth, books: await discoverAddressBooks(auth) };
      } catch (err) {
        // A failed sign-in leaves no session behind for a reload to restore.
        await closeSession();
        throw err;
      }
    },
    onSuccess: ({ auth, books }) => {
      queryClient.setQueryData(addressBooksKey(auth), books);
    },
  });
}
