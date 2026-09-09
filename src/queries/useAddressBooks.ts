/**
 * useAddressBooks — query hook that discovers address books for the logged-in
 * user.
 *
 * When auth is undefined (user not logged in), the query is disabled and
 * returns an empty array via placeholderData.
 */
import { useQuery } from "@tanstack/react-query";
import { discoverAddressBooks } from "@/dav";
import type { DavAddressBook, DavAuth } from "@/dav/types";
import { addressBooksKey } from "./keys";

export function useAddressBooks(
  auth: DavAuth | undefined,
): ReturnType<typeof useQuery<DavAddressBook[]>> {
  return useQuery<DavAddressBook[]>({
    queryKey: addressBooksKey(auth),
    queryFn: () => {
      if (auth === undefined) return [];
      return discoverAddressBooks(auth);
    },
    enabled: auth !== undefined,
    placeholderData: [],
  });
}
