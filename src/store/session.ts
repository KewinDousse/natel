/**
 * Zustand session store — the signed-in user and UI state, in memory only.
 *
 * Invariant 3: the password is never held here, nor written to
 * localStorage, sessionStorage, cookies, or IndexedDB. natel-session keeps
 * it on the server side of the session cookie (ADR 032); a reload restores
 * the user from that session.
 *
 * On logout the in-memory DAV session cache is also cleared via
 * `clearCachedDavSessions()`, exported from `@/dav`, and the session ends on
 * the server.
 */
import { create } from "zustand";
import { clearCachedDavSessions, closeSession, currentSession } from "@/dav";
import type { DavAddressBook, DavAuth } from "@/dav/types";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export interface SessionState {
  /** The signed-in user, or null when logged out. */
  auth: DavAuth | null;
  /** Currently selected address book, or null when none selected. */
  selectedBook: DavAddressBook | null;
  /** The last sign-out wasn't confirmed by the server: the user is still signed in. */
  signOutFailed: boolean;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export interface SessionActions {
  /** Sign the user in, once their session is open. */
  login: (auth: DavAuth) => void;
  /** Sign in from the session this browser already has, if any. */
  restore: () => Promise<void>;
  /**
   * End the session, then clear the user, selected book and DAV session
   * cache. When the server doesn't confirm it, nothing is cleared, since a
   * reload would sign the user back in: false, and signOutFailed is set.
   */
  logout: () => Promise<boolean>;
  /** Select or deselect the active address book. */
  selectBook: (book: DavAddressBook | null) => void;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export type SessionStore = SessionState & SessionActions;

export const useSessionStore = create<SessionStore>((set, get) => ({
  auth: null,
  selectedBook: null,
  signOutFailed: false,

  login: (auth: DavAuth) => {
    set({ auth, selectedBook: null });
  },

  restore: async () => {
    const auth = await currentSession();
    if (auth) get().login(auth);
  },

  logout: async () => {
    if (!(await closeSession())) {
      set({ signOutFailed: true });
      return false;
    }
    clearCachedDavSessions();
    set({ auth: null, selectedBook: null, signOutFailed: false });
    return true;
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
