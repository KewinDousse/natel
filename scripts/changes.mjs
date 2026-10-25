import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const categories = [
  "Upgrade notes",
  "Added",
  "Changed",
  "Deprecated",
  "Removed",
  "Fixed",
  "Security",
];
export const versionPattern =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
export const repository = "KewinDousse/natel";
export const releaseFiles = [
  "package.json",
  "CHANGELOG.md",
  "README.md",
  "docs/deployment.md",
  ".release/prepared.json",
];

export function validateVersion(version) {
  const match =
    typeof version === "string" &&
    version.trim() === version &&
    version.length <= 80 &&
    versionPattern.exec(version);
  if (!match || match[4]?.split(".").some((part) => /^0\d+$/.test(part)))
    throw new Error("Invalid release version");
  return version;
}

export function compareVersions(left, right) {
  const a = versionPattern.exec(validateVersion(left));
  const b = versionPattern.exec(validateVersion(right));
  for (let i = 1; i <= 3; i++) {
    if (BigInt(a[i]) !== BigInt(b[i])) return BigInt(a[i]) > BigInt(b[i]) ? 1 : -1;
  }
  if (!a[4] || !b[4]) return Number(!a[4]) - Number(!b[4]);
  const x = a[4].split(".");
  const y = b[4].split(".");
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if (x[i] === undefined) return -1;
    if (y[i] === undefined) return 1;
    if (x[i] === y[i]) continue;
    const nx = /^\d+$/.test(x[i]);
    const ny = /^\d+$/.test(y[i]);
    if (nx && ny) return BigInt(x[i]) > BigInt(y[i]) ? 1 : -1;
    if (nx !== ny) return nx ? -1 : 1;
    return x[i] > y[i] ? 1 : -1;
  }
  return 0;
}

export function readFragment(source) {
  const entry = JSON.parse(source);
  if (
    !entry ||
    Array.isArray(entry) ||
    Object.keys(entry).some((key) => !["type", "text"].includes(key)) ||
    ![...categories, "None"].includes(entry.type) ||
    typeof entry.text !== "string" ||
    !entry.text.trim() ||
    entry.text.length > 1500 ||
    /\r|\n|<\/?[A-Za-z]/.test(entry.text) ||
    /\b(TODO|TBD|PLACEHOLDER)\b/i.test(entry.text)
  ) {
    throw new Error(
      "A change note needs a supported type and one finished paragraph (or a reason for None)",
    );
  }
  return { type: entry.type, text: entry.text.trim() };
}

export function fragments() {
  return existsSync(".changes")
    ? readdirSync(".changes")
        .sort()
        .map((name) => {
          if (!/^[a-z0-9][a-z0-9-]*\.json$/.test(name))
            throw new Error(`Invalid change note name: ${name}`);
          const path = `.changes/${name}`;
          return { path, ...readFragment(readFileSync(path, "utf8")) };
        })
    : [];
}

