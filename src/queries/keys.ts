/**
 * Query key builders for TanStack Query.
 *
 * Each helper returns a readonly tuple that serves both as the cache key and
 * as a filter for partial invalidation / setQueriesData.
 */
import type { DavAuth } from "@/dav/types";

/** Key for the address-books query, scoped to auth. */
export function addressBooksKey(
  auth: DavAuth | undefined,
): readonly ["address-books", string, string] {
  return ["address-books", auth?.serverUrl ?? "", auth?.username ?? ""];
}

/** Key for a contacts query, scoped to auth + book. */
export function contactsKey(
  auth: DavAuth | undefined,
  book: { href: string } | undefined,
): readonly ["contacts", string, string, string] {
  return ["contacts", auth?.serverUrl ?? "", auth?.username ?? "", book?.href ?? ""];
}

/** Key prefix for ALL contacts queries belonging to one auth (partial match). */
export function contactsAuthPrefix(auth: DavAuth): readonly ["contacts", string, string] {
  return ["contacts", auth.serverUrl, auth.username];
}
