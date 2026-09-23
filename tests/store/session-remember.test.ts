/**
 * Tests for the session store's forgot-server behaviour: signing in with
 * "remember server" unchecked must REMOVE a previously persisted
 * natel:serverUrl key, so unchecking really forgets.
 *
 * New file on purpose — tests/store/session.test.ts is not modified.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DavAuth } from "@/dav/types";

vi.mock("@/dav", () => ({
  clearCachedDavSessions: vi.fn(),
  __esModule: true,
}));

import { useSessionStore } from "@/store/session";

const AUTH: DavAuth = {
  serverUrl: "https://dav.example.com",
  username: "alice",
  password: "secret",
};

const KEY = "natel:serverUrl";

beforeEach(() => {
  localStorage.clear();
  useSessionStore.setState({ auth: null, selectedBook: null, serverUrl: "" });
  vi.clearAllMocks();
});

describe("login with rememberServer: false", () => {
  it("removes a previously persisted server URL", () => {
    localStorage.setItem(KEY, "https://old.example.com");

    useSessionStore.getState().login(AUTH, { rememberServer: false });

    expect(localStorage.getItem(KEY)).toBeNull();
    // The URL still lives in memory for the session.
    expect(useSessionStore.getState().serverUrl).toBe(AUTH.serverUrl);
  });

  it("keeps localStorage empty when nothing was persisted", () => {
    useSessionStore.getState().login(AUTH, { rememberServer: false });

    expect(localStorage.length).toBe(0);
  });

  it("is silent when localStorage.removeItem throws", () => {
    localStorage.setItem(KEY, "https://old.example.com");
    const originalRemoveItem = Storage.prototype.removeItem;
    Storage.prototype.removeItem = vi.fn(() => {
      throw new Error("storage unavailable");
    });

    expect(() => useSessionStore.getState().login(AUTH, { rememberServer: false })).not.toThrow();

    Storage.prototype.removeItem = originalRemoveItem;
  });
});

describe("login persistence from the checked side", () => {
  it("persists the new URL when rememberServer is true", () => {
    useSessionStore.getState().login(AUTH, { rememberServer: true });

    expect(localStorage.getItem(KEY)).toBe(AUTH.serverUrl);
  });

  it("persists by default (no options — the checkbox is pre-checked)", () => {
    useSessionStore.getState().login(AUTH);

    expect(localStorage.getItem(KEY)).toBe(AUTH.serverUrl);
  });
});
