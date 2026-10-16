/**
 * Maps the errors tsdav throws to DavError.
 *
 * tsdav@2.3.1 throws errors with status codes embedded in known formats:
 *   "Collection query failed: 401 Unauthorized. Raw response: ..."  (collectionQuery)
 *   "Invalid credentials: PROPFIND ... returned 401 Unauthorized"   (fetchPrincipalUrl)
 * Network failures surface as native TypeError ("fetch failed", Safari's
 * "Load failed"); there is no status in such messages.
 */

import { DavError } from "./types";

/**
 * Extract an HTTP status code from a tsdav error message, if any.
 *
 * Only the formats tsdav actually emits are recognized, so unrelated "412"
 * digits in a raw response body cannot false-positive.
 */
function extractStatusFromMessage(message: string): number | null {
  const match = message.match(/(?:failed|returned)[ :]+([45]\d{2})/);
  if (match?.[1]) return Number.parseInt(match[1], 10);
  return null;
}

/** Map a thrown tsdav error to our DavError. */
export function mapDavError(err: unknown, context: string): never {
  if (err instanceof DavError) throw err;

  const message = err instanceof Error ? err.message : String(err);
  const status = extractStatusFromMessage(message);

  // Browsers (notably Safari) reject failed fetches with a bare TypeError
  // such as "Load failed". Treat any TypeError as a network failure.
  if (err instanceof TypeError) {
    throw new DavError(`CardDAV network error: ${context}`, "NETWORK", err);
  }

  if (status === 412) {
    throw new DavError(
      `CardDAV conflict: ${context} — resource changed on server`,
      "CONFLICT",
      err,
    );
  }
  if (status === 401 || status === 403) {
    throw new DavError(`CardDAV authentication failed: ${context}`, "AUTH", err);
  }
  if (status === 404) {
    throw new DavError(`CardDAV resource not found: ${context}`, "NOT_FOUND", err);
  }
  if (status !== null && status >= 500) {
    throw new DavError(`CardDAV unexpected error: ${context} — HTTP ${status}`, "UNEXPECTED", err);
  }

  if (
    message.includes("fetch") ||
    message.includes("network") ||
    message.includes("ENOTFOUND") ||
    message.includes("ECONNREFUSED") ||
    message.includes("NetworkError")
  ) {
    throw new DavError(`CardDAV network error: ${context}`, "NETWORK", err);
  }

  throw new DavError(`CardDAV unexpected error: ${context} — ${message}`, "UNEXPECTED", err);
}

/** Promise wrapper that catches raw tsdav errors and maps them. */
export async function wrap<T>(fn: () => Promise<T>, context: string): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    return mapDavError(err, context);
  }
}
