# Contributing to Natel

Natel is small on purpose. Read the [scope](README.md#scope) before proposing
a feature. Small fixes can go straight to a pull request; open an issue
first for a new feature, dependency or behaviour decision.

## Rules

- Contacts only, static SPA, no runtime backend or credentials at rest.
- Preserve properties, parameters and groups the editor does not change.
- Writes are conditional; show a conflict rather than retrying blindly.
- Keep CardDAV I/O in `src/dav/` and parsing in `src/vcard/`.
- Follow [architecture](docs/ARCHITECTURE.md) and [design](docs/DESIGN.md).
  UI strings exist in English and French.
- Record accepted behaviour decisions in [DECISIONS.md](docs/DECISIONS.md).

[AGENTS.md](AGENTS.md) has the detailed invariants and agent workflow.

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

The main end-to-end suite starts a throwaway CardDAV server and serves the
production build. It needs Python 3 and Playwright's Chromium:

```sh
python3 -m venv ~/.cache/natel-e2e
~/.cache/natel-e2e/bin/pip install -r tests/e2e/requirements.txt
export PATH="$HOME/.cache/natel-e2e/bin:$PATH"
pnpm exec playwright install --with-deps chromium
pnpm e2e:demo
pnpm e2e
E2E_SERVER=xandikos pnpm e2e
E2E_SERVER=baikal pnpm e2e    # also needs Docker
```

Radicale is the default. The suite uses isolated test ports and fresh
storage. CI also runs against Baïkal and the built Docker image. The Docker
image is built for amd64 and arm64; its browser tests execute the amd64 image.

Never commit real contacts. `fixtures/public/` contains made-up cards;
`fixtures/private/` is ignored for local checks. Add fixtures rather than
modifying existing ones.

## Pull requests

Keep one feature or fix per branch and open the pull request as a **draft**.
Explain the problem and resulting behaviour briefly, then list the checks
run and any limits. New behaviour needs a test; for a bug, write a regression
test first. Commit messages are one imperative line in English.

Run `pnpm check` and the end-to-end suite against Radicale and Xandikos.
The maintainer reviews the proposal before publication; changes under
`src/vcard/` and `src/dav/` need particular care because they handle your data.
Do not include credentials or personal contacts in issues, logs or captures.

## Questions and security

Use [Discussions](https://github.com/KewinDousse/natel/discussions) for setup
questions. Use issues for bugs and feature requests, and
[SECURITY.md](SECURITY.md) for private vulnerability reports.
