// @vitest-environment node
/**
 * The CI workflow's documentation-only path: its required checks pass without
 * testing, so a wrong classification or an unguarded step lets a broken
 * change through or fails every documentation pull request.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const ci = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");

function job(name: string): string {
  const body = ci.split(`\n  ${name}:\n`)[1]?.split(/\n {2}[a-z-]+:\n/)[0];
  if (!body) throw new Error(`Missing job: ${name}`);
  return body;
}

const diffStep = job("changes")
  .split("      - id: diff\n        run: |\n")[1]
  ?.replace(/^ {10}/gm, "");

const directories: string[] = [];
afterEach(() => {
  for (const path of directories.splice(0)) rmSync(path, { recursive: true, force: true });
});

// A pull request's checkout is a merge commit whose first parent is the base.
function classify(
  change: (write: (path: string) => void, move: (from: string, to: string) => void) => void,
) {
  if (!diffStep) throw new Error("Missing step: diff");
  const cwd = mkdtempSync(join(tmpdir(), "natel-ci-diff-"));
  directories.push(cwd);
  const env = {
    ...Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith("GIT_"))),
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_NOSYSTEM: "1",
  };
  const git = (...args: string[]) =>
    execFileSync(
      "git",
      [
        "-c",
        "user.name=CI",
        "-c",
        "user.email=ci@example.invalid",
        "-c",
        "commit.gpgsign=false",
        ...args,
      ],
      { cwd, env, stdio: ["ignore", "pipe", "pipe"] },
    );
  let edits = 0;
  const write = (path: string) => {
    mkdirSync(join(cwd, dirname(path)), { recursive: true });
    edits += 1;
    writeFileSync(join(cwd, path), `${path}\n${edits}\n`);
  };
  git("init", "-q", "-b", "main");
  for (const path of ["src/app.ts", "docs/user-guide.md", "docs/brand/mark.svg", "README.md"])
    write(path);
  git("add", ".");
  git("commit", "-qm", "Base");
  git("switch", "-qc", "topic");
  change(write, (from, to) => {
    mkdirSync(join(cwd, dirname(to)), { recursive: true });
    git("mv", from, to);
  });
  git("add", "-A");
  git("commit", "-q", "--allow-empty", "-m", "Change");
  git("switch", "-q", "main");
  git("merge", "-q", "--no-ff", "-m", "Merge", "topic");
  const output = join(cwd, "output");
  execFileSync("bash", ["--noprofile", "--norc", "-e", "-c", diffStep], {
    cwd,
    env: { ...env, GITHUB_OUTPUT: output },
  });
  return readFileSync(output, "utf8").trim();
}

describe("the documentation-only diff", () => {
  it("skips the tests for Markdown, docs and change notes", () => {
    expect(
      classify((write) => {
        write("README.md");
        write("docs/releasing.md");
        write("docs/screenshots/list.png");
        write(".changes/note.json");
      }),
    ).toBe("code=false");
  });

  it("tests a change to code", () => {
    expect(
      classify((write) => {
        write("src/app.ts");
        write(".changes/note.json");
      }),
    ).toBe("code=true");
  });

  // The app bundles the guide, and the demo build reads its preview image.
  it("tests a change to a file under docs that the build reads", () => {
    expect(classify((write) => write("docs/user-guide.md"))).toBe("code=true");
    expect(classify((write) => write("docs/brand/mark.svg"))).toBe("code=true");
  });

  it("tests a move out of code by its old path", () => {
    expect(classify((_, move) => move("src/app.ts", "docs/app.md"))).toBe("code=true");
  });

  it("tests an empty diff", () => {
    expect(classify(() => {})).toBe("code=true");
  });
});

// An empty output, from a failed or skipped diff, must run everything.
it("runs the tests unless the diff says documentation only", () => {
  for (const name of ["check", "e2e", "image"])
    expect(job(name)).toContain("needs.changes.outputs.code != 'false'");
});

// A skipped matrix job reports under its unexpanded name, so the e2e job runs
// and skips its steps instead: one without the guard would fail it. The guard
// is each step's first key.
it("guards every e2e step that needs the checkout", () => {
  const steps = job("e2e").split("\n      - ").slice(1);
  expect(steps.length).toBeGreaterThan(5);
  for (const step of steps) {
    if (step.includes("./.github/actions/release-candidate") || step.startsWith("if: failure()"))
      continue;
    expect(step).toMatch(/^if: env\.TESTS == 'true'/);
  }
});
