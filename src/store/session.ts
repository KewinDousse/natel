/**
 * Zustand session store — credentials and UI state, in memory only.
 *
 * Invariant 3: credentials are never persisted to localStorage, sessionStorage,
 * cookies, or IndexedDB. Only `serverUrl` (without username/password) is stored
 * in localStorage so the field survives page reloads.
 *
 * On logout the in-memory DAV session cache is also cleared via
 * `clearCachedDavSessions()`, exported from `@/dav`.
 */
import { create } from "zustand";
import { clearCachedDavSessions } from "@/dav";
import type { DavAddressBook, DavAuth } from "@/dav/types";

/** localStorage key for the server URL. */
const STORAGE_KEY_SERVER_URL = "natel:serverUrl";

/**
 * Read the persisted server URL from localStorage.
 * Returns `""` if missing or unavailable (SSR, private browsing…).
 *
 * Exported via __testing for unit tests.
 */
function readPersistedServerUrl(): string {
  try {
    return localStorage.getItem(STORAGE_KEY_SERVER_URL) ?? "";
  } catch {
    return "";
  }
}

/**
 * Write the server URL to localStorage (best-effort, silent on failure).
 * The URL alone is not a credential, so this is safe under invariant 3.
 */
function persistServerUrl(url: string): void {
  try {
    localStorage.setItem(STORAGE_KEY_SERVER_URL, url);
  } catch {
    // Silently ignore — storage may be unavailable.
  }
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export interface SessionState {
  /** Current credentials, or null when logged out. */
  auth: DavAuth | null;
  /** Currently selected address book, or null when none selected. */
  selectedBook: DavAddressBook | null;
  /**
   * Server URL carried across page reloads (persisted in localStorage).
   * The user can type it once; the field is pre-filled on next visit.
   */
  serverUrl: string;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export interface SessionActions {
  /**
   * Store credentials in memory and persist the server URL.
   * The password is never written to disk.
   */
  login: (auth: DavAuth) => void;
  /**
   * Clear credentials, selected book, and the DAV in-memory session cache.
   * The persisted server URL stays so the field is pre-filled on next login.
   */
  logout: () => void;
  /** Select or deselect the active address book. */
  selectBook: (book: DavAddressBook | null) => void;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export type SessionStore = SessionState & SessionActions;

export const useSessionStore = create<SessionStore>((set) => ({
  auth: null,
  selectedBook: null,
  serverUrl: readPersistedServerUrl(),

  login: (auth: DavAuth) => {
    persistServerUrl(auth.serverUrl);
    set({ auth, selectedBook: null, serverUrl: auth.serverUrl });
  },

  logout: () => {
    clearCachedDavSessions();
    set({ auth: null, selectedBook: null });
  },

  selectBook: (book: DavAddressBook | null) => {
    set({ selectedBook: book });
  },
}));

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

/** True when a user is authenticated (auth !== null). */
export function useIsLoggedIn(): boolean {
  return useSessionStore((s) => s.auth !== null);
}

/** The current DavAuth, or null when logged out. */
export function useAuth(): DavAuth | null {
  return useSessionStore((s) => s.auth);
}

/** The currently selected address book, or null. */
export function useSelectedBook(): DavAddressBook | null {
  return useSessionStore((s) => s.selectedBook);
}

/** The last-known server URL (pre-filled for the login form). */
export function useServerUrl(): string {
  return useSessionStore((s) => s.serverUrl);
}

// ---------------------------------------------------------------------------
// Test-only exports
// ---------------------------------------------------------------------------

/** Exported for unit testing only — not part of the public API. */
export const __testing = {
  STORAGE_KEY_SERVER_URL,
  readPersistedServerUrl,
  persistServerUrl,
};
