# Contributing to Natel

Natel is small on purpose. Read its [scope](#scope) before proposing a
feature. Small fixes can go straight to a pull request; open an issue first
for a new feature, dependency or behaviour decision.

## Scope

Natel is a contacts client and stays one: no calendars, tasks or mail, no
accounts or permissions of its own, and no contacts or credentials stored
on the server. The UI edits a subset of vCard fields and keeps the others.
Offline use, incremental sync, duplicate merging, delegated authentication
and limits on password guessing are not implemented.

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
E2E_SERVER=xandikos pnpm e2e  # also needs Docker
E2E_SERVER=baikal pnpm e2e    # also needs Docker
E2E_SERVER=baikal-digest pnpm e2e  # Baïkal as it ships, with Digest
```

Radicale is the default. The suite uses isolated test ports and fresh
storage. CI also runs against Baïkal in Basic and in Digest, Xandikos and the
built Docker image.
The Docker image is built for amd64 and arm64; its browser tests execute the
amd64 image.

Never commit real contacts. `tests/fixtures/public/` contains made-up
cards; `tests/fixtures/private/` is ignored for local checks. Never modify
an existing fixture: add a new one.

## Pull requests

Keep one feature or fix per branch and open the pull request as a **draft**.
Its title names every user-visible change; when one line can't, split the pull
request. Its description says briefly the problem and the behaviour after, with
one example, and what CI can't show, such as a check on a real device.

New behaviour needs a test; for a bug, write a regression test first. Commit
messages are one imperative line in English, saying why when it isn't obvious.

The checks above pass before you ask for a review; Baïkal, and Xandikos
without Docker, can be left to CI. A draft runs no CI: marking the pull
request ready starts it, unless it only changes Markdown or `docs/`. The
maintainer reviews the proposal before publication; changes under `src/vcard/`,
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
requires a new valid note or a justified `None` before merging. It runs once the
pull request is marked ready, even when it only changes Markdown.

Commit and pull request titles are not release notes. Publishing a release is
described in [docs/releasing.md](docs/releasing.md).

## Bugs and security

Use issues for bugs and feature requests, and
[SECURITY.md](.github/SECURITY.md) for private vulnerability reports.
