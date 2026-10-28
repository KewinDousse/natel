/**
 * Tests for src/routes/login.tsx — the sign-in screen.
 *
 * Renders the real router (routeTree + memory history) so the beforeLoad
 * guards are exercised too. `@/dav` is mocked (real DavError kept) so the
 * session and the credential check never hit the network.
 */

import { QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DavError } from "@/dav";
import type { DavAddressBook, DavAuth, DavCredentials } from "@/dav/types";
import { I18nProvider } from "@/i18n/react";
import { createQueryClient } from "@/queries";
import { routeTree } from "@/routeTree.gen";
import { useSessionStore } from "@/store/session";

const { mockDiscoverAddressBooks, mockOpenSession, mockCloseSession } = vi.hoisted(() => ({
  mockDiscoverAddressBooks: vi.fn<(auth: DavAuth) => Promise<DavAddressBook[]>>(),
  mockOpenSession: vi.fn<(credentials: DavCredentials) => Promise<DavAuth>>(),
  mockCloseSession: vi.fn<() => Promise<boolean>>(),
}));

vi.mock("@/dav", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/dav")>();
  return {
    ...actual,
    discoverAddressBooks: mockDiscoverAddressBooks,
    openSession: mockOpenSession,
    closeSession: mockCloseSession,
  };
});

const CREDENTIALS = { username: "alice", password: "secret" };
const AUTH = { username: "alice" };

function setLanguage(lang: string) {
  Object.defineProperty(window.navigator, "language", {
    get: () => lang,
    configurable: true,
  });
  Object.defineProperty(window.navigator, "languages", {
    get: () => [lang],
    configurable: true,
  });
}

function renderApp(path: string) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  render(
    <QueryClientProvider client={createQueryClient()}>
      <I18nProvider>
        <RouterProvider router={router} />
      </I18nProvider>
    </QueryClientProvider>,
  );
  return router;
}

/** Fill both fields and submit the (French) form. */
async function submitLogin(overrides: Partial<typeof CREDENTIALS> = {}) {
  const user = userEvent.setup();
  const { username = "alice", password = "secret" } = overrides;
  await user.type(screen.getByLabelText("Nom d’utilisateur"), username);
  await user.type(screen.getByLabelText("Mot de passe"), password);
  await user.click(screen.getByRole("button", { name: "Se connecter" }));
  return user;
}

beforeEach(() => {
  setLanguage("fr-FR");
  localStorage.clear();
  useSessionStore.setState({ auth: null, selectedBook: null });
  vi.clearAllMocks();
  mockOpenSession.mockImplementation(async ({ username }) => ({ username }));
  mockCloseSession.mockResolvedValue(true);
});

// ---------------------------------------------------------------------------
// Rendering and locale
// ---------------------------------------------------------------------------

describe("rendering", () => {
  it("renders with French defaults", async () => {
    renderApp("/login");

    expect(await screen.findByRole("heading", { name: "Ouvrir le carnet" })).toBeTruthy();
    expect(screen.getByLabelText("Nom d’utilisateur")).toBeTruthy();
    expect(screen.getByLabelText("Mot de passe")).toBeTruthy();
    for (const select of screen.getAllByRole("combobox", { name: "Langue" })) {
      expect((select as HTMLSelectElement).value).toBe("browser");
    }
    expect(document.title).toBe("Se connecter · Natel");
    expect(document.documentElement.lang).toBe("fr");
  });

  it("asks only for credentials, never for a server", async () => {
    renderApp("/login");
    await screen.findByRole("heading", { name: "Ouvrir le carnet" });

    expect(screen.getAllByRole("textbox")).toHaveLength(1);
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(document.querySelector('input[type="url"]')).toBeNull();
  });

  it("switches to English, stores the choice and updates the title", async () => {
    renderApp("/login");
    await screen.findByRole("heading", { name: "Ouvrir le carnet" });

    const user = userEvent.setup();
    await user.selectOptions(screen.getAllByRole("combobox", { name: "Langue" })[0]!, "en");

    expect(await screen.findByRole("heading", { name: "Open your address book" })).toBeTruthy();
    for (const select of screen.getAllByRole("combobox", { name: "Language" })) {
      expect((select as HTMLSelectElement).value).toBe("en");
    }
    expect(localStorage.getItem("natel.preferences")).toBe('{"locale":"en"}');
    expect(document.title).toBe("Sign in · Natel");
    expect(document.documentElement.lang).toBe("en");
  });

  it("starts in the stored language", async () => {
    localStorage.setItem("natel.preferences", '{"locale":"en"}');
    renderApp("/login");
    expect(await screen.findByRole("heading", { name: "Open your address book" })).toBeTruthy();
  });
});

