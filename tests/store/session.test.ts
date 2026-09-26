/**
 * Tests for src/store/session.ts — Zustand session store.
 *
 * The DAV session cache clear is tested by mocking `@/dav`'s
 * `clearCachedDavSessions`.
 */
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { DavAddressBook, DavAuth } from "@/dav/types";

// Mock the dav module before importing the store.
vi.mock("@/dav", () => {
  const clearCachedDavSessions = vi.fn();
  return { clearCachedDavSessions, __esModule: true };
});

import { useAuth, useIsLoggedIn, useSelectedBook, useSessionStore } from "@/store/session";

const mockAuth: DavAuth = {
  username: "alice",
  password: "secret",
};

const mockBook: DavAddressBook = {
  href: "/dav/books/default/",
  displayName: "Default Address Book",
};

// Grab the mocked dav module so we can assert on clearCachedDavSessions.
const { clearCachedDavSessions } = await import("@/dav");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Reset store state between tests. */
function resetStore(): void {
  useSessionStore.setState({ auth: null, selectedBook: null });
  vi.clearAllMocks();
}

// ---------------------------------------------------------------------------
// login
// ---------------------------------------------------------------------------

describe("login", () => {
  it("sets auth and clears selectedBook", () => {
    resetStore();
    // Start with something selected to prove it gets cleared.
    useSessionStore.getState().selectBook(mockBook);

    useSessionStore.getState().login(mockAuth);

    const state = useSessionStore.getState();
    expect(state.auth).toEqual(mockAuth);
    expect(state.selectedBook).toBeNull();
  });

  it("writes nothing to browser storage", () => {
    resetStore();
    localStorage.clear();
    sessionStorage.clear();

    useSessionStore.getState().login(mockAuth);

    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// logout
// ---------------------------------------------------------------------------

describe("logout", () => {
  it("clears auth and selectedBook", () => {
    resetStore();
    useSessionStore.getState().login(mockAuth);
    useSessionStore.getState().selectBook(mockBook);

    useSessionStore.getState().logout();

    const state = useSessionStore.getState();
    expect(state.auth).toBeNull();
    expect(state.selectedBook).toBeNull();
  });

  it("calls clearCachedDavSessions on the dav module", () => {
    resetStore();
    useSessionStore.getState().login(mockAuth);

    useSessionStore.getState().logout();

    expect(clearCachedDavSessions).toHaveBeenCalledTimes(1);
  });

  it("is safe to call when already logged out", () => {
    resetStore();

    // Should not throw.
    expect(() => useSessionStore.getState().logout()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// selectBook
// ---------------------------------------------------------------------------

describe("selectBook", () => {
  it("sets selectedBook", () => {
    resetStore();

    useSessionStore.getState().selectBook(mockBook);

    expect(useSessionStore.getState().selectedBook).toEqual(mockBook);
  });

  it("sets selectedBook to null when called with null", () => {
    resetStore();
    useSessionStore.getState().selectBook(mockBook);

    useSessionStore.getState().selectBook(null);

    expect(useSessionStore.getState().selectedBook).toBeNull();
  });

  it("can be called before login", () => {
    resetStore();

    useSessionStore.getState().selectBook(mockBook);

    expect(useSessionStore.getState().selectedBook).toEqual(mockBook);
  });
});

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

describe("useIsLoggedIn", () => {
  it("returns false when auth is null", () => {
    resetStore();

    const { result } = renderHook(() => useIsLoggedIn());

    expect(result.current).toBe(false);
  });

  it("returns true when auth is set", () => {
    resetStore();
    useSessionStore.setState({ auth: mockAuth });

    const { result } = renderHook(() => useIsLoggedIn());

    expect(result.current).toBe(true);
  });
});

describe("useAuth", () => {
  it("returns null when not logged in", () => {
    resetStore();

    const { result } = renderHook(() => useAuth());

    expect(result.current).toBeNull();
  });

  it("returns the current credentials", () => {
    resetStore();
    useSessionStore.setState({ auth: mockAuth });

    const { result } = renderHook(() => useAuth());

    expect(result.current).toEqual(mockAuth);
  });
});

describe("useSelectedBook", () => {
  it("returns null when no book selected", () => {
    resetStore();

    const { result } = renderHook(() => useSelectedBook());

    expect(result.current).toBeNull();
  });

  it("returns the selected book", () => {
    resetStore();
    useSessionStore.setState({ selectedBook: mockBook });

    const { result } = renderHook(() => useSelectedBook());

    expect(result.current).toEqual(mockBook);
  });
});
