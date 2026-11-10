/**
 * Tests for src/store/group-formats.ts — each book's group format, kept
 * under a hash (ADR 052).
 */
import { afterEach, describe, expect, it } from "vitest";
import { PREFERENCES_KEY } from "@/i18n/preferences";
import { bookFormatKey, useGroupFormats } from "@/store/group-formats";

const HREF = "https://dav.example.org/books/alice/perso/";

afterEach(() => {
  localStorage.clear();
  useGroupFormats.setState({ formats: {} });
});

describe("bookFormatKey", () => {
  it("is stable, and differs per account and per book", () => {
    expect(bookFormatKey("alice", HREF)).toBe(bookFormatKey("alice", HREF));
    expect(bookFormatKey("bob", HREF)).not.toBe(bookFormatKey("alice", HREF));
    expect(bookFormatKey("alice", `${HREF}x/`)).not.toBe(bookFormatKey("alice", HREF));
  });
});

describe("useGroupFormats", () => {
  it("stores a book's format without its username or address in plain text", () => {
    const key = bookFormatKey("alice", HREF);
    useGroupFormats.getState().setFormat(key, "categories");
    expect(useGroupFormats.getState().formats).toEqual({ [key]: "categories" });
    const stored = localStorage.getItem(PREFERENCES_KEY) ?? "";
    expect(JSON.parse(stored)).toEqual({ groupFormats: { [key]: "categories" } });
    expect(stored).not.toContain("alice");
    expect(stored).not.toContain("dav.example.org");
  });

  it("clears the format with null (Automatic)", () => {
    const key = bookFormatKey("alice", HREF);
    useGroupFormats.getState().setFormat(key, "cards");
    useGroupFormats.getState().setFormat(key, null);
    expect(useGroupFormats.getState().formats).toEqual({});
    expect(localStorage.getItem(PREFERENCES_KEY)).toBeNull();
  });
});
