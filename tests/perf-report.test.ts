// @vitest-environment node
import { describe, expect, it } from "vitest";
import { type BookOpeningReport, readBenchmarks, renderReport } from "../scripts/perf-report.mjs";

function report(contacts: number, overrides: Partial<BookOpeningReport> = {}): BookOpeningReport {
  return { contacts, status: "complete", samplesMs: [100.4, 199.6], medianMs: 150, ...overrides };
}

const render = (base: BookOpeningReport[], head: BookOpeningReport[]) =>
  renderReport({ base, head, baseSha: "aaaaaaaaaa", headSha: "bbbbbbbbbb" });

describe("readBenchmarks", () => {
  it("reads the benchmark attachments of nested suites and ignores other attachments", () => {
    const body = Buffer.from(JSON.stringify(report(100))).toString("base64");
    const results = {
      suites: [
        {
          suites: [
            {
              specs: [
                {
                  tests: [
                    {
                      results: [
                        {
                          attachments: [
                            { name: "book-opening-100.json", body },
                            { name: "error-context", path: "/tmp/context.md" },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
    expect(readBenchmarks(results)).toEqual([report(100)]);
  });

  it("finds nothing in a run that broke before any test", () => {
    expect(readBenchmarks({ suites: [], errors: [{ message: "build failed" }] })).toEqual([]);
  });
});

describe("renderReport", () => {
  it("compares medians, sorted by size", () => {
    const output = render(
      [report(1_000, { medianMs: 2_000 }), report(100, { medianMs: 100 })],
      [report(100, { medianMs: 150 }), report(1_000, { medianMs: 1_500 })],
    );
    expect(output).toContain("| Contacts | main (aaaaaaa) | With the PR (bbbbbbb) | Difference |");
    expect(output.indexOf("| 100 | 100 ms | 150 ms | +50.0% |")).toBeGreaterThan(-1);
    expect(output.indexOf("| 1,000 | 2,000 ms | 1,500 ms | -25.0% |")).toBeGreaterThan(
      output.indexOf("| 100 | 100 ms"),
    );
  });

  it("names a timeout and a failure instead of comparing them", () => {
    const timedOut = report(10_000, {
      status: "incomplete",
      failure: "Step timeout of 120000ms exceeded.",
      samplesMs: [],
      medianMs: null,
    });
    const failed = report(3_000, { status: "incomplete", failure: "HTTP 500", medianMs: null });
    const output = render([timedOut, failed], [report(10_000), report(3_000)]);
    expect(output).toContain("| 10,000 | timeout | 150 ms | n/a |");
    expect(output).toContain("| 3,000 | failed | 150 ms | n/a |");
  });

  it("does not call a failed assertion's timeout setting a timeout", () => {
    const failed = report(100, {
      status: "incomplete",
      failure: "Expected: 100 contacts\nReceived: 42 contacts\nTimeout:  300ms",
      medianMs: null,
    });
    expect(render([failed], [report(100)])).toContain("| 100 | failed | 150 ms | n/a |");
  });

  it("keeps the last attempt of a retried size", () => {
    const timedOut = report(100, {
      status: "incomplete",
      failure: "Timeout 120000ms exceeded.",
      medianMs: null,
    });
    expect(render([timedOut, report(100)], [report(100)])).toContain(
      "| 100 | 150 ms | 150 ms | 0.0% |",
    );
  });

  it("renders nothing when neither side has a report", () => {
    expect(render([], [])).toBe("");
  });

  it("names each side's environment when they differ", () => {
    const environment = { platform: "linux", cpu: "x86", node: "v24" };
    const output = render(
      [report(100, { ...environment, browser: "1" })],
      [report(100, { ...environment, browser: "2" })],
    );
    expect(output).toContain("main: Chromium 1, linux, x86, Node v24.");
    expect(output).toContain("With the PR: Chromium 2, linux, x86, Node v24.");
  });

  it("says when one side has no report for a size", () => {
    expect(render([report(100)], [])).toContain("| 100 | 150 ms | not measured | n/a |");
  });

  it("keeps the raw samples in a collapsed block", () => {
    const output = render([report(100)], [report(100, { samplesMs: [] })]);
    expect(output).toContain("<details>");
    expect(output).toContain("| 100 | 100, 200 | none |");
  });
});
