import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  compareVersions,
  git,
  prepare,
  repository,
  validateVersion,
  verifyPrepared,
} from "./changes.mjs";

function api(path, method = "GET", body, token = process.env.GH_TOKEN) {
  const args = ["api", `repos/${repository}/${path}`, "--method", method];
  if (body !== undefined) args.push("--input", "-");
  try {
    const result = execFileSync("gh", args, {
      encoding: "utf8",
      env: { ...process.env, GH_TOKEN: token },
      input: body === undefined ? undefined : JSON.stringify(body),
      stdio: ["pipe", "pipe", "pipe"],
    });
    return result.trim() ? JSON.parse(result) : null;
  } catch (error) {
    if (method === "GET" && String(error.stderr).includes("(HTTP 404)")) return null;
    throw new Error(`GitHub operation failed: ${method} ${path}`, { cause: error });
  }
}

function output(name, value) {
  if (process.env.GITHUB_OUTPUT)
    writeFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`, { flag: "a" });
}

function assertRepository(expected) {
  if (process.env.GITHUB_REPOSITORY !== expected || process.env.GITHUB_REF !== "refs/heads/main")
    throw new Error(`This release operation runs on ${expected} main only`);
}

export function promotion(version, releases) {
  validateVersion(version);
  if (version.includes("-")) return { latest: false, minor: false };
  const stable = releases
    .filter((release) => !release.draft && !release.prerelease)
    .map((release) => release.tag_name?.replace(/^v/, ""))
    .filter((value) => {
      try {
        validateVersion(value);
        return !value.includes("-");
      } catch {
        return false;
      }
    });
  const prefix = version.split(".").slice(0, 2).join(".");
  return {
    latest: stable.every((value) => compareVersions(version, value) >= 0),
    minor: stable
      .filter((value) => value.split(".").slice(0, 2).join(".") === prefix)
      .every((value) => compareVersions(version, value) >= 0),
  };
}

function allReleases() {
  const releases = [];
  for (let page = 1; ; page++) {
    const batch = api(`releases?per_page=100&page=${page}`);
    if (!Array.isArray(batch)) throw new Error("Cannot read release history");
    releases.push(...batch);
    if (batch.length < 100) return releases;
  }
}

export function assertReleaseOwner() {
  assertRepository(repository);
  if (
    process.env.GITHUB_EVENT_NAME !== "workflow_dispatch" ||
    process.env.GITHUB_ACTOR !== "KewinDousse" ||
    process.env.GITHUB_ACTOR_ID !== "1529017" ||
    process.env.GITHUB_TRIGGERING_ACTOR !== "KewinDousse"
  )
    throw new Error("Only KewinDousse may start or rerun a public release");
}

function assertReleaseEnvironment() {
  const environment = api("environments/release");
  const review = environment?.protection_rules?.find((rule) => rule.type === "required_reviewers");
  const reviewers = review?.reviewers;
  const branches = api("environments/release/deployment-branch-policies")?.branch_policies;
  if (
    environment?.can_admins_bypass !== false ||
    review?.prevent_self_review !== false ||
    reviewers?.length !== 1 ||
    reviewers[0]?.type !== "User" ||
    reviewers[0]?.reviewer?.id !== 1529017 ||
    !environment?.deployment_branch_policy?.custom_branch_policies ||
    branches?.length !== 1 ||
    branches[0]?.name !== "main" ||
    branches[0]?.type !== "branch"
  )
    throw new Error(
      "Configure the release environment for KewinDousse approval on main only, without administrator bypass",
    );
}

function candidateSummary(version, sha) {
  const notes = verifyPrepared(version, sha);
  const meta = JSON.parse(git("show", `${sha}:.release/prepared.json`));
  const promote = promotion(version, allReleases());
  const summary = `# Natel ${version}\n\nCommit: \`${sha}\`\n\nSource: \`${meta.baseCommit}\`\n\nChannel: ${version.includes("-") ? "prerelease" : "stable"}\n\nDocker aliases: ${[promote.minor && version.split(".").slice(0, 2).join("."), promote.latest && "latest"].filter(Boolean).join(", ") || "none"} (rechecked before publication)\n\n${notes}\n\nPublication waits for KewinDousse to approve the release environment after CI succeeds. Approval covers this exact commit and these notes.\n`;
  if (process.env.GITHUB_STEP_SUMMARY) writeFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
  const bundle = resolve(process.env.CANDIDATE_BUNDLE || "../candidate.bundle");
  git("bundle", "create", bundle, "HEAD");
  output("sha", sha);
  output("version", version);
}

