/**
 * Zustand session store — credentials and UI state, in memory only.
 *
 * Invariant 3: nothing here is ever written to localStorage, sessionStorage,
 * cookies, or IndexedDB. A reload logs the user out.
 *
 * On logout the in-memory DAV session cache is also cleared via
 * `clearCachedDavSessions()`, exported from `@/dav`.
 */
import { create } from "zustand";
import { clearCachedDavSessions } from "@/dav";
import type { DavAddressBook, DavAuth } from "@/dav/types";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export interface SessionState {
  /** Current credentials, or null when logged out. */
  auth: DavAuth | null;
  /** Currently selected address book, or null when none selected. */
  selectedBook: DavAddressBook | null;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export interface SessionActions {
  /** Store credentials in memory. */
  login: (auth: DavAuth) => void;
  /** Clear credentials, selected book, and the DAV in-memory session cache. */
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

  login: (auth: DavAuth) => {
    set({ auth, selectedBook: null });
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
