/**
 * Tests for src/lib/map-link.ts — where an address opens (ADR 037).
 */
import { describe, expect, it } from "vitest";
import { deviceMapApp, mapLinkOf } from "@/lib/map-link";

const ADDRESS = {
  street: "Rue du Monolithe 1",
  locality: "Lumière",
  region: "",
  postalCode: "1000",
  country: "Suisse",
};
const QUERY = "Rue%20du%20Monolithe%201%2C%201000%20Lumi%C3%A8re%2C%20Suisse";

describe("deviceMapApp", () => {
  it.each([
    ["Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Chrome/126 Mobile", "geo"],
    ["Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15", "apple"],
    // iPadOS Safari presents itself as a Mac.
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605", "apple"],
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126", "osm"],
    ["Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0", "osm"],
  ])("picks the map for %s", (userAgent, app) => {
    expect(deviceMapApp(userAgent)).toBe(app);
  });
});

describe("mapLinkOf", () => {
  it.each([
    ["osm", `https://www.openstreetmap.org/search?query=${QUERY}`, true],
    ["apple", `https://maps.apple.com/?q=${QUERY}`, true],
    ["google", `https://www.google.com/maps/search/?api=1&query=${QUERY}`, true],
    ["geo", `geo:0,0?q=${QUERY}`, false],
  ] as const)("links to %s on what a map can find", (app, href, newTab) => {
    expect(mapLinkOf(ADDRESS, app)).toEqual({ href, newTab });
  });

  it("gives an address with nothing a map can find no link", () => {
    expect(
      mapLinkOf({ ...ADDRESS, street: " ", locality: "", postalCode: "", country: "" }, "osm"),
    ).toBeNull();
  });
});
