# Contributing to Natel

Natel is small on purpose. Read the [scope](README.md#scope) before proposing
a feature. Small fixes can go straight to a pull request; open an issue
first for a new feature, dependency or behaviour decision.

## Rules

[AGENTS.md](AGENTS.md) holds the rules every change follows, whoever writes
it: the invariants, the allowed stack and the code conventions. Put code
where the [architecture](docs/ARCHITECTURE.md) says, follow the
[design](docs/DESIGN.md), and record an accepted behaviour decision in
[DECISIONS.md](docs/DECISIONS.md).

## Where to start

[DECISIONS.md](docs/DECISIONS.md) is a reference, not something to read
through. Four entries explain most of the code:

- ADR 005: unknown vCard properties are preserved, and only a subset is
  edited.
- ADR 006: every write is conditional, and a conflict is shown to the user.
- ADR 009: how the app reaches the CardDAV server through `/dav`.
- ADR 032: the sign-in sessions held by `natel-session`.

Then, depending on the change:

- the screens: `src/routes/` (thin), `src/components/` and `src/lib/` (edit
  drafts, validation, sorting, search), with [DESIGN.md](docs/DESIGN.md);
- reading and writing vCards: `src/vcard/`, the `Contact` type in
  `src/model/contact.ts`, and the tests in `tests/vcard/`;
- talking to the server: `src/dav/` and `src/queries/`;
- the proxy, sign-in sessions and the image: `Caddyfile`, `session/` and
  `Dockerfile`.

## Setup

Use Node 24 and the pnpm version pinned in `package.json` (`corepack enable`).
From your clone:

```sh
pnpm install --frozen-lockfile
VITE_DAV_URL=http://127.0.0.1:5232 pnpm dev
```

The server URL above is an example: use an existing test CardDAV server's
origin, without a path. Never use real contacts for an unfamiliar change.
To explore the UI without a server:

```sh
VITE_DEMO=1 pnpm dev
```

The demo keeps made-up contacts in memory.
The regular build requires a server; `pnpm dev` is for development only.

## Checks

```sh
pnpm check       # typecheck, Biome lint/format, unit tests
```

`natel-session`, the image's entrypoint and session process, is Go with no
dependency. Changes under `session/` need its checks, with Go 1.27 from
`session/`:

```sh
test -z "$(gofmt -l .)" && go vet ./... && go test ./...
```

or with Docker, from the repository's root:

```sh
docker run --rm -v "$PWD/session":/src -w /src golang:1.27-alpine \
  sh -c 'test -z "$(gofmt -l .)" && go vet ./... && go test ./...'
```

`pnpm dev` and the end-to-end suite don't need Go: Vite mirrors the session
contract (`session/dev-session.ts`).

The main end-to-end suite starts a throwaway CardDAV server and serves the
production build. It needs Python 3, and Playwright's Chromium, Firefox and
WebKit (Firefox runs the sign-in tests only, WebKit the main flows):

```sh
python3 -m venv ~/.cache/natel-e2e
~/.cache/natel-e2e/bin/pip install -r tests/e2e/requirements.txt
export PATH="$HOME/.cache/natel-e2e/bin:$PATH"
pnpm exec playwright install --with-deps chromium firefox webkit
pnpm e2e:demo
pnpm e2e
E2E_SERVER=xandikos pnpm e2e
E2E_SERVER=baikal pnpm e2e    # also needs Docker
```

Radicale is the default. The suite uses isolated test ports and fresh
storage. CI also runs against Baïkal and the built Docker image. The Docker
image is built for amd64 and arm64; its browser tests execute the amd64 image.

Never commit real contacts. `tests/fixtures/public/` contains made-up
cards; `tests/fixtures/private/` is ignored for local checks. Never modify
an existing fixture: add a new one.

## Pull requests

Keep one feature or fix per branch and open the pull request as a **draft**.
Explain the problem and resulting behaviour briefly, then list the checks
run and any limits. New behaviour needs a test; for a bug, write a regression
test first. Commit messages are one imperative line in English, saying why
when it isn't obvious.

The checks above pass before you ask for a review; Baïkal can be left to
CI. A draft runs no CI: marking the pull request ready starts it, unless it
only changes Markdown or `docs/`. The maintainer
reviews the proposal before publication; changes under `src/vcard/`,
`src/dav/` and photo encoding need particular care because they handle your
data. Do not include credentials or personal contacts in issues, logs or
captures.

## Changelog

The changelog is for people using and hosting Natel. Include features,
observable behaviour changes, user-facing fixes, security fixes and deployment
changes. Internal refactors, tests and CI work need no published entry unless
they affect installation or use. Dependency updates need an entry when their
practical effect or an applicable security fix is known.

Each pull request adds one or more `.changes/<short-name>.json` files:

```json
{
  "type": "Added",
  "text": "A contact can have several addresses, each with its own label."
}
```

Use `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed` or `Security`.
Use `Upgrade notes` for an action, incompatibility, new requirement or a change
in defaults that operators need to know before updating. These notes come first.
For a pull request without a user-facing change, use `None` and explain why in
`text`; that reason is checked but not published. This applies to documentation
and dependency pull requests too. Names use lowercase letters, digits and hyphens.

Write one finished paragraph per file, in plain English, normally one or two
sentences. Describe the result and the conditions under which it matters.
Implementation details belong in technical documentation unless they help someone
act or understand a limit. Put important items first and link to detailed upgrade
instructions. Give the risk and affected installations for a security fix; a
new dependency version alone does not establish that a vulnerability is fixed.

Run `pnpm changes:validate` locally. The separate **Changelog decision** check
requires a new valid note or a justified `None` before merging. Configure it as a
required check on `main`, applying it to administrators too; creating the workflow
alone does not enforce it. Draft pull requests run no checks.

The Release action assembles fragments and existing `Unreleased` entries, removes
consumed files and updates `CHANGELOG.md` in its frozen candidate. Review the wording,
group related entries and remove duplication before starting the action. Reject its
approval if the summary needs editing; changed notes require a new candidate. Each release
has a version and a `YYYY-MM-DD` date, newest first, with no empty categories.
Published notes stay stable; factual corrections must be explicit. GitHub Releases
reuse the validated notes, with documentation links pointing to the release tag.
Commit and pull request titles are not release notes.

## Releasing

Run **Release** on `main` with the exact version, without `v`, such as `0.4.0`
or `0.4.0-rc.1`. Only `KewinDousse` may start or rerun this workflow. Every
publication job checks both the original actor and the actor requesting a rerun.

The action assembles the notes, version and Docker references into a local commit.
Its summary shows the exact commit, source, channel, release notes and intended
aliases. A Git bundle preserves that candidate within the run, and CI tests that
same commit, including the built image. After green checks, approve the `release`
environment in **Review deployments**. The action fast-forwards `main` to the
release commit, creates its immutable tag, publishes the tested
image and attestation, records the GitHub Release, then promotes aliases and the
stable demo with `version.json`. No release PR or second manual action is needed.

Rejecting approval leaves remote source, tags and releases untouched. If `main`
advances, publication refuses to overwrite it. Review and release
the updated source in a new run. Approval and artifact retention are separate:
complete approval within seven days or start a new run to regenerate and review
the candidate. A failed publication resumes while `main` still points to
the preparation base or the exact candidate.

Rerun a failed job or start **Release** with the same version to resume a prepared
tag. Existing tags, release notes and image versions are never overwritten;
existing images must have the approved source revision. Every attempt rechecks
promotion against current releases. Prereleases change no stable aliases or demo;
maintenance releases cannot move `latest`, their minor alias or the manifest
backwards. A historical tag without valid preparation metadata is refused.

### Release approval environment

Configure the `release` environment with `KewinDousse` as its sole required
reviewer, self-approval allowed, administrator bypass disabled, and a single branch
policy permitting `main`. Native required reviewers are available on the public
repository under the current GitHub plan. The workflow refuses to prepare or
publish when those protections are missing or broader than specified.

### Release identity

Install the dedicated release GitHub App on **only** `KewinDousse/natel`, with
repository Contents read/write. Store its Client ID as `RELEASE_APP_CLIENT_ID`
and its private key as `RELEASE_APP_PRIVATE_KEY` in the **release
environment**, so they are available only after approval. The official token
action scopes its short-lived token to this repository and revokes it
afterwards. No personal token or pull-request write permission is
needed, and Actions does not need permission to create or approve PRs.

Permit the App to fast-forward `main` to the release commit.
On `main`, separate the PR/status-check requirements, where the App needs a
bypass, from deletion and non-fast-forward protection, which must not exempt it.
The workflow checks the branch head before writing and pushes without force.
Its approved candidate has already passed the complete reusable CI workflow.

Keep tag creation separate too: an active creation-only ruleset for `refs/tags/v*`
permits administrators and this App. Update/deletion protection does not exempt the
App. Create each additional restriction before changing an existing combined
ruleset, so protection stays continuous. Repository settings are configured
separately; the release workflow does not change its own protections.

## Bugs and security

Use issues for bugs and feature requests, and
[SECURITY.md](.github/SECURITY.md) for private vulnerability reports.
