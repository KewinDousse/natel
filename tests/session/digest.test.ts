import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { digestCredential, negotiate, parseChallenges } from "../../session/digest.ts";

// The example of RFC 7616, section 3.9.1, as session/digest_test.go checks it.
const challenge = (algorithm: string) =>
  `Digest realm="http-auth@example.org", qop="auth, auth-int", algorithm=${algorithm}, ` +
  `nonce="7ypf/xlj9XXwfDPEoM4URrv/xwf94BcCAzFZH4GiTo0v", opaque="FQhe/qaU925kfnzjCev0ciny7QMkPqMAFRtzCUYo5tdS"`;

describe("Digest credentials", () => {
  it("signs each request, counting the nonce's uses", () => {
    const credential = digestCredential("Mufasa", "Circle of Life", challenge("MD5"));
    const first = credential?.("GET", "/dir/index.html") ?? "";
    const params = new Map(parseChallenges(first)[0]?.params);
    expect(params.get("nc")).toBe("00000001");
    expect(params.get("uri")).toBe("/dir/index.html");
    expect(params.get("opaque")).toBe("FQhe/qaU925kfnzjCev0ciny7QMkPqMAFRtzCUYo5tdS");
    const md5 = (v: string) => createHash("md5").update(v).digest("hex");
    const ha1 = md5("Mufasa:http-auth@example.org:Circle of Life");
    expect(params.get("response")).toBe(
      md5(
        `${ha1}:${params.get("nonce")}:00000001:${params.get("cnonce")}:auth:${md5("GET:/dir/index.html")}`,
      ),
    );
    expect(credential?.("GET", "/dir/index.html")).toContain("nc=00000002");
    expect(
      digestCredential("Mufasa", "Circle of Life", challenge("SHA-256"))?.("GET", "/"),
    ).toMatch(/response="[0-9a-f]{64}"/);
  });

  it("reads several challenges, quoted commas and escapes", () => {
    const value = `Basic realm="a, b", Digest realm="c", nonce="n\\"1", qop=auth-int`;
    expect(parseChallenges(value).map((c) => [c.scheme, Object.fromEntries(c.params)])).toEqual([
      ["basic", { realm: "a, b" }],
      ["digest", { realm: "c", nonce: 'n"1', qop: "auth-int" }],
    ]);
    // auth-int alone would sign every body.
    expect(digestCredential("alice", "secret", value)).toBeUndefined();
  });

  it("prefers Digest, sends Basic only where offered", () => {
    const answer = (status: number, challenge?: string) =>
      new Response(null, {
        status,
        headers: challenge ? { "WWW-Authenticate": challenge } : {},
      });
    const scheme = (response: Response) =>
      negotiate("alice", "secret", response)?.("GET", "/").split(" ")[0];
    expect(scheme(answer(401, `Basic realm="x", Digest realm="x", nonce="n", qop=auth`))).toBe(
      "Digest",
    );
    expect(scheme(answer(401, `Basic realm="x"`))).toBe("Basic");
    expect(scheme(answer(401))).toBe("Basic");
    expect(scheme(answer(207))).toBe("Basic");
    expect(scheme(answer(401, `Digest realm="x", nonce="n", qop=auth-int`))).toBeUndefined();
    expect(scheme(answer(404))).toBeUndefined();
  });
});
