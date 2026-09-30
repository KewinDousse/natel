/**
 * TanStack Query hooks — the bridge between src/dav and src/vcard.
 *
 * Routes consume these; the queries layer is the only consumer of dav/vcard.
 */

export type { DavAddressBook, DavAuth } from "@/dav/types";
export { DavError } from "@/dav/types";
export { createQueryClient } from "./client";
export { type MoveOutcome, moveContact } from "./moveContact";
export { useAddressBooks } from "./useAddressBooks";
export { type LoadFullBookResult, loadFullBook, useContacts } from "./useContacts";
export { useCreateContact } from "./useCreateContact";
export { useDeleteContact } from "./useDeleteContact";
export { useLogin } from "./useLogin";
export { useRefetchCard } from "./useRefetchCard";
export { useUpdateContact } from "./useUpdateContact";
export { exportVcf, IncompleteExportError } from "./vcfExport";
export {
  EmptyImportError,
  type ImportFailure,
  type ImportFailureReason,
  type ImportResult,
  importVcf,
} from "./vcfImport";
