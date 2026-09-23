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

const SERVER = "https://dav.example.ch";
const AUTH = { serverUrl: SERVER, username: "alice", password: "secret" };

function setLanguage(lang: string) {
  Object.defineProperty(window.navigator, "language", {
    get: () => lang,
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

/** Fill the three fields and submit the (French) form. */
async function submitLogin(overrides: Partial<typeof AUTH> = {}) {
  const user = userEvent.setup();
  const { serverUrl = SERVER, username = "alice", password = "secret" } = overrides;
  await user.type(screen.getByLabelText("Adresse du serveur"), serverUrl);
  await user.type(screen.getByLabelText("Nom d’utilisateur"), username);
  await user.type(screen.getByLabelText("Mot de passe"), password);
  await user.click(screen.getByRole("button", { name: "Se connecter" }));
  return user;
}

beforeEach(() => {
  setLanguage("fr-FR");
  localStorage.clear();
  useSessionStore.setState({ auth: null, selectedBook: null, serverUrl: "" });
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Rendering and locale
// ---------------------------------------------------------------------------

describe("rendering", () => {
  it("renders with French defaults", async () => {
    renderApp("/login");

    expect(await screen.findByRole("heading", { name: "Ouvrir le carnet" })).toBeTruthy();
    expect(screen.getByLabelText("Adresse du serveur")).toBeTruthy();
    expect(screen.getByLabelText("Nom d’utilisateur")).toBeTruthy();
    expect(screen.getByLabelText("Mot de passe")).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: /Mémoriser le serveur/ })).toBeTruthy();
    const frPills = screen.getAllByRole("button", { name: "FR" });
    expect(frPills[0]?.getAttribute("aria-pressed")).toBe("true");
    expect(document.title).toBe("Se connecter · Natel");
  });

  it("prefills the server URL from the session store", async () => {
    useSessionStore.setState({ serverUrl: "https://dav.pre.example.com" });
    renderApp("/login");

    const input = await screen.findByLabelText<HTMLInputElement>("Adresse du serveur");
    expect(input.value).toBe("https://dav.pre.example.com");
  });

  it("switches to English and updates the pills and title", async () => {
    renderApp("/login");
    await screen.findByRole("heading", { name: "Ouvrir le carnet" });

    const user = userEvent.setup();
    await user.click(screen.getAllByRole("button", { name: "EN" })[0]!);

    expect(await screen.findByRole("heading", { name: "Open your address book" })).toBeTruthy();
    for (const button of screen.getAllByRole("button", { name: "FR" })) {
      expect(button.getAttribute("aria-pressed")).toBe("false");
    }
    for (const button of screen.getAllByRole("button", { name: "EN" })) {
      expect(button.getAttribute("aria-pressed")).toBe("true");
    }
    expect(document.title).toBe("Sign in · Natel");
  });
});

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

describe("validation", () => {
  it("validates on blur and blocks an invalid submit", async () => {
    renderApp("/login");
    await screen.findByRole("heading", { name: "Ouvrir le carnet" });

    const user = userEvent.setup();
    const server = screen.getByLabelText("Adresse du serveur");

    // Blur the empty server field → required error appears.
    await user.click(server);
    await user.type(screen.getByLabelText("Nom d’utilisateur"), "a");
    expect(await screen.findByText("Veuillez saisir l’adresse du serveur.")).toBeTruthy();
    expect(server.getAttribute("aria-invalid")).toBe("true");

    // A well-formed but invalid submission is still blocked.
    await user.type(server, "not a url");
    await user.click(screen.getByRole("button", { name: "Se connecter" }));
    expect(
      await screen.findByText("Adresse invalide. Exemple : https://dav.example.ch"),
    ).toBeTruthy();
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
    expect(alert.textContent).toContain("Impossible de joindre dav.example.ch.");
    expect(alert.textContent).toContain(
      "Vérifiez l’adresse, ou autorisez ce site dans les réglages CORS de votre serveur.",
    );
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
    // Remember is checked by default → the server URL is persisted.
    expect(localStorage.getItem("natel:serverUrl")).toBe(SERVER);
  });

  it("does not persist the server URL when remember is unchecked", async () => {
    mockDiscoverAddressBooks.mockResolvedValue([]);
    const router = renderApp("/login");
    await screen.findByRole("heading", { name: "Ouvrir le carnet" });

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Adresse du serveur"), SERVER);
    await user.type(screen.getByLabelText("Nom d’utilisateur"), "alice");
    await user.type(screen.getByLabelText("Mot de passe"), "secret");
    await user.click(screen.getByRole("checkbox", { name: /Mémoriser le serveur/ }));
    await user.click(screen.getByRole("button", { name: "Se connecter" }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/contacts");
    });
    // Remember unchecked → the URL is kept in memory only, never persisted.
    expect(localStorage.getItem("natel:serverUrl")).toBeNull();
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
