# Architecture

How the parts fit together, and where code goes. The details live next to
what they describe: the `Caddyfile` comments each proxy rule and header,
the `Dockerfile` each build stage, `.github/workflows/ci.yml` each job,
`vite.config.ts` the demo build and the build revision. Why it is built
this way is in [DECISIONS.md](DECISIONS.md).

## Runtime

```
Browser ──HTTPS──▶ Caddy (single container)
                    ├── /            static SPA (Vite build output)
                    ├── /session     reverse_proxy natel-session (loopback)
                    ├── /updates     release check through natel-session (ADR 040)
                    └── /dav/*       forward_auth natel-session, then
                                     reverse_proxy {$CARDDAV_URL}
                                       └──▶ CardDAV server (Baïkal, Radicale, …)
```

- Two processes: `natel-session`, the container's entrypoint, holds sign-in
  sessions in memory and runs Caddy as its child (ADR 032). No Node at
  runtime.
- The `/dav` proxy makes the CardDAV server same-origin (servers send no
  CORS headers) and gives users one URL to configure (ADR 002, ADR 014).
  For each request, `natel-session` turns the session cookie into the
  request's `Authorization`.
- The proxy rewrites no bodies: `src/dav/` maps hrefs between the server's
  URL space and `/dav`, and does discovery itself (ADR 015).
- In development, and in the e2e suite outside the image, Vite stands in
  for both: `vite.config.ts` says which of the Caddyfile's proxy rules and
  headers it repeats, and `session/dev-session.ts` mirrors the session
  contract.

