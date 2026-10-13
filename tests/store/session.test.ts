/**
 * Tests for src/store/session.ts — Zustand session store.
 *
 * `@/dav` is mocked: the DAV session cache clear and the calls to
 * natel-session's /session are asserted on the mocks.
 */
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { DavAddressBook, DavAuth } from "@/dav/types";

// Mock the dav module before importing the store.
vi.mock("@/dav", () => {
  const clearCachedDavSessions = vi.fn();
  const closeSession = vi.fn(async () => true);
  const currentSession = vi.fn(async (): Promise<DavAuth | null> => null);
  return { clearCachedDavSessions, closeSession, currentSession, __esModule: true };
});

import { useAuth, useIsLoggedIn, useSelectedBook, useSessionStore } from "@/store/session";

const mockAuth: DavAuth = {
  username: "alice",
};

const mockBook: DavAddressBook = {
  href: "/dav/books/default/",
  displayName: "Default Address Book",
};

// Grab the mocked dav module so we can assert on its calls.
const { clearCachedDavSessions, closeSession, currentSession } = await import("@/dav");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Reset store state between tests. */
function resetStore(): void {
  useSessionStore.setState({ auth: null, selectedBook: null, signOutFailed: false });
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
  it("clears auth and selectedBook", async () => {
    resetStore();
    useSessionStore.getState().login(mockAuth);
    useSessionStore.getState().selectBook(mockBook);

    await useSessionStore.getState().logout();

    const state = useSessionStore.getState();
    expect(state.auth).toBeNull();
    expect(state.selectedBook).toBeNull();
  });

  it("calls clearCachedDavSessions on the dav module", async () => {
    resetStore();
    useSessionStore.getState().login(mockAuth);

    await useSessionStore.getState().logout();

    expect(clearCachedDavSessions).toHaveBeenCalledTimes(1);
  });

  it("ends the session on the server", async () => {
    resetStore();
    useSessionStore.getState().login(mockAuth);

    await useSessionStore.getState().logout();

    expect(closeSession).toHaveBeenCalledTimes(1);
  });

  it("is safe to call when already logged out", async () => {
    resetStore();

    await expect(useSessionStore.getState().logout()).resolves.toBe(true);
  });

  // A reload would sign the user back in: the app must not look signed out.
  it("keeps the user signed in when the server doesn't confirm it", async () => {
    resetStore();
    useSessionStore.getState().login(mockAuth);
    useSessionStore.getState().selectBook(mockBook);
    vi.mocked(closeSession).mockResolvedValueOnce(false);

    expect(await useSessionStore.getState().logout()).toBe(false);

    const state = useSessionStore.getState();
    expect(state.auth).toEqual(mockAuth);
    expect(state.selectedBook).toEqual(mockBook);
    expect(state.signOutFailed).toBe(true);
    expect(clearCachedDavSessions).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// restore
// ---------------------------------------------------------------------------

describe("restore", () => {
  it("signs in from the browser's session", async () => {
    resetStore();
    vi.mocked(currentSession).mockResolvedValueOnce(mockAuth);

    await useSessionStore.getState().restore();

    expect(useSessionStore.getState().auth).toEqual(mockAuth);
  });

  it("stays signed out without a session", async () => {
    resetStore();

    await useSessionStore.getState().restore();

    expect(useSessionStore.getState().auth).toBeNull();
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

  it("returns the signed-in user", () => {
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
