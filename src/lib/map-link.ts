/**
 * Where an address opens (ADR 037): the map the settings choose, or, on
 * "auto", the one the device opens best.
 */
import type { VCardAddress } from "@/vcard";

export const MAP_APPS = ["osm", "geo", "apple", "google"] as const;
export type MapApp = (typeof MAP_APPS)[number];

export type MapLink = { href: string; newTab: boolean };

/** What a map can find: a post office box or an extended line would only blur the search. */
type Place = Pick<VCardAddress, "street" | "locality" | "region" | "postalCode" | "country">;

/**
 * The map "auto" picks from the user agent, the only hint a page has: no
 * browser says which app handles `geo:`. Android opens `geo:` in the user's
 * maps app, and Apple Maps' links open the Maps app on Apple devices, iPads
 * that present themselves as a Mac included.
 */
export function deviceMapApp(userAgent: string): MapApp {
  if (/Android/i.test(userAgent)) return "geo";
  if (/iPhone|iPad|iPod|Macintosh/.test(userAgent)) return "apple";
  return "osm";
}

/** The link to `address` on `app`, or null when it has nothing a map can find. */
export function mapLinkOf(address: Place, app: MapApp): MapLink | null {
  const query = mapQueryOf(address);
  if (query.length === 0) return null;
  const q = encodeURIComponent(query);
  switch (app) {
    case "geo":
      // Android's form: RFC 5870 has no search, so the point is left empty.
      return { href: `geo:0,0?q=${q}`, newTab: false };
    case "apple":
      return { href: `https://maps.apple.com/?q=${q}`, newTab: true };
    case "google":
      return { href: `https://www.google.com/maps/search/?api=1&query=${q}`, newTab: true };
    case "osm":
      return { href: `https://www.openstreetmap.org/search?query=${q}`, newTab: true };
  }
}

function mapQueryOf(address: Place): string {
  return [
    address.street,
    [address.postalCode, address.locality].filter((part) => part.trim().length > 0).join(" "),
    address.region,
    address.country,
  ]
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .join(", ");
}
