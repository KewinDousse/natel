// @vitest-environment node
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const directories: string[] = [];
const script = new URL("../../scripts/changes.mjs", import.meta.url).href;
afterEach(() => {
  for (const path of directories.splice(0)) rmSync(path, { recursive: true, force: true });
});

function fixture() {
  const cwd = mkdtempSync(join(tmpdir(), "natel-release-test-"));
  directories.push(cwd);
  const git = (...args: string[]) =>
    execFileSync(
      "git",
      [
        "-c",
        "user.name=Release test",
        "-c",
        "user.email=release-test@example.invalid",
        "-c",
        "commit.gpgsign=false",
        ...args,
      ],
      { cwd, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
    ).trim();
  git("init", "-q");
  mkdirSync(join(cwd, "docs"));
  mkdirSync(join(cwd, ".changes"));
  writeFileSync(
    join(cwd, "biome.json"),
    readFileSync(new URL("../../biome.json", import.meta.url)),
  );
  writeFileSync(
    join(cwd, "package.json"),
    `${JSON.stringify({ version: "0.3.1", dependencies: { example: "1.0.0" } }, null, 2)}\n`,
  );
  writeFileSync(
    join(cwd, "CHANGELOG.md"),
    "# Changelog\n\n## [Unreleased]\n\n## [0.3.1] - 2026-10-20\n\n### Fixed\n\n- Published history.\n",
  );
  for (const path of ["README.md", "docs/deployment.md"])
    writeFileSync(join(cwd, path), "Use ghcr.io/kewindousse/natel:0.3.1.\n");
  writeFileSync(
    join(cwd, ".changes/feature.json"),
    JSON.stringify({ type: "Added", text: "A user-visible feature." }),
  );
  writeFileSync(join(cwd, "source.txt"), "implementation\n");
  git("add", ".");
  git("commit", "-qm", "Initial fixture");
  const base = git("rev-parse", "HEAD");
  const run = (body: string) =>
    execFileSync(
      process.execPath,
      ["--input-type=module", "-e", `import * as changes from ${JSON.stringify(script)}; ${body}`],
      { cwd, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
    );
  const prepare = () => {
    const meta = run('console.log(JSON.stringify(changes.prepare("0.4.0", "2026-10-24")))');
    mkdirSync(join(cwd, ".release"));
    writeFileSync(join(cwd, ".release/prepared.json"), meta);
    git("add", ".");
    git("commit", "-qm", "Prepare release");
  };
  return { cwd, git, run, prepare, base };
}

describe("the release preparation contract", () => {
  it("accepts a prepared release and its changelog check without another fragment", () => {
    const f = fixture();
    f.prepare();
    expect(f.run('console.log(changes.verifyPrepared("0.4.0"))')).toContain(
      "A user-visible feature.",
    );
    expect(() => f.run(`changes.checkChanges(${JSON.stringify(f.base)})`)).not.toThrow();
  });
  it("allows wording edits to the new notes, preserving the published history", () => {
    const f = fixture();
    f.prepare();
    const path = join(f.cwd, "CHANGELOG.md");
    writeFileSync(
      path,
      readFileSync(path, "utf8").replace(
        "A user-visible feature.",
        "A clearer description of the feature.",
      ),
    );
    f.git("add", ".");
    f.git("commit", "-qm", "Polish notes");
    expect(f.run('console.log(changes.verifyPrepared("0.4.0"))')).toContain(
      "A clearer description",
    );
  });
  it("rejects source changes after preparation", () => {
    const f = fixture();
    f.prepare();
    writeFileSync(join(f.cwd, "source.txt"), "another implementation\n");
    f.git("add", ".");
    f.git("commit", "-qm", "More code");
    expect(() => f.run('console.log(changes.verifyPrepared("0.4.0"))')).toThrow();
  });
  it("rejects dependency changes disguised as release preparation", () => {
    const f = fixture();
    f.prepare();
    const path = join(f.cwd, "package.json");
    writeFileSync(
      path,
      readFileSync(path, "utf8").replace('"example": "1.0.0"', '"example": "2.0.0"'),
    );
    f.git("add", ".");
    f.git("commit", "-qm", "Change dependency");
    expect(() => f.run('console.log(changes.verifyPrepared("0.4.0"))')).toThrow();
  });
  it("requires a changelog decision on ordinary pull requests", () => {
    const f = fixture();
    writeFileSync(join(f.cwd, "source.txt"), "another implementation\n");
    f.git("add", ".");
    f.git("commit", "-qm", "Change without a note");
    expect(() => f.run(`changes.checkChanges(${JSON.stringify(f.base)})`)).toThrow();
    writeFileSync(
      join(f.cwd, ".changes/internal.json"),
      JSON.stringify({ type: "None", text: "Internal refactor with no change in behaviour." }),
    );
    f.git("add", ".");
    f.git("commit", "-qm", "Record the decision");
    expect(() => f.run(`changes.checkChanges(${JSON.stringify(f.base)})`)).not.toThrow();
  });
});

type GitHubState = {
  refs: Record<string, string>;
  releases: { tag_name: string; draft?: boolean; prerelease?: boolean }[];
  calls: {
    path: string;
    repository: string;
    method: string;
    token: string;
    body?: Record<string, unknown>;
  }[];
  pushes: string[];
  protected: boolean;
  environment?: Record<string, unknown>;
  failPush: string;
};

function github(f: ReturnType<typeof fixture>) {
  const bin = mkdtempSync(join(tmpdir(), "natel-release-gh-"));
  directories.push(bin);
  const realGit = execFileSync("sh", ["-c", "command -v git"], { encoding: "utf8" }).trim();
  const statePath = join(bin, "state.json");
  const base = f.base;
  const initial: GitHubState = {
    refs: {
      "KewinDousse/natel/refs/heads/main": base,
    },
    releases: [],
    calls: [],
    pushes: [],
    protected: true,
    failPush: "",
  };
  writeFileSync(statePath, JSON.stringify(initial));
  writeFileSync(
    join(bin, "git"),
    `#!/usr/bin/env node
const fs=require('node:fs');
const cp=require('node:child_process');
const args=process.argv.slice(2);
if(args[0]!=='push') { const result=cp.spawnSync(${JSON.stringify(realGit)},args,{stdio:'inherit'});process.exit(result.status ?? 1); }
const state=JSON.parse(fs.readFileSync(process.env.RELEASE_TEST_STATE,'utf8'));
const target=args[1].replace('https://github.com/','').replace('.git','');
if(state.failPush===target)process.exit(1);
state.pushes.push(target);
state.refs[target+'/refs/heads/main']=cp.execFileSync(${JSON.stringify(realGit)},['rev-parse','HEAD'],{encoding:'utf8'}).trim();
fs.writeFileSync(process.env.RELEASE_TEST_STATE,JSON.stringify(state));
`,
    { mode: 0o755 },
  );
  writeFileSync(
    join(bin, "gh"),
    `#!/usr/bin/env node
const fs=require('node:fs');
const file=process.env.RELEASE_TEST_STATE;
const state=JSON.parse(fs.readFileSync(file,'utf8'));
const args=process.argv.slice(2);
const save=()=>fs.writeFileSync(file,JSON.stringify(state));
const reply=value=>{save();process.stdout.write(JSON.stringify(value));};
const fail=code=>{save();process.stderr.write('gh: fixture (HTTP '+code+')');process.exit(1);};
if(args[0]!=='api')fail(500);
const repository=args[1].split('/').slice(1,3).join('/');
const path=args[1].split('/').slice(3).join('/');
const method=args[args.indexOf('--method')+1];
const body=args.includes('--input')?JSON.parse(fs.readFileSync(0,'utf8')):undefined;
state.calls.push({path,repository,method,body,token:process.env.GH_TOKEN});
if(method==='GET' && path==='environments/release') reply(state.environment ?? {can_admins_bypass:false,protection_rules:state.protected?[{type:'required_reviewers',prevent_self_review:false,reviewers:[{type:'User',reviewer:{id:1529017}}]}]:[],deployment_branch_policy:{custom_branch_policies:true}});
else if(method==='GET' && path==='environments/release/deployment-branch-policies') reply({branch_policies:[{name:'main',type:'branch'}]});
else if(method==='GET' && path.startsWith('git/ref/')) {const sha=state.refs[repository+'/'+path.replace('git/ref/','refs/')];if(!sha)fail(404);reply({object:{sha,type:'commit'}});}
else if(method==='GET' && path.startsWith('releases?')) {const page=Number(new URL('https://fixture.invalid/?'+path.split('?')[1]).searchParams.get('page'));reply(state.releases.slice((page-1)*100,page*100));}
else if(method==='GET' && path.startsWith('releases/tags/')) fail(404);
else if(method==='POST' && path==='releases') reply(body);
else if(method==='POST' && path==='git/refs') {const key=repository+'/'+body.ref;if(state.refs[key])fail(422);state.refs[key]=body.sha;reply({});}
else fail(500);
`,
    { mode: 0o755 },
  );
  const read = (): GitHubState => JSON.parse(readFileSync(statePath, "utf8"));
  const write = (state: GitHubState) => writeFileSync(statePath, JSON.stringify(state));
  const run = (operation: string, environment: Record<string, string> = {}, version = "0.4.0") =>
    execFileSync(
      process.execPath,
      [fileURLToPath(new URL("../../scripts/release.mjs", import.meta.url)), operation, version],
      {
        cwd: f.cwd,
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
        env: {
          ...process.env,
          PATH: `${bin}${delimiter}${process.env.PATH}`,
          RELEASE_TEST_STATE: statePath,
          GITHUB_OUTPUT: join(bin, "outputs"),
          GITHUB_STEP_SUMMARY: join(bin, "summary"),
          CANDIDATE_BUNDLE: join(bin, "candidate.bundle"),
          GITHUB_REPOSITORY: "KewinDousse/natel",
          GITHUB_REF: "refs/heads/main",
          GITHUB_EVENT_NAME: "workflow_dispatch",
          GITHUB_ACTOR: "KewinDousse",
          GITHUB_ACTOR_ID: "1529017",
          GITHUB_TRIGGERING_ACTOR: "KewinDousse",
          GH_TOKEN: "workflow-fixture",
          RELEASE_TAG_TOKEN: "app-fixture",
          RELEASE_VERSION: version,
          CANDIDATE_SHA: f.git("rev-parse", "HEAD"),
          GIT_AUTHOR_NAME: "Release test",
          GIT_AUTHOR_EMAIL: "release-test@example.invalid",
          GIT_COMMITTER_NAME: "Release test",
          GIT_COMMITTER_EMAIL: "release-test@example.invalid",
          GIT_CONFIG_COUNT: "1",
          GIT_CONFIG_KEY_0: "commit.gpgsign",
          GIT_CONFIG_VALUE_0: "false",
          ...environment,
        },
      },
    );
  return {
    run,
    read,
    write,
    bundle: join(bin, "candidate.bundle"),
    summary: () => readFileSync(join(bin, "summary"), "utf8"),
    outputs: () => readFileSync(join(bin, "outputs"), "utf8"),
  };
}

describe("the single public release workflow", () => {
  it.each<Record<string, string>>([
    { GITHUB_REPOSITORY: "example/copy" },
    { GITHUB_REF: "refs/heads/feature" },
    { GITHUB_EVENT_NAME: "push" },
    { GITHUB_ACTOR: "contributor", GITHUB_ACTOR_ID: "1" },
    { GITHUB_ACTOR_ID: "1" },
    { GITHUB_TRIGGERING_ACTOR: "contributor" },
  ])("rejects unauthorized launches and reruns before any API call: %j", (environment) => {
    const f = fixture();
    const gh = github(f);
    for (const command of ["prepare", "publish", "record", "plan", "manifest"])
      expect(() => gh.run(command, environment)).toThrow();
    expect(gh.read().calls).toEqual([]);
    expect(gh.read().pushes).toEqual([]);
  });

  it("fails closed when human approval is not configured", () => {
    const f = fixture();
    const gh = github(f);
    const state = gh.read();
    state.protected = false;
    gh.write(state);
    expect(() => gh.run("prepare")).toThrow();
    expect(f.git("rev-parse", "HEAD")).toBe(f.base);
    expect(gh.read().calls.every((call) => call.method === "GET")).toBe(true);
  });

  it.each([
    { bypass: true, reviewers: [1529017], selfReview: false },
    { bypass: false, reviewers: [1529017, 1], selfReview: false },
    { bypass: false, reviewers: [1], selfReview: false },
    { bypass: false, reviewers: [1529017], selfReview: true },
  ])("rejects broader approval rules or an unusable self-approval policy: %j", (policy) => {
    const f = fixture();
    const gh = github(f);
    const state = gh.read();
    state.environment = {
      can_admins_bypass: policy.bypass,
      protection_rules: [
        {
          type: "required_reviewers",
          prevent_self_review: policy.selfReview,
          reviewers: policy.reviewers.map((id) => ({ type: "User", reviewer: { id } })),
        },
      ],
      deployment_branch_policy: { custom_branch_policies: true },
    };
    gh.write(state);
    expect(() => gh.run("prepare")).toThrow();
    expect(gh.read().pushes).toEqual([]);
  });

  it("prepares a restorable bundle at the workflow's valid artifact upload path", () => {
    const f = fixture();
    const gh = github(f);
    const workflow = readFileSync(
      new URL("../../.github/workflows/release.yml", import.meta.url),
      "utf8",
    );
    const uploadPath = /^ {10}path: (.+)$/m.exec(workflow)?.[1];
    const bundlePath = /^ {10}CANDIDATE_BUNDLE: (.+)$/m.exec(workflow)?.[1];
    if (!uploadPath || !bundlePath) throw new Error("The workflow must configure its bundle paths");
    expect(uploadPath).not.toMatch(/(^|\/)\.\.?($|\/)/);
    const resolveTemp = (path: string) =>
      path.replaceAll(/\$\{\{\s*runner\.temp\s*\}\}/g, dirname(gh.bundle));
    gh.run("prepare", { CANDIDATE_BUNDLE: resolveTemp(bundlePath) });
    execFileSync("biome", ["check", ".release/prepared.json"], {
      cwd: f.cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const sha = f.git("rev-parse", "HEAD");
    expect(gh.summary()).toContain(sha);
    expect(gh.summary()).toContain("A user-visible feature.");
    expect(gh.read().calls.every((call) => call.method === "GET")).toBe(true);
    expect(gh.read().pushes).toEqual([]);
    f.git("checkout", "--detach", f.base);
    f.git("fetch", resolveTemp(uploadPath), "HEAD");
    expect(f.git("rev-parse", "FETCH_HEAD")).toBe(sha);
    f.git("checkout", "--detach", "FETCH_HEAD");
    expect(f.run('console.log(changes.verifyPrepared("0.4.0"))')).toContain(
      "A user-visible feature.",
    );
  });

  it("publishes the approved commit to existing main branches and creates just one immutable tag", () => {
    const f = fixture();
    const gh = github(f);
    gh.run("prepare");
    const sha = f.git("rev-parse", "HEAD");
    gh.run("publish");
    const state = gh.read();
    expect(state.pushes).toEqual(["KewinDousse/natel"]);
    expect(state.refs["KewinDousse/natel/refs/tags/v0.4.0"]).toBe(sha);
    expect(state.calls.filter((call) => call.method === "POST").map((call) => call.path)).toEqual([
      "git/refs",
    ]);
    expect(state.calls.find((call) => call.method === "POST")?.token).toBe("app-fixture");
    gh.run("publish", { RELEASE_TAG_TOKEN: "" });
    expect(gh.read().pushes).toHaveLength(1);
  });

  it("refuses a changed candidate or an advanced repository without remote writes", () => {
    const f = fixture();
    const gh = github(f);
    gh.run("prepare");
    expect(() => gh.run("publish", { CANDIDATE_SHA: f.base })).toThrow();
    const state = gh.read();
    state.refs["KewinDousse/natel/refs/heads/main"] = "a".repeat(40);
    gh.write(state);
    expect(() => gh.run("publish")).toThrow();
    expect(gh.read().pushes).toEqual([]);
    expect(gh.read().calls.every((call) => call.method === "GET")).toBe(true);
  });

  it("resumes after a failed push without changing the candidate or an existing ref", () => {
    const f = fixture();
    const gh = github(f);
    gh.run("prepare");
    const sha = f.git("rev-parse", "HEAD");
    const state = gh.read();
    state.failPush = "KewinDousse/natel";
    gh.write(state);
    expect(() => gh.run("publish")).toThrow();
    const failed = gh.read();
    expect(failed.refs["KewinDousse/natel/refs/heads/main"]).toBe(f.base);
    expect(failed.refs["KewinDousse/natel/refs/tags/v0.4.0"]).toBeUndefined();
    failed.failPush = "";
    gh.write(failed);
    gh.run("publish");
    expect(gh.read().refs["KewinDousse/natel/refs/tags/v0.4.0"]).toBe(sha);
  });

  it("creates the tag without pushing again when main already has the candidate", () => {
    const f = fixture();
    const gh = github(f);
    gh.run("prepare");
    const sha = f.git("rev-parse", "HEAD");
    const state = gh.read();
    state.refs["KewinDousse/natel/refs/heads/main"] = sha;
    gh.write(state);
    gh.run("publish");
    expect(gh.read().pushes).toEqual([]);
    expect(gh.read().refs["KewinDousse/natel/refs/tags/v0.4.0"]).toBe(sha);
  });

  it("refuses historical unprepared tags and tags pointing to another commit", () => {
    const f = fixture();
    const gh = github(f);
    const state = gh.read();
    state.refs["KewinDousse/natel/refs/tags/v0.4.0"] = f.base;
    gh.write(state);
    expect(() => gh.run("prepare")).toThrow();
    expect(gh.read().pushes).toEqual([]);
  });

  it("rechecks promotion after a newer publication instead of reusing an earlier plan", () => {
    const f = fixture();
    f.prepare();
    const gh = github(f);
    gh.run("plan");
    expect(gh.outputs()).toContain("latest=true");
    const state = gh.read();
    state.releases.push({ tag_name: "v0.4.1" });
    gh.write(state);
    gh.run("plan");
    expect(gh.outputs()).toMatch(/latest=false\nminor=false\n$/);
    gh.run("record", { PROMOTE_LATEST: "true" });
    expect(gh.read().calls.find((call) => call.path === "releases")?.body?.make_latest).toBe(
      "false",
    );
  });
});
