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

export type DavErrorCode =
  | "AUTH"
  | "NOT_FOUND"
  | "NETWORK"
  | "UNEXPECTED"
  | "CONFLICT"
  | "TOO_LARGE"
  | "MAYBE_TOO_LARGE";

/** Typed error for CardDAV operations. */
export class DavError extends Error {
  /**
   * Machine-readable error code for programmatic handling.
   *
   * - CONFLICT: HTTP 412 Precondition Failed (resource changed on server).
   * - TOO_LARGE: HTTP 413 on a PUT: the server, or a proxy in front of it,
   *   refused the card for its size (ADR 023).
   * - MAYBE_TOO_LARGE: a network failure while sending a card over 1 MB,
   *   which a proxy often gives instead of a 413, but which a dropped
   *   connection gives too (ADR 023).
   * - UNEXPECTED: data integrity violation (e.g. missing/empty ETag for a
   *   conditional write) or any unrecognised server error.
   */
  public readonly code: DavErrorCode;
  /** The size of the card sent, for TOO_LARGE and MAYBE_TOO_LARGE. */
  public readonly bytes?: number;

  constructor(message: string, code: DavErrorCode, cause?: unknown, bytes?: number) {
    super(message, { cause });
    this.name = "DavError";
    this.code = code;
    this.bytes = bytes;
  }
}
