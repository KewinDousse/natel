# Working rules for agents (and humans)

Read this file at the start of every session. Read `README.md` and
`docs/ARCHITECTURE.md` too. When in doubt, ask before building; do not guess scope.

## Invariants — never violate, never "temporarily" bypass

1. **Contacts only.** No calendar, task, or mail code, even as a stub.
2. **No backend.** The app is a static SPA. Never add a Node server, API route,
   serverless function, or any process other than Caddy in the runtime image.
3. **No credentials at rest.** Login credentials live in memory (Zustand store)
   for the session only. Never `localStorage`, `sessionStorage`, cookies, or
   IndexedDB for credentials.
4. **Preserve unknown vCard data.** On save, every property, parameter, and group
   the UI does not explicitly edit must be written back unchanged. Round-trip
   tests in `tests/vcard/` enforce this; never weaken or skip them.
5. **Conditional writes.** Every `PUT` carries `If-Match` with the last known
   ETag; every `DELETE` too. On `412`, surface a conflict to the user. Never
   retry a write blindly, never fall back to an unconditional `PUT`.
6. **Standards over Baïkal quirks.** Follow RFC 6352 / RFC 6350. If Baïkal needs a
   workaround, isolate it behind a clearly named function and document it in
   `docs/DECISIONS.md`.

## Stack — do not substitute

- Vite, React 19, TypeScript `strict` + `noUncheckedIndexedAccess`
- TanStack Router (file-based, `src/routes/`) and TanStack Query
- Zustand for session state
- Tailwind + shadcn/ui (components vendored in `src/components/ui/`)
- `tsdav` for CardDAV/WebDAV, `ical.js` for vCard parsing
- Vitest (unit), Playwright (e2e against Radicale in Docker)
- Biome for lint + format, pnpm

If a library outside this list seems needed, propose it with a one-line reason
instead of adding it.

## Workflow

- One feature per branch/PR. Small diffs. No drive-by refactors.
- `pnpm check` (typecheck + lint + unit tests) must pass before proposing a change.
- New behaviour gets a test. Bug fixes get a regression test first.
- Do not modify files under `fixtures/` except to add new fixtures.
- Do not edit `README.md`, `ROADMAP.md`, or this file unless the task says so.
- Commit messages: imperative, one line, explain *why* when not obvious.

## Code conventions

- Directory layout is in `docs/ARCHITECTURE.md`; put new code where it says.
- All CardDAV I/O goes through `src/dav/`. UI code never imports `tsdav` directly.
- All vCard parsing/serialising goes through `src/vcard/`. UI code never imports
  `ical.js` directly.
- Prefer plain functions and types over classes.
- No `any`. No non-null assertions (`!`) outside tests. Handle the empty case.
- UI strings go through the i18n layer from day one (en + fr), even in the MVP.

## Where to be extra careful (the reviewer will read these line by line)

- `src/vcard/` — data loss lives here.
- `src/dav/` — ETag handling, error mapping, URL/principal discovery.
- Anything touching photos (`PHOTO` encoding must stay compatible with Android
  and Apple clients).

## Out of scope until explicitly assigned

Offline mode, sync-token incremental sync, duplicate merging, SSO/`Remote-User`
auth, multiple users, plugin systems, theming beyond light/dark.
