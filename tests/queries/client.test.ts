/**
 * Tests for src/queries/client.ts — QueryClient factory defaults.
 */
import { describe, expect, it } from "vitest";
import { createQueryClient } from "@/queries/client";

describe("createQueryClient", () => {
  it("disables mutation retries (retry: false)", () => {
    const client = createQueryClient();
    const options = client.getDefaultOptions();
    expect(options.mutations?.retry).toBe(false);
  });

  it("sets generous staleTime for queries", () => {
    const client = createQueryClient();
    const options = client.getDefaultOptions();
    expect(options.queries?.staleTime).toBe(5 * 60 * 1000);
  });
});