function prepareRelease(version) {
  assertReleaseOwner();
  assertReleaseEnvironment();
  const existing = api(`git/ref/tags/v${version}`);
  if (existing) {
    const sha = validateExistingTag(version, existing);
    git("checkout", "--detach", sha);
    candidateSummary(version, sha);
  } else {
    const current = JSON.parse(readFileSync("package.json", "utf8")).version;
    if (current !== version) {
      const meta = prepare(version);
      mkdirSync(".release", { recursive: true });
      writeFileSync(".release/prepared.json", `${JSON.stringify(meta, null, 2)}\n`);
      git(
        "add",
        "--",
        "package.json",
        "CHANGELOG.md",
        "README.md",
        "docs/deployment.md",
        ".release/prepared.json",
        ...meta.fragments,
      );
      git("commit", "-m", `Prepare release ${version}`);
    }
    candidateSummary(version, git("rev-parse", "HEAD"));
  }
  output("tag_exists", String(Boolean(existing)));
}

function validateExistingTag(version, existing) {
  const sha = existing.object?.sha;
  if (typeof sha !== "string" || !/^[a-f0-9]{40}$/.test(sha))
    throw new Error("Invalid release tag object");
  try {
    git("cat-file", "-e", sha);
  } catch {
    git("fetch", "--no-tags", "https://github.com/KewinDousse/natel.git", sha);
  }
  const commit = git("rev-parse", `${sha}^{commit}`);
  try {
    verifyPrepared(version, commit);
    return commit;
  } catch (error) {
    throw new Error(`Tag v${version} has no valid release preparation; its workflow will not run`, {
      cause: error,
    });
  }
}

function publishRelease(version) {
  assertReleaseOwner();
  assertReleaseEnvironment();
  const sha = git("rev-parse", "HEAD");
  if (sha !== process.env.CANDIDATE_SHA)
    throw new Error("Release candidate differs from the approved commit");
  verifyPrepared(version);
  const tag = `v${version}`;
  const existing = api(`git/ref/tags/${tag}`);
  if (existing) {
    if (validateExistingTag(version, existing) !== sha)
      throw new Error("Release tag differs from the approved commit");
    return;
  }
  const token = process.env.RELEASE_TAG_TOKEN;
  if (!token) throw new Error("Configure the release App in the protected release environment");
  const base = JSON.parse(readFileSync(".release/prepared.json", "utf8")).baseCommit;
  // main must accept the release commit without overwriting work.
  const head = api("git/ref/heads/main", "GET", undefined, token)?.object?.sha;
  if (head !== base && head !== sha)
    throw new Error("main changed; prepare and review the release again");
  if (head !== sha) {
    execFileSync("git", ["push", `https://github.com/${repository}.git`, "HEAD:refs/heads/main"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        GIT_CONFIG_COUNT: "1",
        GIT_CONFIG_KEY_0: "http.https://github.com/.extraheader",
        GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${token}`).toString("base64")}`,
      },
    });
  }
  api("git/refs", "POST", { ref: `refs/tags/${tag}`, sha }, token);
}

function planRelease() {
  assertReleaseOwner();
  const version = validateVersion(process.env.RELEASE_VERSION);
  verifyPrepared(version);
  const promote = promotion(version, allReleases());
  output("version", version);
  output("latest", String(promote.latest));
  output("minor", String(promote.minor));
}

function recordRelease(version) {
  assertReleaseOwner();
  const body = verifyPrepared(version);
  const existing = api(`releases/tags/v${version}`);
  if (existing) {
    if (
      existing.draft ||
      existing.prerelease !== version.includes("-") ||
      existing.body?.trim() !== body.trim()
    )
      throw new Error(
        "Published release differs from the prepared notes; it will not be overwritten",
      );
    return;
  }
  api("releases", "POST", {
    tag_name: `v${version}`,
    name: `Natel ${version}`,
    body,
    prerelease: version.includes("-"),
    make_latest: promotion(version, allReleases()).latest ? "true" : "false",
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [command, rawVersion] = process.argv.slice(2);
  if (command === "plan") planRelease();
  else {
    const version = validateVersion(rawVersion);
    if (command === "prepare") prepareRelease(version);
    else if (command === "publish") publishRelease(version);
    else if (command === "record") recordRelease(version);
    else if (command === "manifest") {
      assertReleaseOwner();
      if (version.includes("-")) throw new Error("The public manifest is stable only");
      writeFileSync(
        "dist-demo/version.json",
        `${JSON.stringify({ version, releaseUrl: `https://github.com/${repository}/releases/tag/v${version}` })}\n`,
      );
    } else throw new Error("Unknown release command");
  }
}
