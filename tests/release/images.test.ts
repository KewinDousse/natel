// @vitest-environment node
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const directories: string[] = [];
const ci = readFileSync(new URL("../../.github/workflows/ci.yml", import.meta.url), "utf8");
const release = readFileSync(
  new URL("../../.github/workflows/release.yml", import.meta.url),
  "utf8",
);
function shell(workflow: string, marker: string): string {
  const body = workflow.split(marker)[1]?.split("        run: |\n")[1]?.split("        env:\n")[0];
  if (!body) throw new Error(`Missing workflow step: ${marker}`);
  return body.replace(/^ {10}/gm, "");
}
const reuse = shell(ci, "      - name: Reuse an immutable image on a release retry\n");
const publish = shell(release, "      - id: push\n");

afterEach(() => {
  for (const path of directories.splice(0)) rmSync(path, { recursive: true, force: true });
});

type State = { tested: string; existing: string | null; error: string; copies: string[][] };
function fixture(existing: string | null, error = "manifest unknown") {
  const cwd = mkdtempSync(join(tmpdir(), "natel-image-promotion-"));
  directories.push(cwd);
  mkdirSync(join(cwd, "bin"));
  const statePath = join(cwd, "state.json");
  const initial: State = { tested: "sha256:tested", existing, error, copies: [] };
  writeFileSync(statePath, JSON.stringify(initial));
  writeFileSync(
    join(cwd, "bin/skopeo"),
    `#!/usr/bin/env node
const fs=require('node:fs');
const file=process.env.IMAGE_TEST_STATE;
const state=JSON.parse(fs.readFileSync(file,'utf8'));
const args=process.argv.slice(2);
if(args[0]==='inspect') {
  const digest=args[1].startsWith('oci-archive:')?state.tested:state.existing;
  if(!digest){process.stderr.write(state.error);process.exit(1);}
  process.stdout.write(JSON.stringify({Digest:digest,Labels:{'org.opencontainers.image.revision':'candidate'}}));
} else if(args[0]==='copy') {
  state.copies.push(args);
  if(args.at(-1).startsWith('oci-archive:'))state.tested=state.existing;
  else state.existing=state.tested;
  if(args.includes('--digestfile'))fs.writeFileSync(args[args.indexOf('--digestfile')+1],state.tested);
  fs.writeFileSync(file,JSON.stringify(state));
} else if(args[0]!=='login') process.exit(1);
`,
    { mode: 0o755 },
  );
  writeFileSync(
    join(cwd, "bin/jq"),
    `#!/usr/bin/env node
const fs=require('node:fs');
const args=process.argv.slice(2);
const data=JSON.parse(fs.readFileSync(args[2] || 0,'utf8'));
process.stdout.write((args[1].includes('Labels')?data.Labels['org.opencontainers.image.revision']:data.Digest)+String.fromCharCode(10));
`,
    { mode: 0o755 },
  );
  const state = (): State => JSON.parse(readFileSync(statePath, "utf8"));
  return {
    state,
    run: (script: string) =>
      execFileSync("bash", ["-c", script], {
        cwd,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...process.env,
          PATH: `${join(cwd, "bin")}${delimiter}${process.env.PATH}`,
          IMAGE_TEST_STATE: statePath,
          VERSION: "0.4.0",
          REVISION: "candidate",
          TOKEN: "fixture",
          ACTOR: "KewinDousse",
          GITHUB_OUTPUT: join(cwd, "outputs"),
        },
      }),
  };
}

describe("the exact tested release image", () => {
  it("restores an existing immutable image for testing without changing its digest", () => {
    const f = fixture("sha256:existing");
    f.run(reuse);
    expect(f.state().tested).toBe("sha256:existing");
    expect(f.state().copies[0]).toContain("--preserve-digests");
    f.run(publish);
    expect(f.state().copies).toHaveLength(1);
  });

  it("refuses an existing digest that differs from the tested image", () => {
    const f = fixture("sha256:other");
    expect(() => f.run(publish)).toThrow();
    expect(f.state().copies).toEqual([]);
  });

  it("publishes a missing image with its tested digest intact", () => {
    const f = fixture(null);
    f.run(publish);
    expect(f.state().existing).toBe("sha256:tested");
    expect(f.state().copies[0]).toContain("--preserve-digests");
  });

  it.each([reuse, publish])("refuses registry errors without writing an image", (script) => {
    const f = fixture(null, "permission denied");
    expect(() => f.run(script)).toThrow();
    expect(f.state().copies).toEqual([]);
  });
});
