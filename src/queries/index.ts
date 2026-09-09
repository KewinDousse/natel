/**
 * TanStack Query hooks — the bridge between src/dav and src/vcard.
 *
 * Routes consume these; the queries layer is the only consumer of dav/vcard.
 */

export type { DavAddressBook, DavAuth } from "@/dav/types";
export { createQueryClient } from "./client";
export { useAddressBooks } from "./useAddressBooks";
export { loadFullBook, useContacts } from "./useContacts";
export { useCreateContact } from "./useCreateContact";
export { useDeleteContact } from "./useDeleteContact";
export { useUpdateContact } from "./useUpdateContact";
