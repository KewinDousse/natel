/**
 * Types for the CardDAV client.
 *
 * Data-only — no I/O, no tsdav dependency.
 */

/**
 * Credentials for Basic auth with the CardDAV server. The server itself is
 * operator configuration behind the /dav proxy (ADR 014).
 */
export interface DavAuth {
  /** Basic auth username. */
  username: string;
  /** Basic auth password. */
  password: string;
}

/** An address book discovered on the server. */
export interface DavAddressBook {
  /** Resource URL of the address book collection. */
  href: string;
  /** Display name (from DAV:displayname). Falls back to href if empty. */
  displayName: string;
}

/** A single contact as returned by listContacts (href + etag, no body). */
export interface DavContactSummary {
  /** Resource URL of the vCard. */
  href: string;
  /** Last known ETag. */
  etag: string;
}

/** A single contact body as returned by fetchCard. */
export interface DavContactDetail {
  /** Resource URL of the vCard. */
  href: string;
  /** ETag from the response. */
  etag: string;
  /** Raw vCard text (unparsed). */
  vcardText: string;
}

/** Typed error for CardDAV operations. */
export class DavError extends Error {
  /**
   * Machine-readable error code for programmatic handling.
   *
   * - CONFLICT: HTTP 412 Precondition Failed (resource changed on server).
   * - UNEXPECTED: data integrity violation (e.g. missing/empty ETag for a
   *   conditional write) or any unrecognised server error.
   */
  public readonly code: "AUTH" | "NOT_FOUND" | "NETWORK" | "UNEXPECTED" | "CONFLICT";

  constructor(
    message: string,
    code: "AUTH" | "NOT_FOUND" | "NETWORK" | "UNEXPECTED" | "CONFLICT",
    cause?: unknown,
  ) {
    super(message, { cause });
    this.name = "DavError";
    this.code = code;
  }
}
