/** Resolve a server redirect before putting its path back in proxy space. */
export function proxyLocation(
  location: string,
  requestPath: string,
  serverOrigin: string,
): string | null {
  try {
    const target = new URL(location, new URL(requestPath, serverOrigin));
    if (target.protocol !== "http:" && target.protocol !== "https:") return null;
    return `/dav${target.pathname}${target.search}`;
  } catch {
    return null;
  }
}