Configuration is environment variables only, read as they are by the
Caddyfile and `natel-session`: [deployment.md](deployment.md#configuration)
lists the image's, and [bare-metal.md](bare-metal.md#configure) those for
running without it.

## Build

The Dockerfile builds the app and `natel-session`, and copies them with the
official Caddy binary onto Alpine (ADR 033).

Measured on 2026-10-15 (linux/amd64): 26 MB compressed (gzip of `docker
save`), 70 MB unpacked, of which the app is 1 MB and `natel-session` 7 MB;
about 16 MB of RAM at rest in a fresh container.
The [natel.app](https://natel.app) home page quotes the compressed size and
the RAM at rest: update it with each new measurement.

CI runs the e2e suite against Radicale, Baïkal and Xandikos, and through
the built image (`ci.yml` says when). Release publication uses only the exact image that passed it.

The demo (ADR 025) is another build of the same app: `VITE_DEMO=1` swaps
`@/dav` for `src/dav/demo.ts`, an in-memory CardDAV stand-in seeded with
made-up contacts. The approved Release workflow publishes it at `demo.natel.app` (ADR 035, ADR 041).
The normal build, and so the image, never contains it, which CI checks.

## Release checks

`session/updates.go` is the narrowly scoped release checker in ADR 040.
Authenticated `GET /updates` returns the instance setting and any known stable
release. It creates its own request to the fixed Pages manifest, with a bounded
body and timeout, and shares an in-memory 24-hour cache of attempts. It forwards no
browser headers and stores no credentials or instance identifier for this purpose.
The dev session mirror returns checks disabled, without an outbound request.
`queries/useUpdates.ts` reads this same-origin endpoint; `components/update-notice.tsx`
puts a dot on the header's settings link and the release status in the settings.
`store/update-notice.ts` stores the ignored release and the last release the
settings showed separately from display preferences, under `natel.ignoredRelease`
and `natel.seenRelease`.

## Release publication

The public `release.yml` workflow is manually started and approved only by
`KewinDousse`, checking the original actor and rerun actor. It prepares a local
release commit and summary; a same-run Git bundle restores that exact commit for
the reusable `ci.yml` checks and image build. The protected `release` environment
blocks publication until the maintainer approves. Missing approval protection
fails closed. The App key is available only inside that environment.

After approval, the App fast-forwards both existing `main` branches to the same
metadata-only commit, then creates the immutable tag. No public maintainer branch
or PR is created. Publishing keeps package-write privileges away from repository
scripts. The tested image and attestation precede the GitHub Release, alias
promotion and stable demo/manifest. Promotions are recalculated on each attempt,
including partial reruns. Operator steps are in
[CONTRIBUTING.md](../CONTRIBUTING.md#releasing).

`scripts/changes.mjs` validates change notes and the release-only diff;
`scripts/release.mjs` handles preparation, owner/environment validation and GitHub
operations. `.github/actions/release-candidate` restores a bundle and verifies its
commit identity. The independent `changelog.yml` workflow covers every ready PR,
including documentation changes.

## Source layout

```
src/
  routes/        TanStack Router file-based routes (thin: compose components, no logic)
  components/    UI components, built by hand. The contact page is
                 contact-page.tsx (state, saves, dialogs) over contact-view.tsx
                 (reading) and contact-editor.tsx (form). contacts-screen.tsx
                 composes the directory screen
    ui/          the shared controls: button.ts, icons.tsx, dialog.tsx,
                 toast.tsx. A shadcn component, when one is needed, goes here
                 too, added with `pnpm dlx shadcn@latest add` (the CLI is not
                 a dependency)
  hooks/         UI orchestration: navigation, keyboard shortcuts, contact
                 group edits, book import/export, sign-out and photo choice
  dav/           CardDAV client: discovery, list, fetch, put, delete. Wraps tsdav.
                 The ONLY module that imports tsdav, through internal.ts;
                 errors.ts maps its errors and proxy-hrefs.ts translates hrefs
                 across the proxy. session.ts opens, reads and ends the
                 sign-in session. demo.ts and demo-seed.ts
                 stand in for it in the demo build (ADR 025).
  vcard/         Parse/serialise vCard ↔ Contact model. Wraps ical.js.
                 The ONLY module that imports ical.js. index.ts is its entry
                 point, and the only file other code imports (`@/vcard`);
                 read.ts, write.ts, photo.ts, fields.ts, apple-birthday.ts
                 and ical-workarounds.ts hold its parts.
  lib/           Pure helpers: contact-list grouping, sorting, search logic;
                 edit drafts, dirty tracking and validation; display formatting;
                 the theme, which public/theme.js applies before the first paint.
  model/         The Contact type. Plain data, no I/O.
  store/         Zustand: session (signed-in user, selected book, group filter),
                 memory only; preferences (sort, theme, map), stored like the
                 language (ADR 026, ADR 037).
  queries/       TanStack Query hooks; the bridge between dav/ and routes/.
  i18n/          en.json, fr.json, setup, stored display preferences (ADR 019)
tests/           mirrors src/ (vcard, dav, lib, queries, store, routes, components)
  vcard/         includes the round-trip tests over fixtures/
  e2e/           Playwright against the production build and a throwaway
                 CardDAV server: Radicale by default (`pnpm e2e`, ADR 017),
                 Baïkal (Docker) or Xandikos with `E2E_SERVER`
  e2e-demo/      Playwright against the demo build (`pnpm e2e:demo`)
  fixtures/
    public/      synthetic vCards, committed
    private/     real vCards, gitignored
session/         natel-session (Go, standard library only): sign-in sessions,
                 forward_auth for /dav, Caddy's supervisor (ADR 032)
  dev-session.ts the same session contract on Vite's dev and preview servers
scripts/
  brand-images.ts  renders the brand images that carry text and the README's
                 screenshots (`pnpm brand:images`)
  demo-screens.ts  screens of the demo build, signed in, without its reminders
  spike.ts       phase-1 exploration script, kept as documentation
```

Dependency direction: `routes → components → queries → dav/vcard → model`.
Nothing imports upward.

## Contact model and data preservation

`src/vcard/` parses a card into a `Contact` (`src/model/contact.ts`): its
href and ETag, the fields the UI edits, and `raw`, the whole parsed
component. On save, `serialise` applies the fields back onto `raw` and
writes it out, so properties the UI never touched are emitted as parsed
(ADR 005). Round-trip tests in `tests/vcard/` assert that
`serialise(parse(x))` is semantically equal to `x` for every fixture, and
byte-equal where the library allows it.

## Write path and conflicts

1. Read: `GET`/`REPORT` returns body + ETag; both stored on the `Contact`.
2. Write: `PUT` with `If-Match: <etag>`.
3. `2xx` → the text sent goes with the strong ETag of the `PUT` response
   (RFC 6352 §6.3.2.3). Without one, the card's text and ETag are read again
   in one multiget, and that version, which may hold another client's change
   made since, becomes the cache and the next edit's base. An ETag read on
   its own is never paired with the text sent: it may name that other
   change, and the next save would write over it.
4. `412` → read the card again, then show the conflict
   ([DESIGN.md](DESIGN.md#states)): reloading takes the server version,
   overwriting refetches for a fresh ETag and applies only the fields the
   user changed (ADR 013). Overwriting is offered only while the phone,
   e-mail and address lists the user changed are as read (ADR 038). Never
   auto-merge in v0.x.
5. Delete: `DELETE` with `If-Match`. `412` → the same conflict, with reload
   only.

## Authentication

Basic Auth, held by `natel-session` (ADR 032). The CardDAV server is
configuration, never user input (ADR 014). `POST /session` checks the
password against the server and sets an HttpOnly cookie, `GET /session` at
startup keeps a reload signed in, and `DELETE /session` signs out. The
Zustand store holds only the username.

## Search

Whole address book loaded on selection; search is client-side over the loaded
list. Personal books are hundreds of contacts, not hundreds of thousands. Revisit
with `sync-token` incremental sync if that assumption breaks.

## vCard version

A card keeps the version it came in, and new cards are 3.0, the version
Baïkal and DAVx⁵ speak (ADR 008).

## Import and export

`hooks/use-book-transfer.ts` owns import/export progress, file reading and
notifications. `queries/vcfImport.ts` and `queries/vcfExport.ts` perform the
CardDAV operations without React. The hook remembers imported cards the
list cannot parse, so repeated imports still recognise their UIDs.

## Moving contacts

`queries/useMoveContact.ts` keeps the source and target caches in step with
`moveContact.ts`'s outcome. The contact page handles the messages, selected
book and navigation.
