import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const ATTACHMENT = /^book-opening-\d+\.json$/;

export function readBenchmarks(results) {
  const reports = [];
  const visit = (suite) => {
    for (const child of suite.suites ?? []) visit(child);
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests) {
        for (const result of test.results) {
          for (const { name, body } of result.attachments) {
            if (!ATTACHMENT.test(name) || !body) continue;
            reports.push(JSON.parse(Buffer.from(body, "base64").toString("utf8")));
          }
        }
      }
    }
  };
  visit(results);
  return reports;
}

const milliseconds = (value) => `${Math.round(value).toLocaleString("en-US")} ms`;

function opening(report) {
  if (!report) return "not measured";
  if (report.status === "complete" && report.medianMs !== null)
    return milliseconds(report.medianMs);
  return /(Step|Test) timeout of|Timeout \d+ms exceeded/.test(report.failure ?? "")
    ? "timeout"
    : "failed";
}

function difference(base, head) {
  if (!base?.medianMs || head?.medianMs === null || head?.medianMs === undefined) return "n/a";
  const percent = ((head.medianMs - base.medianMs) / base.medianMs) * 100;
  return `${percent > 0 ? "+" : ""}${percent.toFixed(1)}%`;
}

const environment = (report) =>
  report
    ? `Chromium ${report.browser}, ${report.platform}, ${report.cpu}, Node ${report.node}`
    : undefined;

const samples = (report) => report?.samplesMs.map((ms) => Math.round(ms)).join(", ") || "none";

export function renderReport({ base, head, baseSha, headSha }) {
  if (base.length === 0 && head.length === 0) return "";
  const baseLabel = `main (${baseSha.slice(0, 7)})`;
  const headLabel = `With the PR (${headSha.slice(0, 7)})`;
  const sizes = [...new Set([...base, ...head].map((report) => report.contacts))].sort(
    (a, b) => a - b,
  );
  const pair = (contacts) => [
    base.findLast((report) => report.contacts === contacts),
    head.findLast((report) => report.contacts === contacts),
  ];
  const baseEnvironment = environment(base[0]);
  const headEnvironment = environment(head[0]);
  return [
    "## Address book opening",
    "",
    "Median of five fresh-context openings, measured one after the other on the same machine. Differences are informational.",
    "",
    `| Contacts | ${baseLabel} | ${headLabel} | Difference |`,
    "| --: | --: | --: | --: |",
    ...sizes.map((contacts) => {
      const [baseReport, headReport] = pair(contacts);
      return `| ${contacts.toLocaleString("en-US")} | ${opening(baseReport)} | ${opening(headReport)} | ${difference(baseReport, headReport)} |`;
    }),
    "",
    "<details>",
    "<summary>Raw measurements</summary>",
    "",
    `| Contacts | ${baseLabel}, ms | ${headLabel}, ms |`,
    "| --: | --- | --- |",
    ...sizes.map((contacts) => {
      const [baseReport, headReport] = pair(contacts);
      return `| ${contacts.toLocaleString("en-US")} | ${samples(baseReport)} | ${samples(headReport)} |`;
    }),
    "",
    ...(baseEnvironment === headEnvironment || !baseEnvironment || !headEnvironment
      ? [`${baseEnvironment ?? headEnvironment}.`, ""]
      : [`main: ${baseEnvironment}.`, "", `With the PR: ${headEnvironment}.`, ""]),
    "</details>",
    "",
  ].join("\n");
}

function readFile(path) {
  if (!existsSync(path)) return [];
  return readBenchmarks(JSON.parse(readFileSync(path, "utf8")));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [basePath, headPath, baseSha, headSha] = process.argv.slice(2);
  if (!basePath || !headPath || !baseSha || !headSha) {
    throw new Error("Usage: node scripts/perf-report.mjs BASE.json HEAD.json BASE_SHA HEAD_SHA");
  }
  const base = readFile(basePath);
  const head = readFile(headPath);
  process.stdout.write(renderReport({ base, head, baseSha, headSha }));
  // A size over its limit still has a report; no report at all means the run itself broke.
  if (base.length === 0 || head.length === 0) process.exitCode = 1;
}
