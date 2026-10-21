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

## Bugs and security

Use issues for bugs and feature requests, and
[SECURITY.md](.github/SECURITY.md) for private vulnerability reports.
