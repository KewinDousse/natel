import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UpdateStatus, useUpdateBadge } from "@/components/update-notice";
import { I18nProvider } from "@/i18n/react";
import { compareVersions, releaseUrl } from "@/lib/release-version";
import { fetchUpdates } from "@/queries/useUpdates";
import { useUpdateNotice } from "@/store/update-notice";

vi.mock("@/lib/app-info", () => ({ APP_VERSION: "0.3.1" }));

beforeEach(() => {
  localStorage.clear();
  useUpdateNotice.setState({ ignored: null, seen: null });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function Badge() {
  return <p>{useUpdateBadge() ? "badge" : "no badge"}</p>;
}

function view(version: string | null, settings = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(
    ["updates"],
    version === null
      ? { enabled: false }
      : { enabled: true, version, releaseUrl: releaseUrl(version) },
  );
  return render(
    <QueryClientProvider client={client}>
      <I18nProvider>
        <Badge />
        {settings && <UpdateStatus />}
      </I18nProvider>
    </QueryClientProvider>,
  );
}

describe("update notifications", () => {
  it("badges a newer release until the settings show it", () => {
    let result = view("0.10.0");
    expect(screen.getByText("badge")).toBeTruthy();
    result.unmount();
    result = view("0.10.0", true);
    expect(screen.getByText("no badge")).toBeTruthy();
    expect(localStorage.getItem("natel.seenRelease")).toBe("0.10.0");
    result.unmount();
    view("0.11.0");
    expect(screen.getByText("badge")).toBeTruthy();
  });
  it("keeps the badge hidden for an ignored or an older release", () => {
    useUpdateNotice.setState({ ignored: "0.10.0" });
    let result = view("0.10.0");
    expect(screen.getByText("no badge")).toBeTruthy();
    result.unmount();
    useUpdateNotice.setState({ ignored: null, seen: "0.11.0" });
    result = view("0.10.0");
    expect(screen.getByText("no badge")).toBeTruthy();
  });
  it("highlights a newer release in the settings until it is ignored", () => {
    const result = view("0.10.0", true);
    const notes = screen.getByRole("link", { name: /what’s new|nouveautés/ });
    expect(notes.getAttribute("href")).toBe(releaseUrl("0.10.0"));
    fireEvent.click(screen.getByRole("button", { name: /ignore|ignorer/i }));
    expect(screen.queryByRole("button", { name: /ignore|ignorer/i })).toBeNull();
    expect(localStorage.getItem("natel.ignoredRelease")).toBe("0.10.0");
    const latest = screen.getByRole("link");
    expect(latest.getAttribute("href")).toBe(releaseUrl("0.10.0"));
    expect(document.activeElement).toBe(latest);
    result.unmount();
    view("0.11.0", true);
    expect(screen.getByRole("button", { name: /ignore|ignorer/i })).toBeTruthy();
  });
  it("does not announce an older or the installed release", () => {
    const result = view("0.3.1", true);
    expect(screen.getByText("no badge")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /ignore|ignorer/i })).toBeNull();
    result.unmount();
    view("0.2.0", true);
    expect(screen.queryByRole("button", { name: /ignore|ignorer/i })).toBeNull();
    expect(localStorage.getItem("natel.seenRelease")).toBeNull();
  });
  it("orders numeric versions and prerelease identifiers", () => {
    expect(compareVersions("0.10.0", "0.9.0")).toBe(1);
    expect(compareVersions("1.0.0", "1.0.0-rc.10")).toBe(1);
    expect(compareVersions("1.0.0-rc.10", "1.0.0-rc.2")).toBe(1);
  });
  it("refuses a release link outside Natel and contacts only the instance", async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          enabled: true,
          version: "0.4.0",
          releaseUrl: "https://elsewhere.invalid",
        }),
      ),
    );
    vi.stubGlobal("fetch", fetch);
    await expect(fetchUpdates()).rejects.toThrow("Invalid update information");
    expect(fetch.mock.calls[0]?.[0]).toBe("/updates");
  });
  it("distinguishes an unavailable manifest from a disabled checker", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response('{"enabled":true}')));
    await expect(fetchUpdates()).resolves.toEqual({ enabled: true });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response('{"enabled":false}')));
    await expect(fetchUpdates()).resolves.toEqual({ enabled: false });
  });
});

describe("manual update checks", () => {
  it("bypasses the browser cache, prevents duplicate clicks and shows the new release", async () => {
    let finish: (response: Response) => void = () => {};
    const fetch = vi.fn().mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetch);
    view("0.3.1", true);
    const button = screen.getByRole("button", { name: /check for updates/i });
    fireEvent.click(button);
    await waitFor(() => expect(button.getAttribute("aria-disabled")).toBe("true"));
    fireEvent.click(button);
    expect(fetch).toHaveBeenCalledExactlyOnceWith("/updates", {
      method: "POST",
      mode: "same-origin",
      cache: "no-store",
    });
    await act(async () =>
      finish(
        new Response(
          JSON.stringify({ enabled: true, version: "0.5.0", releaseUrl: releaseUrl("0.5.0") }),
        ),
      ),
    );
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toBe("Natel 0.5.0 is available."),
    );
    expect(screen.getByRole("link", { name: "See what’s new" }).getAttribute("href")).toBe(
      releaseUrl("0.5.0"),
    );
    expect(button.getAttribute("aria-disabled")).toBe("false");
    expect(screen.getByText("no badge")).toBeTruthy();
  });

  it.each(["0.3.1", "0.2.0"])("confirms no newer release for %s", async (version) => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ enabled: true, version, releaseUrl: releaseUrl(version) })),
        ),
    );
    view("0.3.1", true);
    fireEvent.click(screen.getByRole("button", { name: /check for updates/i }));
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toBe("No newer version is available."),
    );
  });

  it.each([
    [new Response('{"enabled":true}'), "Could not check for updates. Try again later."],
    [new Response("", { status: 503 }), "Could not check for updates. Try again later."],
    [new Response("", { status: 429 }), "Please wait a minute before checking again."],
    [
      new Response('{"enabled":true,"version":"broken"}'),
      "Could not check for updates. Try again later.",
    ],
  ])("reports unavailable results and allows a retry", async (response, message) => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response)
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ enabled: true, version: "0.3.1", releaseUrl: releaseUrl("0.3.1") }),
        ),
      );
    vi.stubGlobal("fetch", fetch);
    view("0.3.1", true);
    const button = screen.getByRole("button", { name: /check for updates/i });
    fireEvent.click(button);
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe(message));
    expect(screen.queryByText("No newer version is available.")).toBeNull();
    fireEvent.click(button);
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toBe("No newer version is available."),
    );
  });

  it("hides the manual check when the server disables updates", () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    view(null, true);
    expect(screen.queryByRole("button", { name: /check for updates/i })).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
});
