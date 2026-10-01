# Architecture

## Runtime

```
Browser ──HTTPS──▶ Caddy (single container)
                    ├── /            static SPA (Vite build output)
                    └── /dav/*       reverse_proxy {$BAIKAL_URL}
                                       └──▶ CardDAV server (Baïkal, Radicale, …)
```

- One process: Caddy. No Node at runtime.
- The proxy forwards the `Authorization` header untouched and keeps no state.
  It exists only to make the CardDAV server same-origin (servers send no CORS
  headers) and to give users one URL to configure.
- The proxy sends the upstream's own `Host` and maps redirect `Location`s
  under `/dav`. It rewrites no bodies: `dav/` maps hrefs between the server's
  URL space and `/dav` in both directions, and does discovery itself
  (ADR 015).
- It drops `WWW-Authenticate` from responses: that challenge makes the browser
  open its own Basic auth prompt over the app, which reports a rejected login
  itself.
- It relays only `PROPFIND`, `REPORT`, `PUT` and `DELETE`, the methods the app
  sends; anything else gets a 405, in Vite's proxy too. Every path of the
  server is reachable under `/dav`, so this keeps a `GET` or a `POST` from
  reaching whatever else runs there, such as Baïkal's admin and installer.
- `BAIKAL_URL` is the only required environment variable. The Caddyfile reads it
  directly (`{$BAIKAL_URL}`), no entrypoint templating.
- Users are expected to put this behind their own reverse proxy (SWAG, Traefik,
  Nginx Proxy Manager…). Caddy's automatic TLS is a bonus for direct exposure.

## Build

Multi-stage Dockerfile:
1. `node:alpine` — `pnpm install --frozen-lockfile && pnpm build` → `dist/`
2. `caddy:alpine` — copy `dist/` and `Caddyfile`

Measured on 2026-09-29 (linux/amd64): a 24 MB download, 66 MB unpacked, of
which the app is 1 MB; 12 MB of RAM at rest in a fresh container, about
16 MB after a few hundred requests.

Caddy sends a strict Content-Security-Policy (everything from the same
origin, photos as `data:` or `blob:` URLs), keeps `/assets/*` for a year as
immutable (a missing one is a 404, not `index.html`) and has the rest
revalidated. `/dav` responses carry a `sandbox` policy, so a page the CardDAV
server renders never runs as the app's origin. The image's `HEALTHCHECK` asks
Caddy's admin API on `127.0.0.1:2019`, which answers whatever `SITE_ADDRESS`
is.

CI runs the e2e suite against Radicale, Baïkal and Xandikos, then builds the
image for linux/amd64 and linux/arm64 and runs the suite against the amd64
one and Radicale, so the Caddyfile is tested as users run it. A `v*` tag
publishes that same build to
`ghcr.io/kewindousse/natel` (`X.Y.Z`, `X.Y`, and `latest` for releases
without a pre-release suffix).

## Source layout

```
src/
  routes/        TanStack Router file-based routes (thin: compose components, no logic)
  components/    UI components; components/ui/ is vendored shadcn
  dav/           CardDAV client: discovery, list, fetch, put, delete. Wraps tsdav.
                 The ONLY module that imports tsdav.
  vcard/         Parse/serialise vCard ↔ Contact model. Wraps ical.js.
                 The ONLY module that imports ical.js.
  lib/           Pure helpers: contact-list grouping, sorting, search logic;
                 edit drafts, dirty tracking and validation; display formatting.
  model/         Contact type, address book type. Plain data, no I/O.
  store/         Zustand: session (credentials, selected book). Memory only.
  queries/       TanStack Query hooks; the bridge between dav/ and routes/.
  i18n/          en.json, fr.json, setup, stored display preferences (ADR 019)
tests/           mirrors src/ (vcard, dav, lib, queries, store, routes, components)
  vcard/         includes the round-trip tests over fixtures/
  e2e/           Playwright against the production build and a throwaway
                 CardDAV server: Radicale by default (`pnpm e2e`, ADR 017),
                 Baïkal (Docker) or Xandikos with `E2E_SERVER`
fixtures/
  public/        synthetic vCards, committed
  private/       real vCards, gitignored
scripts/
  spike.ts       phase-1 exploration script, kept as documentation
```

Dependency direction: `routes → components → queries → dav/vcard → model`.
Nothing imports upward.

## Contact model and data preservation

`vcard/` parses a vCard into:

```ts
type Contact = {
  href: string;          // resource URL on the server
  etag: string;          // last known ETag
  uid: string;
  fields: EditableFields; // the subset the UI edits
  raw: RawComponent;      // the full parsed component, kept as-is
}
```

`RawComponent` is a structural type declaring only the ical.js members
`vcard/` uses, so `model/` never imports ical.js.

On save, `serialise(contact)` applies `fields` back onto `raw` (updating only
the properties it owns) and serialises `raw`. Properties the UI never touched
are emitted exactly as parsed. Round-trip tests assert `serialise(parse(x))`
is semantically equal to `x` for every fixture, and byte-equal where the
library allows it.

## Write path and conflicts

1. Read: `GET`/`REPORT` returns body + ETag; both stored on the `Contact`.
2. Write: `PUT` with `If-Match: <etag>`.
3. `2xx` → store new ETag from response (or re-`PROPFIND` if server omits it).
4. `412` → show a conflict banner: "reload" takes the server version,
   "overwrite with my version" refetches for a fresh ETag and applies only the
   fields the user changed (ADR 013). Never auto-merge in v0.x.
5. Delete: `DELETE` with `If-Match`. `412` → the same banner, with "reload"
   only: there is nothing of the user's to write over the server version.

## Authentication

Basic Auth. The sign-in screen asks only for username and password; the
CardDAV server is configuration (`BAIKAL_URL`), never user input (ADR 014).
Credentials are held in the Zustand session store and attached to
every request by `dav/`. Reload = logged out. This is a feature until a
security-reviewed alternative exists (see ROADMAP phase 4, delegated auth).

## Search

Whole address book loaded on selection; search is client-side over the loaded
list. Personal books are hundreds of contacts, not hundreds of thousands. Revisit
with `sync-token` incremental sync if that assumption breaks.

## vCard version policy

Baïkal and DAVx⁵ speak vCard 3.0. Default: keep whatever version the card came
in; never upgrade or downgrade a card on save. New contacts are created as 3.0
for maximum client compatibility. See `docs/DECISIONS.md`.
