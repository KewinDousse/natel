/**
 * Digest authentication (RFC 7616) as natel-session answers it (digest.go):
 * the first challenge it can answer, qop=auth or none, its nonce kept for
 * the whole session.
 */
import { createHash, randomBytes } from "node:crypto";

export type Credential = (method: string, uri: string) => string;

export function basicCredential(username: string, password: string): Credential {
  const header = `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
  return () => header;
}

type Challenge = { scheme: string; params: Map<string, string> };

/** WWW-Authenticate values, where a comma separates challenges and their parameters. */
export function parseChallenges(value: string | null): Challenge[] {
  const out: Challenge[] = [];
  const pattern = /\s*,?\s*([^\s,="]+)(?:\s*=\s*(?:"((?:[^"\\]|\\.)*)"|([^\s,]*)))?/gy;
  for (const match of (value ?? "").matchAll(pattern)) {
    const [, name = "", quoted, bare] = match;
    const last = out.at(-1);
    if ((quoted !== undefined || bare !== undefined) && last) {
      last.params.set(name.toLowerCase(), quoted?.replace(/\\(.)/g, "$1") ?? bare ?? "");
    } else {
      out.push({ scheme: name.toLowerCase(), params: new Map() });
    }
  }
  return out;
}

const quote = (s: string) => `"${s.replace(/[\\"]/g, "\\$&")}"`;

export function digestCredential(
  username: string,
  password: string,
  value: string | null,
): Credential | undefined {
  for (const { scheme, params } of parseChallenges(value)) {
    const nonce = params.get("nonce");
    if (scheme !== "digest" || !nonce) continue;
    const algorithm = params.get("algorithm") || "MD5";
    const upper = algorithm.toUpperCase();
    const session = upper.endsWith("-SESS");
    const base = session ? upper.slice(0, -5) : upper;
    if (base !== "MD5" && base !== "SHA-256") continue;
    const offered = params.get("qop");
    const qop = offered?.split(",").some((o) => o.trim().toLowerCase() === "auth") ?? false;
    if (offered !== undefined && !qop) continue;
    const hash = (s: string) =>
      createHash(base === "MD5" ? "md5" : "sha256")
        .update(s)
        .digest("hex");
    const realm = params.get("realm") ?? "";
    const opaque = params.get("opaque");
    const cnonce = randomBytes(16).toString("hex");
    let ha1 = hash(`${username}:${realm}:${password}`);
    if (session) ha1 = hash(`${ha1}:${nonce}:${cnonce}`);
    let count = 0;
    return (method, uri) => {
      const ha2 = hash(`${method}:${uri}`);
      let header = `Digest username=${quote(username)}, realm=${quote(realm)}, nonce=${quote(nonce)}, uri=${quote(uri)}, algorithm=${algorithm}`;
      if (qop) {
        count += 1;
        const nc = count.toString(16).padStart(8, "0");
        const response = hash(`${ha1}:${nonce}:${nc}:${cnonce}:auth:${ha2}`);
        header += `, qop=auth, nc=${nc}, cnonce=${quote(cnonce)}, response=${quote(response)}`;
      } else {
        header += `, response=${quote(hash(`${ha1}:${nonce}:${ha2}`))}`;
      }
      if (opaque) header += `, opaque=${quote(opaque)}`;
      return header;
    };
  }
  return undefined;
}

/**
 * The credential an anonymous request's answer asks for, as negotiate in
 * digest.go picks it: Digest first, Basic where offered, else none.
 */
export function negotiate(
  username: string,
  password: string,
  response: Response,
): Credential | undefined {
  if (response.status === 207) return basicCredential(username, password);
  if (response.status !== 401) return undefined;
  const value = response.headers.get("www-authenticate");
  const challenges = parseChallenges(value);
  return (
    digestCredential(username, password, value) ??
    (challenges.length === 0 || challenges.some((c) => c.scheme === "basic")
      ? basicCredential(username, password)
      : undefined)
  );
}
