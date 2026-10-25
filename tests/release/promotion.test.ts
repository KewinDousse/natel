// @vitest-environment node
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const directories: string[] = [];
const workflow = readFileSync(
  new URL("../../.github/workflows/release.yml", import.meta.url),
  "utf8",
);
const script = workflow
  .split("      - name: Promote released image aliases\n        run: |\n")[1]
  ?.split("        env:\n")[0]
  ?.replace(/^ {10}/gm, "");

afterEach(() => {
  for (const path of directories.splice(0)) rmSync(path, { recursive: true, force: true });
});

function fixture() {
  const cwd = mkdtempSync(join(tmpdir(), "natel-promotion-"));
  directories.push(cwd);
  const bin = join(cwd, "bin");
  mkdirSync(bin);
  writeFileSync(
    join(bin, "gh"),
    `#!/usr/bin/env node
const {readFileSync}=require('node:fs');
const args=process.argv.slice(2);
if(args[0]!=='api' || !args.includes('--paginate') || !args.includes('repos/KewinDousse/natel/releases?per_page=100')) process.exit(1);
if(process.env.FAIL_HISTORY==='true') process.exit(1);
const releases=JSON.parse(readFileSync('history.json','utf8'));
process.stdout.write(releases.map(release=>release.tag_name.slice(1)).concat('').join(String.fromCharCode(10)));
`,
    { mode: 0o755 },
  );
  writeFileSync(
    join(bin, "skopeo"),
    `#!/usr/bin/env node
require('node:fs').appendFileSync('copies',process.argv.at(-1)+String.fromCharCode(10));
`,
    { mode: 0o755 },
  );
  return {
    history: (versions: string[]) =>
      writeFileSync(
        join(cwd, "history.json"),
        JSON.stringify(versions.map((tag_name) => ({ tag_name, draft: false, prerelease: false }))),
      ),
    run: (version: string, fail = false) => {
      writeFileSync(join(cwd, "copies"), "");
      if (!script) throw new Error("Missing alias publication step");
      execFileSync("bash", ["-c", script], {
        cwd,
        env: {
          ...process.env,
          PATH: `${bin}${delimiter}${process.env.PATH}`,
          VERSION: version,
          DIGEST: "sha256:fixture",
          GITHUB_REPOSITORY: "KewinDousse/natel",
          FAIL_HISTORY: String(fail),
        },
        stdio: ["ignore", "pipe", "pipe"],
      });
      return readFileSync(join(cwd, "copies"), "utf8").trim().split("\n").filter(Boolean);
    },
  };
}

describe("image promotion on partial workflow reruns", () => {
  it("stops promoting either alias after a newer patch is published", () => {
    const f = fixture();
    f.history(["v0.4.0"]);
    expect(f.run("0.4.0")).toEqual([
      "docker://ghcr.io/kewindousse/natel:0.4",
      "docker://ghcr.io/kewindousse/natel:latest",
    ]);
    f.history(["v0.4.0", "v0.4.1"]);
    expect(f.run("0.4.0")).toEqual([]);
  });

  it("allows a maintenance minor alias without regressing latest", () => {
    const f = fixture();
    f.history(["v0.4.0", "v0.5.0"]);
    expect(f.run("0.4.1")).toEqual(["docker://ghcr.io/kewindousse/natel:0.4"]);
  });

  it("orders numeric versions and never promotes a prerelease", () => {
    const f = fixture();
    f.history(["v0.9.0"]);
    expect(f.run("0.10.0")).toHaveLength(2);
    expect(f.run("1.0.0-rc.2")).toEqual([]);
  });

  it("never promotes when release history is unavailable", () => {
    const f = fixture();
    f.history([]);
    expect(() => f.run("0.4.0", true)).toThrow();
  });
});
