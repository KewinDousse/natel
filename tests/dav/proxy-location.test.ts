import { describe, expect, it } from "vitest";
import { proxyLocation } from "../../src/dav/proxy-location";

describe("proxyLocation", () => {
  it.each([
    ["https://other.example/books/", "/dav/books/"],
    ["//other.example/books/", "/dav/books/"],
    ["../books/", "/dav/a/books/"],
    ["/a/..%2f../outside", "/dav/a/..%2f../outside"],
    ["/%2f../outside", "/dav/%2f../outside"],
    ["/a/%2e%2f/out", "/dav/a/%2e%2f/out"],
    ["/a//b/../c", "/dav/a//c"],
    ["///other.example/out", "/dav/out"],
    ["../../../outside", "/dav/outside"],
    ["%2e%2e/%2E%2e/%2e./outside", "/dav/outside"],
    ["/a%2Fb/../out", "/dav/out"],
    ["?sig=a=b==&x=1&x=2", "/dav/a/b/redirect?sig=a=b==&x=1&x=2"],
    ["#fragment", "/dav/a/b/redirect?old=1"],
    ["", "/dav/a/b/redirect?old=1"],
    ["/name$1$$2?x=a/b&y=$foo", "/dav/name$1$$2?x=a/b&y=$foo"],
    ["/foo%3Fbar%23baz", "/dav/foo%3Fbar%23baz"],
  ])("confines %s in server space before prefixing /dav", (location, expected) => {
    expect(proxyLocation(location, "/a/b/redirect?old=1", "https://server.example")).toBe(expected);
  });

  it.each([
    "javascript:alert(1)",
    "data:text/plain,hello",
    "ftp://other.example/books",
    "http://[",
  ])("rejects an unusable redirect: %s", (location) => {
    expect(proxyLocation(location, "/a/b/redirect", "https://server.example")).toBeNull();
  });
});
