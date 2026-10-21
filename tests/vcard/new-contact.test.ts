/** Tests for newContact() — the blank card behind the creation form. */

import { describe, expect, it } from "vitest";
import { newContact, serialise } from "@/vcard";

describe("newContact", () => {
  it("is a vCard 3.0 with a v4 UUID, not yet on the server", () => {
    const contact = newContact();

    expect(contact.href).toBe("");
    expect(contact.etag).toBe("");
    expect(contact.uid).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(serialise(contact)).toContain("VERSION:3.0");
  });

  it("gets a fresh UID each time", () => {
    expect(newContact().uid).not.toBe(newContact().uid);
  });

  it("starts with every editable field empty", () => {
    const { fields } = newContact();

    expect(fields.fn).toBe("");
    expect(fields.n.family).toBe("");
    expect(fields.n.given).toBe("");
    expect(fields.tel).toEqual([]);
    expect(fields.email).toEqual([]);
    expect(fields.adr).toEqual([]);
    expect(fields.bday).toBeNull();
  });
});
