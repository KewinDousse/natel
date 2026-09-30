/**
 * Tests for src/routes/login.tsx — the sign-in screen.
 *
 * Renders the real router (routeTree + memory history) so the beforeLoad
 * guards are exercised too. `@/dav` is mocked (real DavError kept) so the
 * credential check never hits the network.
 */

import { QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DavError } from "@/dav";
import type { DavAddressBook, DavAuth } from "@/dav/types";
import { I18nProvider } from "@/i18n/react";
import { createQueryClient } from "@/queries";
import { routeTree } from "@/routeTree.gen";
import { useSessionStore } from "@/store/session";

const { mockDiscoverAddressBooks } = vi.hoisted(() => ({
  mockDiscoverAddressBooks: vi.fn<(auth: DavAuth) => Promise<DavAddressBook[]>>(),
}));

vi.mock("@/dav", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/dav")>();
  return { ...actual, discoverAddressBooks: mockDiscoverAddressBooks };
});

const AUTH = { username: "alice", password: "secret" };

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
async function submitLogin(overrides: Partial<typeof AUTH> = {}) {
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
  });

  it("starts in the stored language", async () => {
    localStorage.setItem("natel.preferences", '{"locale":"en"}');
    renderApp("/login");
    expect(await screen.findByRole("heading", { name: "Open your address book" })).toBeTruthy();
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
  it("shows the connection error box when discovery fails", async () => {
    mockDiscoverAddressBooks.mockRejectedValue(new DavError("boom", "NETWORK"));
    renderApp("/login");
    await screen.findByRole("heading", { name: "Ouvrir le carnet" });

    await submitLogin();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Impossible de joindre le serveur de contacts.");
    expect(alert.textContent).not.toContain("CORS");
  });

  it("shows an invalid-credentials message on auth failure", async () => {
    mockDiscoverAddressBooks.mockRejectedValue(new DavError("bad credentials", "AUTH"));
    renderApp("/login");
    await screen.findByRole("heading", { name: "Ouvrir le carnet" });

    await submitLogin();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Nom d’utilisateur ou mot de passe incorrect.");
  });

  it("stores credentials and navigates to /contacts on success", async () => {
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
    expect(mockDiscoverAddressBooks).toHaveBeenCalledWith(AUTH);
    expect(localStorage.length).toBe(0);
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
      expect(value).not.toContain(AUTH.username);
      expect(value).not.toContain(AUTH.password);
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

  it("redirects /login to /contacts when logged in", async () => {
    useSessionStore.setState({ auth: AUTH });
    const router = renderApp("/login");

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/contacts");
    });
  });
});
