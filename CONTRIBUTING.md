# Contributing to Natel

Thanks for helping. Natel is small on purpose: read the non-goals in the
[README](README.md) before proposing a feature, and open an issue first for
anything larger than a small fix.

## Rules

[AGENTS.md](AGENTS.md) holds the invariants and conventions; they apply to
humans too. In short:

- Contacts only, no backend, no credentials at rest.
- Every vCard property the UI doesn't edit survives a save unchanged.
- Every write is conditional (`If-Match`), and a conflict reaches the user.
- The UI follows [docs/DESIGN.md](docs/DESIGN.md); strings exist in English
  and French.
- A decision between behaviours is recorded in
  [docs/DECISIONS.md](docs/DECISIONS.md).

## Setup

You need Node 24 with pnpm (`corepack enable`), and Python 3 for the
end-to-end tests.

```sh
pnpm install
VITE_DAV_URL=http://127.0.0.1:5232 pnpm dev   # against your own CardDAV server
pnpm check                                   # typecheck, lint, unit tests
```

The end-to-end tests run the production build against a throwaway CardDAV
server:

```sh
python3 -m venv ~/.cache/natel-e2e           # outside the repo
~/.cache/natel-e2e/bin/pip install -r tests/e2e/requirements.txt
export PATH="$HOME/.cache/natel-e2e/bin:$PATH"   # radicale and xandikos
pnpm exec playwright install --with-deps chromium
pnpm e2e                                     # against Radicale
E2E_SERVER=xandikos pnpm e2e
E2E_SERVER=baikal pnpm e2e                   # needs Docker
```

Never commit real contacts: `fixtures/private/` is ignored by git for yours,
and `fixtures/public/` holds only made-up ones.

## Pull requests

- One feature or fix per pull request, with its tests: new behaviour gets a
  test, a bug fix gets a regression test first.
- `pnpm check` and `pnpm e2e` pass.
- Commit messages are one imperative line in English, saying why when it
  isn't obvious.
- Changes under `src/vcard/` and `src/dav/` get a line-by-line review: that
  is where data gets lost.
