/**
 * Types for the CardDAV client.
 *
 * Data-only — no I/O, no tsdav dependency.
 */

/** Credentials for Basic auth with a CardDAV server. */
export interface DavAuth {
  /** CardDAV server URL (e.g. https://contacts.example.com). */
  serverUrl: string;
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
  constructor(
    message: string,
    /** Machine-readable error code for programmatic handling. */
    public readonly code: "AUTH" | "NOT_FOUND" | "NETWORK" | "UNEXPECTED",
    /** The original error/response, if any. */
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "DavError";
  }
}
