/**
 * Tests for the shortcut gates in src/lib/shortcuts.ts.
 */
import { afterEach, describe, expect, it } from "vitest";
import { isDialogOpen, isInMenu, isPlainKey, isTyping } from "@/lib/shortcuts";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("isPlainKey", () => {
  it("takes a bare key and a shifted one", () => {
    expect(isPlainKey(new KeyboardEvent("keydown", { key: "n" }))).toBe(true);
    expect(isPlainKey(new KeyboardEvent("keydown", { key: "?", shiftKey: true }))).toBe(true);
  });

  it("refuses Ctrl, ⌘ and Alt", () => {
    expect(isPlainKey(new KeyboardEvent("keydown", { key: "n", ctrlKey: true }))).toBe(false);
    expect(isPlainKey(new KeyboardEvent("keydown", { key: "n", metaKey: true }))).toBe(false);
    expect(isPlainKey(new KeyboardEvent("keydown", { key: "n", altKey: true }))).toBe(false);
  });

  it("takes AltGr, which Windows reports as Ctrl+Alt", () => {
    const event = new KeyboardEvent("keydown", {
      key: "/",
      ctrlKey: true,
      altKey: true,
      modifierAltGraph: true,
    } as KeyboardEventInit);
    expect(isPlainKey(event)).toBe(true);
  });
});

describe("isTyping", () => {
  it("is true in fields only, not on a button", () => {
    document.body.innerHTML =
      '<input id="i"><textarea id="t"></textarea><select id="s"></select><button id="b"></button>';
    for (const id of ["i", "t", "s"]) expect(isTyping(document.getElementById(id))).toBe(true);
    expect(isTyping(document.getElementById("b"))).toBe(false);
    expect(isTyping(null)).toBe(false);
  });
});

describe("isDialogOpen", () => {
  it("sees a modal dialog", () => {
    expect(isDialogOpen()).toBe(false);
    document.body.innerHTML = '<div role="dialog" aria-modal="true"></div>';
    expect(isDialogOpen()).toBe(true);
  });
});

describe("isInMenu", () => {
  it("is true in a menu and on the button that opens it", () => {
    document.body.innerHTML =
      '<button id="t" aria-haspopup="menu"></button><div role="menu"><button id="m"></button></div><button id="b"></button>';
    expect(isInMenu(document.getElementById("t"))).toBe(true);
    expect(isInMenu(document.getElementById("m"))).toBe(true);
    expect(isInMenu(document.getElementById("b"))).toBe(false);
  });
});