describe("unencrypted connection", () => {
  function setSecureContext(secure: boolean) {
    Object.defineProperty(window, "isSecureContext", { value: secure, configurable: true });
  }

  afterEach(() => {
    Reflect.deleteProperty(window, "isSecureContext");
  });

  it("warns that the password can be read when the page isn't served over HTTPS", async () => {
    setSecureContext(false);
    renderApp("/login");
    expect(
      await screen.findByText(
        "Cette connexion n’est pas chiffrée : votre mot de passe peut être lu sur le réseau.",
      ),
    ).toBeTruthy();
  });

  it("says nothing over HTTPS or on localhost", async () => {
    setSecureContext(true);
    renderApp("/login");
    await screen.findByRole("heading", { name: "Ouvrir le carnet" });
    expect(screen.queryByText(/pas chiffrée/)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

describe("validation", () => {
  it("validates on blur and blocks an empty submit", async () => {
    renderApp("/login");
    await screen.findByRole("heading", { name: "Ouvrir le carnet" });

    const user = userEvent.setup();
    const username = screen.getByLabelText("Nom d’utilisateur");

    // Blur the empty username field → required error appears.
    await user.click(username);
    await user.click(screen.getByLabelText("Mot de passe"));
    expect(await screen.findByText("Veuillez saisir votre nom d’utilisateur.")).toBeTruthy();
    expect(username.getAttribute("aria-invalid")).toBe("true");

    await user.click(screen.getByRole("button", { name: "Se connecter" }));
    expect(await screen.findByText("Veuillez saisir votre mot de passe.")).toBeTruthy();
    expect(mockDiscoverAddressBooks).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Submit
// ---------------------------------------------------------------------------

describe("submit", () => {
  it("shows the connection error box when the server can't be reached", async () => {
    mockOpenSession.mockRejectedValue(new DavError("boom", "NETWORK"));
    renderApp("/login");
    await screen.findByRole("heading", { name: "Ouvrir le carnet" });

    await submitLogin();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Impossible de joindre le serveur de contacts.");
    expect(alert.textContent).not.toContain("CORS");
    expect(mockDiscoverAddressBooks).not.toHaveBeenCalled();
  });

  it("shows an invalid-credentials message on auth failure", async () => {
    mockOpenSession.mockRejectedValue(new DavError("bad credentials", "AUTH"));
    renderApp("/login");
    await screen.findByRole("heading", { name: "Ouvrir le carnet" });

    await submitLogin();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Nom d’utilisateur ou mot de passe incorrect.");
  });

  // A reload would otherwise restore a session the sign-in reported as failed.
  it("ends the session when discovery fails after it opened", async () => {
    mockDiscoverAddressBooks.mockRejectedValue(new DavError("boom", "NETWORK"));
    renderApp("/login");
    await screen.findByRole("heading", { name: "Ouvrir le carnet" });

    await submitLogin();

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(mockCloseSession).toHaveBeenCalledTimes(1);
    expect(useSessionStore.getState().auth).toBeNull();
  });

  it("stores the user and navigates to /contacts on success", async () => {
    mockDiscoverAddressBooks.mockResolvedValue([]);
    const router = renderApp("/login");
    await screen.findByRole("heading", { name: "Ouvrir le carnet" });

    await submitLogin();

    await waitFor(() => {
      expect(useSessionStore.getState().auth).toEqual(AUTH);
    });
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/contacts");
    });
    expect(mockOpenSession).toHaveBeenCalledWith(CREDENTIALS);
    expect(mockDiscoverAddressBooks).toHaveBeenCalledWith(AUTH);
    expect(localStorage.length).toBe(0);
  });

  it("opens the page the sign-in was asked for", async () => {
    mockDiscoverAddressBooks.mockResolvedValue([]);
    const router = renderApp("/login?redirect=%2Fcontacts%2Fb%2Fabc%3Fedit%3Dtrue");
    await screen.findByRole("heading", { name: "Ouvrir le carnet" });

    await submitLogin();

    await waitFor(() => expect(router.state.location.pathname).toBe("/contacts/b/abc"));
    expect(router.state.location.search).toEqual({ edit: true });
  });

  it.each([
    "https://evil.example/contacts",
    "//evil.example/contacts",
    "/logout",
    "/contactsx",
    "/settingsx",
    "/contacts/../logout",
    "/contacts/%2e%2e/logout",
  ])("ignores a redirect outside the directory: %s", async (target) => {
    mockDiscoverAddressBooks.mockResolvedValue([]);
    const router = renderApp(`/login?redirect=${encodeURIComponent(target)}`);
    await screen.findByRole("heading", { name: "Ouvrir le carnet" });

    await submitLogin();

    await waitFor(() => expect(router.state.location.pathname).toBe("/contacts"));
  });

  it("stores only the language choice, never the credentials", async () => {
    mockDiscoverAddressBooks.mockResolvedValue([]);
    renderApp("/login");
    await screen.findByRole("heading", { name: "Ouvrir le carnet" });
    const user = userEvent.setup();
    await user.selectOptions(screen.getAllByRole("combobox", { name: "Langue" })[0]!, "fr");
    await submitLogin();
    await waitFor(() => {
      expect(useSessionStore.getState().auth).toEqual(AUTH);
    });

    expect(Object.keys(localStorage)).toEqual(["natel.preferences"]);
    expect(JSON.parse(localStorage.getItem("natel.preferences") ?? "")).toEqual({ locale: "fr" });
    for (const value of Object.values(localStorage)) {
      expect(value).not.toContain(CREDENTIALS.username);
      expect(value).not.toContain(CREDENTIALS.password);
    }
  });

  it("reuses the books found at sign-in instead of discovering them again", async () => {
    mockDiscoverAddressBooks.mockResolvedValue([]);
    renderApp("/login");
    await screen.findByRole("heading", { name: "Ouvrir le carnet" });

    await submitLogin();

    expect(await screen.findByText("Aucun carnet d’adresses trouvé sur ce serveur.")).toBeTruthy();
    expect(mockDiscoverAddressBooks).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Route guards
// ---------------------------------------------------------------------------

describe("route guards", () => {
  it("redirects / to /login when logged out", async () => {
    const router = renderApp("/");

    expect(await screen.findByRole("heading", { name: "Ouvrir le carnet" })).toBeTruthy();
    expect(router.state.location.pathname).toBe("/login");
  });

  it("redirects /login to the page it was asked for when logged in", async () => {
    useSessionStore.setState({ auth: AUTH });
    const router = renderApp("/login?redirect=%2Fsettings");

    await waitFor(() => expect(router.state.location.pathname).toBe("/settings"));
  });

  it("redirects /login to /contacts when logged in", async () => {
    useSessionStore.setState({ auth: AUTH });
    const router = renderApp("/login");

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/contacts");
    });
  });
});
