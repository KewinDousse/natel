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

- [ ] 10–20 real vCards from Baïkal/DAVx⁵ in `fixtures/private/` (gitignored)
      plus synthetic public ones in `fixtures/public/`
- [ ] `scripts/spike.ts`: discover principal → list address books → fetch all
      vCards → parse → serialise → diff
- [ ] Round-trip test suite in `tests/vcard/`
- [ ] Confirm Baïkal returns `412` on stale `If-Match`
- [ ] Caddy proxy config validated end to end with Basic Auth
- [ ] Findings recorded in `docs/DECISIONS.md`

## Phase 2 — MVP v0.1 ✅ when: the author has uninstalled InfCloud

- [ ] Login (Basic Auth, in-memory only), logout
- [ ] Address book discovery and selection
- [ ] Contact list with instant client-side search
- [ ] Contact detail view
- [ ] Edit: N/FN, NICKNAME, TEL, EMAIL, ADR, BDAY, ORG, TITLE, URL, NOTE
- [ ] Unknown properties shown read-only ("other data") and preserved on save
- [ ] Create, delete
- [ ] ETag conflict UI (show server version vs local, let user choose)
- [ ] Responsive layout, usable on a phone
- [ ] i18n en + fr
- [ ] Docker image published on tag, compose example in README
- [ ] Tag `v0.1.0`

## Phase 3 — v0.2, usable by others ✅ when: someone who isn't the author runs it daily

- [ ] Photos: upload, crop, encoding compatible with Android and Apple clients
- [ ] Multiple address books, move contact between books
- [ ] Groups: read both `CATEGORIES` and `KIND:group`; write one (decide in DECISIONS.md)
- [ ] Import / export `.vcf`
- [ ] PWA (installable, no offline yet)
- [ ] Dark mode, keyboard shortcuts
- [ ] Compatibility matrix in CI: Baïkal, Radicale, Xandikos, Nextcloud
- [ ] Playwright e2e against Radicale in Docker
- [ ] `v0.2.0`

## Phase 4 — Community (if it takes off)

- Public demo instance (read-only Radicale, reset nightly)
- CONTRIBUTING, issue templates, public roadmap
- Announce: r/selfhosted, Baïkal issue tracker, awesome-selfhosted, Show HN
- Incremental sync via `sync-token`, IndexedDB cache, offline mode
- Duplicate detection and merge
- Delegated auth (`Remote-User` header behind Authelia/Authentik)

## Explicitly never

Calendars, tasks, mail, multi-user permissions, any server-side state.