export function git(...args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

export function splitUnreleased(changelog) {
  const match = /^## \[Unreleased\]\s*\n([\s\S]*?)(?=^## \[|$(?![\s\S]))/m.exec(changelog);
  if (!match) throw new Error("Missing Unreleased section");
  return {
    before: changelog.slice(0, match.index),
    body: match[1],
    after: changelog.slice(match.index + match[0].length),
  };
}

export function assemble(changelog, notes, version, date) {
  validateVersion(version);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date
  )
    throw new Error("Invalid release date");
  if (changelog.includes(`## [${version}]`)) throw new Error("Version already in changelog");
  const { before, body, after } = splitUnreleased(changelog);
  const sections = new Map(categories.map((name) => [name, []]));
  const core = version.split("-")[0];
  const previews = [
    ...after.matchAll(/^## \[([^\]]+)\] - [^\n]+\n([\s\S]*?)(?=^## \[|$(?![\s\S]))/gm),
  ]
    .filter(
      (match) =>
        match[1].includes("-") &&
        match[1].split("-")[0] === core &&
        compareVersions(match[1], version) < 0,
    )
    .map((match) => match[2]);
  let category;
  for (const line of [...previews.reverse(), body].join("\n").split("\n")) {
    if (!line.trim()) continue;
    if (line.startsWith("### ")) {
      category = line.slice(4).trim();
      if (!sections.has(category)) throw new Error(`Unknown changelog category: ${category}`);
    } else if (line.startsWith("- ") && category) sections.get(category).push(line.slice(2));
    else if (/^\s+\S/.test(line) && category && sections.get(category).length) {
      const items = sections.get(category);
      items[items.length - 1] += ` ${line.trim()}`;
    } else throw new Error("Unexpected content in Unreleased");
  }
  for (const note of notes) if (note.type !== "None") sections.get(note.type).push(note.text);
  const content = [...sections]
    .filter(([, entries]) => entries.length)
    .map(
      ([name, entries]) =>
        `### ${name}\n\n${[...new Set(entries)].map((text) => `- ${text}`).join("\n")}`,
    )
    .join("\n\n");
  if (!content) throw new Error("A release needs at least one user-facing change");
  return `${before}## [Unreleased]\n\n## [${version}] - ${date}\n\n${content}\n\n${after.trimStart()}`;
}

export function releaseNotes(changelog, version) {
  validateVersion(version);
  const start = changelog.indexOf(`## [${version}] - `);
  if (start < 0) throw new Error("Missing dated release notes");
  const rest = changelog.slice(start).split("\n").slice(1).join("\n");
  const next = rest.search(/^## \[/m);
  const body = (next < 0 ? rest : rest.slice(0, next)).trim();
  if (!body) throw new Error("Empty release notes");
  return body.replace(/\]\(([^)\s]+)\)/g, (match, href) => {
    if (/^[a-z][a-z0-9+.-]*:/i.test(href)) {
      if (!href.startsWith("https://")) throw new Error("Release links must use HTTPS");
      return match;
    }
    const url = new URL(href, `https://github.com/${repository}/blob/v${version}/CHANGELOG.md`);
    if (
      url.origin !== "https://github.com" ||
      !url.pathname.startsWith(`/${repository}/blob/v${version}/`)
    )
      throw new Error("Release link escapes the tagged source");
    return `](${url.href})`;
  });
}

export function prepare(version, date = new Date().toISOString().slice(0, 10)) {
  validateVersion(version);
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  if (compareVersions(version, pkg.version) <= 0) throw new Error("Release version must increase");
  if (git("status", "--porcelain"))
    throw new Error("Release preparation requires a clean checkout");
  const baseCommit = git("rev-parse", "HEAD");
  const notes = fragments();
  const changelog = assemble(readFileSync("CHANGELOG.md", "utf8"), notes, version, date);
  const next = {
    "CHANGELOG.md": changelog,
    "package.json": `${JSON.stringify({ ...pkg, version }, null, 2)}\n`,
  };
  if (!version.includes("-")) {
    for (const path of ["README.md", "docs/deployment.md"]) {
      next[path] = readFileSync(path, "utf8").replace(
        /ghcr\.io\/kewindousse\/natel:\d+\.\d+\.\d+(?:-[\w.-]+)?/g,
        `ghcr.io/kewindousse/natel:${version}`,
      );
    }
  }
  const prepared = { version, date, baseCommit, fragments: notes.map((note) => note.path) };
  for (const [path, body] of Object.entries(next)) writeFileSync(path, body);
  for (const note of notes) rmSync(note.path);
  return prepared;
}

