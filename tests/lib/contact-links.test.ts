import { describe, expect, it } from "vitest";
import { isUri, isWebUrl, valueHref, websiteUri } from "@/lib/contact-links";

describe("isWebUrl", () => {
  it("accepts http and https addresses", () => {
    expect(isWebUrl("https://example.org/a")).toBe(true);
    expect(isWebUrl("http://example.org")).toBe(true);
  });

  it("refuses any other scheme, also behind the whitespace the URL parser strips", () => {
    expect(isWebUrl("ms-msdt:/id PCWDiagnostic")).toBe(false);
    expect(isWebUrl("javascript:alert(1)")).toBe(false);
    expect(isWebUrl(" javascript:alert(1)")).toBe(false);
    expect(isWebUrl("\tjavascript:alert(1)")).toBe(false);
    expect(isWebUrl("data:text/html,<p>")).toBe(false);
  });

  it("refuses what isn't a URL", () => {
    expect(isWebUrl("example.org")).toBe(false);
    expect(isWebUrl("")).toBe(false);
  });
});

describe("isUri", () => {
  it("accepts a URI of any scheme", () => {
    expect(isUri("https://example.org")).toBe(true);
    expect(isUri("fb://profile/0123456789")).toBe(true);
    expect(isUri("xmpp:ada@example.org")).toBe(true);
  });

  it("refuses a value without a scheme, or with whitespace", () => {
    expect(isUri("example.org")).toBe(false);
    expect(isUri("not-a-url")).toBe(false);
    expect(isUri(" https://example.org")).toBe(false);
    expect(isUri("https://example.org/a b")).toBe(false);
    expect(isUri("1fb://profile")).toBe(false);
    expect(isUri("fb:")).toBe(false);
  });

  it("refuses an http or https URL without a host", () => {
    expect(isUri("https://")).toBe(false);
    expect(isUri("http://")).toBe(false);
  });
});

describe("websiteUri", () => {
  it("gives a host typed without a scheme https", () => {
    expect(websiteUri("website.example")).toBe("https://website.example");
    expect(websiteUri("www.website.example/a?b#c")).toBe("https://www.website.example/a?b#c");
    expect(websiteUri("website.example:8080")).toBe("https://website.example:8080");
  });

  it("keeps a URI, and what isn't a host", () => {
    expect(websiteUri("http://website.example")).toBe("http://website.example");
    expect(websiteUri("fb://profile/0123456789")).toBe("fb://profile/0123456789");
    expect(websiteUri("com.example.app:/open")).toBe("com.example.app:/open");
    expect(websiteUri("ada@website.example")).toBe("ada@website.example");
    expect(websiteUri("localhost")).toBe("localhost");
    expect(websiteUri("website.example ada")).toBe("website.example ada");
    expect(websiteUri("website..example")).toBe("website..example");
  });

  it("reads a long run of dots quickly", () => {
    const start = performance.now();
    websiteUri(`${".".repeat(30000)} `);
    expect(performance.now() - start).toBeLessThan(100);
  });
});

describe("valueHref", () => {
  it("leaves an ordinary address or number as it is", () => {
    expect(valueHref("mailto", "katarina@noxus.example")).toBe("mailto:katarina@noxus.example");
    expect(valueHref("mailto", "jürgen@münchen.example")).toBe("mailto:jürgen@münchen.example");
    expect(valueHref("tel", "+41 79 000 00 01")).toBe("tel:+41 79 000 00 01");
    expect(valueHref("tel", "+41 21 000 00 00;ext=12")).toBe("tel:+41 21 000 00 00;ext=12");
    expect(valueHref("sms", "+41790000001")).toBe("sms:+41790000001");
  });

  it("encodes what the scheme would read as its own syntax", () => {
    expect(valueHref("mailto", "a@example.org?bcc=b@example.org&body=Hi")).toBe(
      "mailto:a@example.org%3Fbcc%3Db@example.org%26body%3DHi",
    );
    expect(valueHref("mailto", "a@example.org#x")).toBe("mailto:a@example.org%23x");
    expect(valueHref("sms", "+41790000001?body=Hi")).toBe("sms:+41790000001%3Fbody=Hi");
    expect(valueHref("tel", "*21#")).toBe("tel:*21%23");
    expect(valueHref("mailto", "a@example.org%0Abcc:b@example.org")).toBe(
      "mailto:a@example.org%250Abcc:b@example.org",
    );
  });
});
