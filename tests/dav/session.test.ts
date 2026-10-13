/**
 * Tests for src/dav/session.ts — the calls to natel-session's /session,
 * with fetch mocked.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { closeSession, currentSession, openSession } from "@/dav/session";

const CREDENTIALS = { username: "alice", password: "secret" };

function mockFetch(response: Response | Error) {
  const fetch = vi.fn(async () => {
    if (response instanceof Error) throw response;
    return response;
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("openSession", () => {
  it("posts the credentials as JSON to the app's own /session", async () => {
    const fetch = mockFetch(json({ username: "alice" }));

    expect(await openSession(CREDENTIALS)).toEqual({ username: "alice" });

    expect(fetch).toHaveBeenCalledWith("http://localhost:3000/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(CREDENTIALS),
      mode: "same-origin",
      referrerPolicy: "same-origin",
    });
  });

  it.each([
    [401, "AUTH"],
    [502, "NETWORK"],
    [503, "NETWORK"],
    [504, "NETWORK"],
    [403, "UNEXPECTED"],
    [429, "UNEXPECTED"],
    [500, "UNEXPECTED"],
  ])("maps HTTP %i to %s", async (status, code) => {
    mockFetch(new Response(null, { status }));
    await expect(openSession(CREDENTIALS)).rejects.toMatchObject({ code });
  });

  it("reports a failed request as a network error", async () => {
    mockFetch(new TypeError("Load failed"));
    await expect(openSession(CREDENTIALS)).rejects.toMatchObject({ code: "NETWORK" });
  });

  it("refuses an answer without a username", async () => {
    mockFetch(json({}));
    await expect(openSession(CREDENTIALS)).rejects.toMatchObject({ code: "UNEXPECTED" });
  });
});

describe("currentSession", () => {
  it("returns the signed-in user", async () => {
    mockFetch(json({ username: "alice" }));
    expect(await currentSession()).toEqual({ username: "alice" });
  });

  it("returns null without a session, or when the request fails", async () => {
    mockFetch(new Response(null, { status: 401 }));
    expect(await currentSession()).toBeNull();
    mockFetch(new TypeError("Load failed"));
    expect(await currentSession()).toBeNull();
  });
});

describe("closeSession", () => {
  it("deletes the session", async () => {
    const fetch = mockFetch(new Response(null, { status: 204 }));
    expect(await closeSession()).toBe(true);
    expect(fetch).toHaveBeenCalledWith("http://localhost:3000/session", {
      method: "DELETE",
      mode: "same-origin",
      referrerPolicy: "same-origin",
    });
  });

  it("says when the server didn't confirm it", async () => {
    mockFetch(new TypeError("Load failed"));
    expect(await closeSession()).toBe(false);
    mockFetch(new Response(null, { status: 502 }));
    expect(await closeSession()).toBe(false);
  });
});
