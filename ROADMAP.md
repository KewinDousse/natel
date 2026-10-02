# Roadmap

Phases are sequential. A phase is done when its exit criterion is met, not when
its checklist is ticked. Later phases are intentions, not commitments.

## Phase 0 — Framing ✅ when: repo exists with README, AGENTS.md, ARCHITECTURE.md, DECISIONS.md

- [x] Project name and license chosen
- [x] Intent files committed
- [x] Scaffold: Vite + React + TS strict, router, query, Tailwind, shadcn, Biome, Vitest
- [x] `pnpm check` green on an empty app
- [x] Multi-stage Dockerfile producing a Caddy image that serves the empty app

## Phase 1 — Spike ✅ when: real vCards round-trip byte-for-byte through the parser

- [x] 10–20 real vCards from Baïkal/DAVx⁵ in `fixtures/private/` (gitignored)
      plus synthetic public ones in `fixtures/public/`
- [x] `scripts/spike.ts`: discover principal → list address books → fetch all
      vCards → parse → serialise → diff
- [x] Round-trip test suite in `tests/vcard/`
- [x] Confirm Baïkal returns `412` on stale `If-Match`
      — Verified in mocked unit tests (DavError code CONFLICT on 412).
        Live end-to-end, validated on 2026-09-23 against the author's Baïkal
        instance (sabredav 4.7.0, address book
        `/dav.php/addressbooks/<user>/default/`): full conditional-write
        contract exercised on a throwaway contact:
        - PUT create with `If-None-Match: *` → **201**
        - PUT with stale `If-Match` → **412**
        - PUT with the correct ETag → 204
        - DELETE with stale `If-Match` → **412**
        - DELETE with the correct ETag → 204
        The spike script itself also ran end to end: 381 real cards fetched,
        parse+serialise comparison showed only the already-documented ical.js
        normalisations (line folding, `VALUE=DATE` on BDAY, `VALUE=URI`
        stripping on URL) — consistent with the round-trip suite's findings.
- [x] Caddy proxy config validated end to end with Basic Auth
      — Config structure is coherent (handle_path strips /dav, reverse_proxy
        forwards Authorization unchanged, Caddyfile matches ARCHITECTURE.md).
        Live end-to-end, validated on 2026-09-23 against the author's Baïkal
        instance: Docker image rebuilt from the current Dockerfile + Caddyfile,
        run locally with `BAIKAL_URL` pointing at the Baïkal origin:
        - `GET /` serves the SPA (200, "Natel" title)
        - `GET /dav/dav.php/` reaches Baïkal (401 without auth — request hit
          the CardDAV server, `/dav` prefix stripped)
        - `PROPFIND /dav/dav.php/addressbooks/<user>/default/` with Basic Auth
          through the proxy → 207 with the address book displayname
          (Authorization header forwarded unchanged)
- [x] Findings recorded in `docs/DECISIONS.md`

## Phase 2 — MVP v0.1 ✅ when: the author has uninstalled InfCloud

- [x] Login (Basic Auth, in-memory only), logout
- [x] Address book discovery and selection
- [x] Contact list with instant client-side search
- [x] Contact detail view
- [x] Edit: N/FN, NICKNAME, TEL, EMAIL, ADR, BDAY, ORG, TITLE, URL, NOTE
- [x] Unknown properties preserved on save and counted in edit mode (not
      displayed, see `docs/DESIGN.md`)
- [x] Create, delete
- [x] ETag conflict UI: reload the server version or overwrite with my
      changes (ADR 013)
- [x] Responsive layout, usable on a phone
      — Checked on a real phone by the maintainer.
- [x] i18n en + fr
- [x] Docker image published on tag, compose example in README
      — CI publishes the image it tested to `ghcr.io/kewindousse/natel` on
        a `vX.Y.Z` tag; `v0.1.0` is the first.
- [x] Tag `v0.1.0`

## Phase 3 — v0.2, usable by others ✅ when: someone who isn't the author runs it daily

- [x] Photos: upload, crop, encoding compatible with Android and Apple clients
      — The check on real Apple and Android devices is still to come.
- [x] Multiple address books, move contact between books
- [x] Groups: read both `CATEGORIES` and `KIND:group`; write one (decide in DECISIONS.md)
      — Written as group cards (ADR 022); the group filter in the list is to
        come.
- [x] Import / export `.vcf`
- [x] PWA (installable, no offline yet)
- [x] Dark mode, keyboard shortcuts
- [x] Compatibility matrix in CI: Baïkal, Radicale, Xandikos, Nextcloud
      — Nextcloud is left out, too slow to set up per job (ADR 018).
- [x] Playwright e2e against Radicale in Docker
      — Radicale runs from pip rather than Docker (ADR 017); Baïkal runs from
        Docker in CI (ADR 018).
- [x] `v0.2.0`

## Phase 4 — Community (if it takes off)

- Public demo instance (read-only Radicale, reset nightly)
- CONTRIBUTING, issue templates, public roadmap
- Announce: r/selfhosted, Baïkal issue tracker, awesome-selfhosted, Show HN
- Incremental sync via `sync-token`, IndexedDB cache, offline mode
- Duplicate detection and merge
- Delegated auth (`Remote-User` header behind Authelia/Authentik)
- Rate limiting of sign-in attempts on `/dav`, per client address: needs
  a Caddy module, so a custom Caddy build in the image

## Explicitly never

Calendars, tasks, mail, multi-user permissions, any server-side state.
