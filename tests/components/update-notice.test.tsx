import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UpdateNotice } from "@/components/update-notice";
import { I18nProvider } from "@/i18n/react";
import { compareVersions, releaseUrl } from "@/lib/release-version";
import { fetchUpdates } from "@/queries/useUpdates";
import { useUpdateNotice } from "@/store/update-notice";

vi.mock("@/lib/app-info", () => ({ APP_VERSION: "0.3.1" }));

beforeEach(() => {
  localStorage.clear();
  useUpdateNotice.setState({ ignored: null });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function view(version: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(["updates"], { enabled: true, version, releaseUrl: releaseUrl(version) });
  return render(
    <QueryClientProvider client={client}>
      <I18nProvider>
        <UpdateNotice />
      </I18nProvider>
    </QueryClientProvider>,
  );
}

describe("update notifications", () => {
  it("shows newer releases and ignores only the chosen version", async () => {
    const result = view("0.10.0");
    expect(screen.getByRole("link").getAttribute("href")).toBe(releaseUrl("0.10.0"));
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(screen.queryByRole("link")).toBeNull());
    expect(localStorage.getItem("natel.ignoredRelease")).toBe("0.10.0");
    result.unmount();
    view("0.11.0");
    expect(screen.getByRole("link").textContent).toBeTruthy();
  });
  it("does not announce an older or the installed release", () => {
    const result = view("0.3.1");
    expect(screen.queryByRole("link")).toBeNull();
    result.unmount();
    view("0.2.0");
    expect(screen.queryByRole("link")).toBeNull();
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
