// @vitest-environment node
import { execFileSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildRevision } from "../vite.config";

vi.mock("node:child_process", () => ({ execFileSync: vi.fn(() => "") }));

beforeEach(() => {
  vi.mocked(execFileSync).mockReset();
  vi.stubEnv("NATEL_REVISION", "");
});

afterEach(() => vi.unstubAllEnvs());

describe("build revision", () => {
  it("uses the supplied CI revision without requiring Git", () => {
    vi.stubEnv("NATEL_REVISION", "0123456789abcdef");
    expect(buildRevision()).toBe("0123456789abcdef");
    expect(execFileSync).not.toHaveBeenCalled();
  });

  it("identifies a modified source checkout", () => {
    vi.mocked(execFileSync).mockReturnValue("dc0f9bf-dirty\n");
    expect(buildRevision()).toBe("dc0f9bf-dirty");
    expect(execFileSync).toHaveBeenCalledWith(
      "git",
      ["describe", "--always", "--dirty"],
      expect.objectContaining({ encoding: "utf8" }),
    );
  });

  it("leaves the revision empty when Git or its history is absent", () => {
    vi.mocked(execFileSync).mockImplementation(() => {
      throw new Error("Git unavailable");
    });
    expect(buildRevision()).toBe("");
  });
});
