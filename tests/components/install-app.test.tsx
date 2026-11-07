import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The install state lives in the module, so each test gets a fresh one.
let stop: (() => void) | undefined;

async function view() {
  const { watchInstall } = await import("@/lib/app-install");
  const { InstallApp } = await import("@/components/install-app");
  const { I18nProvider } = await import("@/i18n/react");
  stop = watchInstall();
  return render(
    <I18nProvider>
      <InstallApp />
    </I18nProvider>,
  );
}

function installPrompt() {
  const event = Object.assign(new Event("beforeinstallprompt"), {
    prompt: vi.fn(async () => undefined),
  });
  act(() => {
    window.dispatchEvent(event);
  });
  return event;
}

beforeEach(() => {
  vi.resetModules();
});
afterEach(() => {
  stop?.();
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  Reflect.deleteProperty(navigator, "maxTouchPoints");
  Reflect.deleteProperty(navigator, "standalone");
});

describe("installing the app", () => {
  it("shows nothing where the browser offers no way to install", async () => {
    const { container } = await view();
    expect(container.textContent).toBe("");
  });

  it("opens the browser's dialog once, then hides the button", async () => {
    await view();
    const event = installPrompt();
    const { installWay } = await import("@/lib/app-install");
    const way = installWay();
    fireEvent.click(screen.getByRole("button", { name: "Install Natel" }));
    // A second tap before the button goes.
    if (way?.kind === "prompt") await act(way.install);
    expect(event.prompt).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: "Install Natel" })).toBeNull();
  });

  it("hides the button when the browser refuses to open its dialog", async () => {
    await view();
    const event = installPrompt();
    event.prompt.mockRejectedValueOnce(new DOMException("refused", "NotAllowedError"));
    fireEvent.click(screen.getByRole("button", { name: "Install Natel" }));
    await act(async () => {});
    expect(screen.queryByRole("button", { name: "Install Natel" })).toBeNull();
  });

  it("hides the button once the app is installed", async () => {
    await view();
    installPrompt();
    act(() => {
      window.dispatchEvent(new Event("appinstalled"));
    });
    expect(screen.queryByRole("button", { name: "Install Natel" })).toBeNull();
  });

  it("explains the Share menu on an iPhone", async () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 26_1 like Mac OS X) AppleWebKit/605.1.15 Version/26.1 Mobile/15E148 Safari/604.1",
    );
    await view();
    expect(screen.getByText(/open the Share menu, then choose “Add to Home Screen”/)).toBeTruthy();
  });

  it("explains the Share menu on an iPad, which presents itself as a Mac", async () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/26.1 Safari/605.1.15",
    );
    // jsdom has no maxTouchPoints.
    Object.defineProperty(navigator, "maxTouchPoints", { value: 5, configurable: true });
    await view();
    expect(screen.getByText(/open the Share menu, then choose “Add to Home Screen”/)).toBeTruthy();
  });

  it("shows nothing when Natel already runs as an installed app", async () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (iPhone)");
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query === "(display-mode: standalone)",
    }));
    const { container } = await view();
    installPrompt();
    expect(container.textContent).toBe("");
  });

  it("shows nothing in an app added to an iPhone's Home Screen", async () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (iPhone)");
    // Safari's own flag, absent from jsdom.
    Object.defineProperty(navigator, "standalone", { value: true, configurable: true });
    const { container } = await view();
    expect(container.textContent).toBe("");
  });
});
