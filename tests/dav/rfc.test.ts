import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearCachedDavSessions, createDavSession } from "@/dav/internal";

const book = "http://localhost:3000/dav/books/default/";
const href = `${book}a%20b.vcf`;
const card = "BEGIN:VCARD\r\nVERSION:3.0\r\nUID:test\r\nFN:Test\r\nEND:VCARD\r\n";
const multistatus = (body: string) =>
  `<x:multistatus xmlns:x="DAV:" xmlns:c="urn:ietf:params:xml:ns:carddav">${body}</x:multistatus>`;
const prop = (path: string, properties: string) =>
  `<x:response><x:href>${path}</x:href><x:propstat><x:prop>${properties}</x:prop><x:status>HTTP/1.1 200 OK</x:status></x:propstat></x:response>`;
const xmlResponse = (body: string) =>
  new Response(multistatus(body), {
    status: 207,
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
const requests: Request[] = [];
let replies: Response[] = [];

beforeEach(() => {
  clearCachedDavSessions();
  requests.length = 0;
  replies = [
    xmlResponse(
      prop(
        "/",
        "<x:current-user-principal><x:href>/principals/alice/</x:href></x:current-user-principal>",
      ),
    ),
    xmlResponse(
      prop(
        "/principals/alice/",
        "<c:addressbook-home-set><x:href>/books/</x:href></c:addressbook-home-set>",
      ),
    ),
  ];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push(new Request(input, init));
      const reply = replies.shift();
      if (!reply) throw new Error("Unexpected DAV request");
      return reply;
    }),
  );
});
afterEach(() => {
  clearCachedDavSessions();
  vi.unstubAllGlobals();
});
const session = () => createDavSession({ username: "alice" });
function request(index: number): Request {
  const value = requests[index];
  if (!value) throw new Error(`Missing request ${index}`);
  return value;
}
async function document(index: number) {
  return new DOMParser().parseFromString(await request(index).text(), "application/xml");
}

describe("Selected DAV wire requirements", () => {
  it("RFC 6764 §6, RFC 5397 §3 and RFC 6352 §7.1.1: discovers principal and addressbook home with Depth 0", async () => {
    await session();
    expect(
      requests.map((r) => [new URL(r.url).pathname, r.method, r.headers.get("Depth")]),
    ).toEqual([
      ["/dav/.well-known/carddav", "PROPFIND", "0"],
      ["/dav/principals/alice/", "PROPFIND", "0"],
    ]);
    expect(
      (await document(0)).getElementsByTagNameNS("DAV:", "current-user-principal"),
    ).toHaveLength(1);
    expect(
      (await document(1)).getElementsByTagNameNS(
        "urn:ietf:params:xml:ns:carddav",
        "addressbook-home-set",
      ),
    ).toHaveLength(1);
  });

  it("RFC 4918 §9.1 and §14.24: lists members with Depth 1 and DAV properties", async () => {
    const client = await session();
    replies.push(
      xmlResponse(
        prop("/books/default/", "<x:resourcetype><x:collection/></x:resourcetype>") +
          prop(
            "/books/default/a%20b.vcf",
            "<x:getetag>&quot;v1&quot;</x:getetag><x:resourcetype/>",
          ),
      ),
    );
    expect(await client.listMembers(book)).toEqual([{ href, etag: '"v1"' }]);
    expect(request(2).headers.get("Depth")).toBe("1");
    const doc = await document(2);
    expect(doc.documentElement.namespaceURI).toBe("DAV:");
    expect(doc.documentElement.localName).toBe("propfind");
    expect(doc.getElementsByTagNameNS("DAV:", "getetag")).toHaveLength(1);
    expect(doc.getElementsByTagNameNS("DAV:", "resourcetype")).toHaveLength(1);
  });

  it("RFC 6352 §8.7 and RFC 4918 §8.3: multiget preserves encoded hrefs and requests address-data", async () => {
    const client = await session();
    replies.push(
      xmlResponse(
        prop(
          "/books/default/a%20b.vcf",
          `<x:getetag>&quot;v1&quot;</x:getetag><c:address-data><![CDATA[${card}]]></c:address-data>`,
        ),
      ),
    );
    expect(await client.fetchCard(href)).toEqual({ etag: '"v1"', vcardText: card });
    expect(request(2).method).toBe("REPORT");
    expect(request(2).headers.get("Depth")).toBe("0");
    const doc = await document(2);
    expect(doc.documentElement.namespaceURI).toBe("urn:ietf:params:xml:ns:carddav");
    expect(doc.documentElement.localName).toBe("addressbook-multiget");
    expect(doc.getElementsByTagNameNS("DAV:", "href")[0]?.textContent).toBe(
      "/books/default/a%20b.vcf",
    );
    expect(doc.getElementsByTagNameNS("DAV:", "getetag")).toHaveLength(1);
    expect(
      doc.getElementsByTagNameNS("urn:ietf:params:xml:ns:carddav", "address-data"),
    ).toHaveLength(1);
  });

  it.each(["x", "dav"])(
    "RFC 4918 §13 and §14.17: reads CDATA ETags with prefix %s and ignores failed propstats",
    async (prefix) => {
      const client = await session();
      const body = prop(
        "/books/default/a%20b.vcf",
        `<x:getetag><![CDATA["v2"]]></x:getetag><c:address-data><![CDATA[${card}]]></c:address-data>`,
      ).replace(
        "</x:response>",
        "<x:propstat><x:prop><x:getetag>wrong</x:getetag></x:prop><x:status>HTTP/1.1 404 Not Found</x:status></x:propstat></x:response>",
      );
      replies.push(
        new Response(
          multistatus(body).replaceAll("x:", `${prefix}:`).replace("xmlns:x=", `xmlns:${prefix}=`),
          { status: 207, headers: { "Content-Type": "application/xml" } },
        ),
      );
      expect(await client.fetchCard(href)).toEqual({ etag: '"v2"', vcardText: card });
    },
  );

  it("RFC 6352 §8.7.1: handles a per-resource 404 in a multiget", async () => {
    const client = await session();
    replies.push(
      xmlResponse(
        "<x:response><x:href>/books/default/a%20b.vcf</x:href><x:status>HTTP/1.1 404 Not Found</x:status></x:response>",
      ),
    );
    await expect(client.fetchCard(href)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(requests).toHaveLength(3);
  });

  it.each(["update", "create", "delete"] as const)(
    "RFC 9110 §13.1.1, §13.1.2 and §15.5.13: conditional %s reports 412 without retry",
    async (operation) => {
      const client = await session();
      replies.push(new Response(null, { status: 412 }));
      const action =
        operation === "update"
          ? client.updateCard(href, '"v1"', card)
          : operation === "create"
            ? client.createCard(href, card)
            : client.deleteCard(href, '"v1"');
      await expect(action).rejects.toMatchObject({ code: "CONFLICT" });
      expect(requests).toHaveLength(3);
      expect(request(2).method).toBe(operation === "delete" ? "DELETE" : "PUT");
      expect(request(2).headers.get(operation === "create" ? "If-None-Match" : "If-Match")).toBe(
        operation === "create" ? "*" : '"v1"',
      );
      if (operation !== "delete") {
        expect(request(2).headers.get("Content-Type")).toBe("text/vcard; charset=utf-8");
        expect(await request(2).text()).toBe(card);
      }
    },
  );
});
