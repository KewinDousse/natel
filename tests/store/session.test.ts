/**
 * Tests for src/store/session.ts — Zustand session store.
 *
 * The DAV session cache clear is tested by mocking `@/dav/internal`'s
 * `__testing.clearSessionCache`.
 */
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { DavAddressBook, DavAuth } from "@/dav/types";

// Mock the internal module before importing the store.
vi.mock("@/dav/internal", () => {
  const clearSessionCache = vi.fn();
  return {
    __testing: { clearSessionCache },
    __esModule: true,
  };
});

import {
  __testing as storeTesting,
  useAuth,
  useIsLoggedIn,
  useSelectedBook,
  useServerUrl,
  useSessionStore,
} from "@/store/session";

const mockAuth: DavAuth = {
  serverUrl: "https://dav.example.com",
  username: "alice",
  password: "secret",
};

const mockBook: DavAddressBook = {
  href: "/dav/books/default/",
  displayName: "Default Address Book",
};

// Grab the mocked dav/internal module so we can assert on clearSessionCache.
const { __testing: davTesting } = await import("@/dav/internal");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Reset store state between tests. */
function resetStore(): void {
  useSessionStore.setState({ auth: null, selectedBook: null, serverUrl: "" });
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

  it("updates serverUrl in state", () => {
    resetStore();

    useSessionStore.getState().login(mockAuth);

    expect(useSessionStore.getState().serverUrl).toBe("https://dav.example.com");
  });

  it("persists serverUrl to localStorage", () => {
    resetStore();

    useSessionStore.getState().login(mockAuth);

    expect(localStorage.getItem("natel:serverUrl")).toBe("https://dav.example.com");
  });

  it("does not persist password to localStorage", () => {
    resetStore();

    useSessionStore.getState().login(mockAuth);

    // localStorage should only contain the serverUrl key.
    expect(localStorage.length).toBe(1);
    const stored = localStorage.getItem("natel:serverUrl");
    expect(stored).toBe("https://dav.example.com");
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

  it("calls clearSessionCache on the dav internal module", () => {
    resetStore();
    useSessionStore.getState().login(mockAuth);

    useSessionStore.getState().logout();

    expect(davTesting.clearSessionCache).toHaveBeenCalledTimes(1);
  });

  it("keeps serverUrl unchanged (pre-fills next login)", () => {
    resetStore();
    useSessionStore.getState().login(mockAuth);

    useSessionStore.getState().logout();

    expect(useSessionStore.getState().serverUrl).toBe("https://dav.example.com");
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

describe("useServerUrl", () => {
  it("returns empty string when nothing persisted", () => {
    resetStore();

    const { result } = renderHook(() => useServerUrl());

    expect(result.current).toBe("");
  });

  it("returns the serverUrl from state", () => {
    resetStore();
    useSessionStore.setState({ serverUrl: "https://persisted.example.com" });

    const { result } = renderHook(() => useServerUrl());

    expect(result.current).toBe("https://persisted.example.com");
  });
});

// ---------------------------------------------------------------------------
// Server URL persistence helpers
// ---------------------------------------------------------------------------

describe("readPersistedServerUrl", () => {
  it("returns persisted value from localStorage", () => {
    localStorage.setItem("natel:serverUrl", "https://reload.example.com");

    expect(storeTesting.readPersistedServerUrl()).toBe("https://reload.example.com");
  });

  it("returns empty string when no value in localStorage", () => {
    localStorage.removeItem("natel:serverUrl");

    expect(storeTesting.readPersistedServerUrl()).toBe("");
  });

  it("returns empty string on localStorage error", () => {
    // Simulate a broken localStorage access by removing the key after
    // spying on getItem. Vitest's jsdom doesn't throw, but we can test
    // the catch path by forcing a getItem that throws.
    // Approach: mock the global localStorage.getItem to throw.
    const originalGetItem = Storage.prototype.getItem;
    Storage.prototype.getItem = vi.fn(() => {
      throw new Error("storage unavailable");
    });

    expect(storeTesting.readPersistedServerUrl()).toBe("");

    Storage.prototype.getItem = originalGetItem;
  });
});

describe("persistServerUrl", () => {
  it("writes to localStorage", () => {
    localStorage.removeItem("natel:serverUrl");

    storeTesting.persistServerUrl("https://saved.example.com");

    expect(localStorage.getItem("natel:serverUrl")).toBe("https://saved.example.com");
  });

  it("does not throw on localStorage error", () => {
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = vi.fn(() => {
      throw new Error("storage full");
    });

    expect(() => storeTesting.persistServerUrl("https://any.example.com")).not.toThrow();

    Storage.prototype.setItem = originalSetItem;
  });
});