function readRevision(ref, path) {
  return execFileSync("git", ["show", `${ref}:${path}`], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

export function verifyPrepared(version, ref = "HEAD") {
  validateVersion(version);
  const read = (path) => readRevision(ref, path);
  const pending = git("ls-tree", "-r", "--name-only", ref, "--", ".changes")
    .split("\n")
    .filter(Boolean);
  const meta = JSON.parse(read(".release/prepared.json"));
  if (
    meta.version !== version ||
    !/^[a-f0-9]{40}$/.test(meta.baseCommit) ||
    !Array.isArray(meta.fragments)
  )
    throw new Error("Invalid release preparation");
  git("merge-base", "--is-ancestor", meta.baseCommit, ref);
  const changed = git("diff", "--name-only", `${meta.baseCommit}..${ref}`)
    .split("\n")
    .filter(Boolean);
  if (changed.some((path) => !releaseFiles.includes(path) && !meta.fragments.includes(path)))
    throw new Error("Source changed since release preparation; prepare again");
  const previousNotes = git("ls-tree", "-r", "--name-only", meta.baseCommit, "--", ".changes")
    .split("\n")
    .filter(Boolean)
    .sort();
  if (JSON.stringify(previousNotes) !== JSON.stringify([...meta.fragments].sort()))
    throw new Error("Release must account for every pending change note");
  for (const path of meta.fragments) {
    if (!/^\.changes\/[a-z0-9][a-z0-9-]*\.json$/.test(path) || pending.includes(path))
      throw new Error("Unconsumed change note");
    readFragment(git("show", `${meta.baseCommit}:${path}`));
  }
  const previousPackage = JSON.parse(git("show", `${meta.baseCommit}:package.json`));
  if (compareVersions(version, previousPackage.version) <= 0)
    throw new Error("Release version must increase");
  if (read("package.json") !== `${JSON.stringify({ ...previousPackage, version }, null, 2)}\n`)
    throw new Error("Only the version may change in the prepared package.json");
  for (const path of ["README.md", "docs/deployment.md"]) {
    const previous = readRevision(meta.baseCommit, path);
    const expected = version.includes("-")
      ? previous
      : previous.replace(
          /ghcr\.io\/kewindousse\/natel:\d+\.\d+\.\d+(?:-[\w.-]+)?/g,
          `ghcr.io/kewindousse/natel:${version}`,
        );
    if (read(path) !== expected) throw new Error(`Unexpected preparation changes in ${path}`);
  }
  const changelog = read("CHANGELOG.md");
  const current = splitUnreleased(changelog);
  const previous = splitUnreleased(readRevision(meta.baseCommit, "CHANGELOG.md"));
  const prefix = `## [${version}] - ${meta.date}\n`;
  const next = current.after.indexOf("\n## [", prefix.length);
  const history = next < 0 ? "" : current.after.slice(next + 1);
  if (
    current.before !== previous.before ||
    !current.after.startsWith(prefix) ||
    history !== previous.after ||
    current.body.trim() ||
    pending.length
  )
    throw new Error("Release must preserve published notes and consume all pending notes");
  return releaseNotes(changelog, version);
}

export function checkChanges(base) {
  const notes = fragments();
  const added = git(
    "diff",
    "--name-only",
    "--diff-filter=A",
    `${base}...HEAD`,
    "--",
    ".changes",
  ).split("\n");
  if (notes.some((note) => added.includes(note.path))) return;
  if (existsSync(".release/prepared.json")) {
    const version = JSON.parse(readFileSync("package.json", "utf8")).version;
    verifyPrepared(version);
    if (
      git("diff", "--name-only", `${base}...HEAD`)
        .split("\n")
        .every(
          (path) =>
            releaseFiles.includes(path) || /^\.changes\/[a-z0-9][a-z0-9-]*\.json$/.test(path),
        )
    )
      return;
  }
  throw new Error(
    "Add a .changes/*.json note, or a None note explaining why no user-facing note is needed",
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [command, value] = process.argv.slice(2);
  if (command === "check") checkChanges(value);
  else if (command === "validate") fragments();
  else if (command === "notes")
    process.stdout.write(`${releaseNotes(readFileSync("CHANGELOG.md", "utf8"), value)}\n`);
  else if (command === "verify") process.stdout.write(`${verifyPrepared(value)}\n`);
  else
    throw new Error(
      "Usage: node scripts/changes.mjs check BASE | validate | notes VERSION | verify VERSION",
    );
}
