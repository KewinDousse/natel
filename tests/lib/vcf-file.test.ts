import { describe, expect, it } from "vitest";
import { exportFileName } from "@/lib/vcf-file";

describe("exportFileName", () => {
  it("names the file after the book", () => {
    expect(exportFileName({ displayName: "Contacts", href: "/dav/u/c/" })).toBe("Contacts.vcf");
  });

  it("falls back to the last segment of the href", () => {
    expect(exportFileName({ displayName: " ", href: "/dav/u/famille%20proche/" })).toBe(
      "famille proche.vcf",
    );
  });

  it("trims the dots and spaces Windows refuses at the ends", () => {
    expect(exportFileName({ displayName: "..", href: "/x/" })).toBe("contacts.vcf");
    expect(exportFileName({ displayName: " Amis. ", href: "/x/" })).toBe("Amis.vcf");
  });

  it("replaces characters file systems refuse", () => {
    expect(exportFileName({ displayName: 'Travail: "A/B"?', href: "/x/" })).toBe(
      "Travail_ _A_B__.vcf",
    );
  });
});
