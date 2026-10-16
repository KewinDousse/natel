/**
 * The proxy's URL space, and hrefs translated across it.
 *
 * Every request goes to the same-origin proxy mounted at /dav, which mirrors
 * the CardDAV server's paths (ADR 009, 014): /dav/dav.php/… reaches the
 * server's /dav.php/…. The proxy rewrites neither request nor response
 * bodies, so hrefs crossing it must be translated both ways.
 */

import { DavError } from "./types";

export const PROXY_PREFIX = "/dav";

/** Absolute URL of the proxy root, on the page's own origin. */
export function proxyRoot(): string {
  return new URL(`${PROXY_PREFIX}/`, globalThis.location.href).href;
}

/** Credentials may only be sent to the app's DAV proxy. */
export function assertProxyHref(href: string): void {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    throw new DavError(`Invalid DAV href: ${href}`, "UNEXPECTED");
  }
  if (!url.href.startsWith(proxyRoot()) || url.username || url.password) {
    throw new DavError(`CardDAV href outside the proxy: ${href}`, "UNEXPECTED");
  }
}

/**
 * Map an href from a server response into proxy space.
 *
 * Servers answer with absolute paths in their own URL space (`/dav.php/…`),
 * sometimes with their own origin in front; both get the /dav prefix. A
 * relative href resolves against the request URL, which already carries it.
 *
 * The result is checked to lie under the proxy root: requests to it carry the
 * credentials, and the URL parser reads some relative hrefs (`\\host/`,
 * ` //host/`) as another origin.
 */
export function fromServerHref(href: string, requestUrl: string): string {
  let path = href;
  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) {
    const url = new URL(absolutizeHref(href, requestUrl));
    path = `${url.pathname}${url.search}`;
  }
  const resolved = path.startsWith("/")
    ? absolutizeHref(`${PROXY_PREFIX}${path}`, requestUrl)
    : absolutizeHref(href, requestUrl);
  if (!resolved.startsWith(proxyRoot())) {
    throw new DavError(`CardDAV href outside the proxy: ${href}`, "UNEXPECTED");
  }
  return resolved;
}

/** Server-space path of a proxy URL, for hrefs sent inside a request body. */
export function toServerPath(href: string): string {
  assertProxyHref(href);
  const url = new URL(href);
  return `${url.pathname.slice(PROXY_PREFIX.length)}${url.search}`;
}

/**
 * Resolve an href against a base, mapping malformed input to a DavError
 * instead of a raw TypeError from `new URL`.
 */
export function absolutizeHref(href: string, base: string): string {
  try {
    return new URL(href, base).href;
  } catch {
    throw new DavError(`Invalid DAV href ${href} against base ${base}`, "UNEXPECTED");
  }
}

/**
 * Derive the parent collection (address book) URL from a vCard's href.
 *
 * Strips the last path segment. Assumes the vCard is a direct child of the
 * address book collection. Maps malformed input to a DavError.
 */
export function deriveBookUrl(href: string): string {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    throw new DavError(`Invalid card href: ${href}`, "UNEXPECTED");
  }
  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length > 0) segments.pop(); // remove vCard filename
  url.pathname = segments.length > 0 ? `/${segments.join("/")}/` : "/";
  return url.toString();
}
