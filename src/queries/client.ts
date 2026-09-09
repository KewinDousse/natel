/**
 * QueryClient factory with defaults tuned for this app.
 *
 * - Contacts are fully loaded into the cache by useContacts and then served
 *   client-side (ARCHITECTURE.md §Search), so a generous staleTime avoids
 *   redundant refetches on every remount.
 * - retry is off for mutations: writes are conditional (If-Match) and a failed
 *   write must never be retried blindly (AGENTS.md invariant 5).
 */
import { QueryClient } from "@tanstack/react-query";

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60 * 1000, // 5 minutes
        retry: 2,
      },
      mutations: {
        retry: false,
      },
    },
  });
}
