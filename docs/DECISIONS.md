# Decisions

Lightweight ADR log. Append, don't rewrite. One entry per decision, newest last.
Format: context → decision → consequences.

## 001 — Contacts only

**Context.** InfCloud bundles CalDAV and CardDAV. The author doesn't use the
calendar, and calendar UIs are an order of magnitude more work.
**Decision.** No calendar, ever. It's in the README non-goals and AGENTS.md invariants.
**Consequences.** Smaller scope, clearer positioning, a smaller audience by design.

## 002 — Static SPA + Caddy, no backend

**Context.** Goal is minimal memory footprint and trivial deployment. CardDAV
servers send no CORS headers, so a browser client needs same-origin access.
**Decision.** Vite static build served by Caddy, which also reverse-proxies
`/dav/*`. No Node runtime, no server state.
**Consequences.** ~20 MB RAM. Features requiring server state (SSO sessions,
server-side search) are excluded or must be reformulated client-side.

## 003 — Vite + React rather than Next.js

**Context.** Author's day-to-day framework is Next.js, but the code will mostly
be written by an agent under supervision. Next in `output: 'export'` is a
minority mode with dynamic-route friction and a constant pull toward server features.
**Decision.** Vite + React + TanStack Router/Query.
**Consequences.** Most conventional SPA stack; agents know it best; no export
quirks; PWA tooling is simpler. Slight learning curve on TanStack Router.

## 004 — tsdav + ical.js, no hand-written protocol code

**Context.** CardDAV discovery and vCard parsing are full of edge cases.
**Decision.** Wrap `tsdav` in `src/dav/` and `ical.js` in `src/vcard/`; nothing
else imports them.
**Consequences.** If either library proves inadequate (e.g. `PHOTO` encoding),
the swap is contained to one module. Verify in the phase-1 spike.

## 005 — Preserve unknown vCard properties, edit a subset

**Context.** CardDavMATE/InfCloud are known to corrupt photo encoding for other
clients. Data loss is the worst failure mode for a contacts editor.
**Decision.** The UI edits a fixed subset; everything else round-trips untouched.
Round-trip tests over real fixtures are a merge gate.
**Consequences.** Some properties are visible but not editable in the UI. That
is acceptable and documented.

## 006 — Conditional writes, explicit conflict UI

**Context.** Users edit the same book from their phone (DAVx⁵) and the web.
**Decision.** Every write uses `If-Match`. `412` shows a conflict view; no
automatic merge in v0.x.
**Consequences.** Slightly more UI work in the MVP; zero silent overwrites.

## 007 — Credentials in memory only

**Context.** Convenience vs. exposure of CardDAV credentials in the browser.
**Decision.** Session store in memory; reload logs out. No persistence.
**Consequences.** Mildly annoying for users; revisit only with delegated auth
(`Remote-User`) in phase 4.

## 008 — vCard 3.0 default

**Context.** Baïkal and DAVx⁵ default to 3.0; Apple clients too.
**Decision.** Never change a card's version on save. Create new cards as 3.0.
**Consequences.** Some 4.0-only properties won't be authorable from the UI. Fine.

## 009 — /dav URL contract: proxy strip prefix

**Context.** The same React app is served by Caddy in production and Vite
in development. Both need to reach the CardDAV server's paths (e.g.
`/dav.php/principals/`) without doubling the `/dav` mount prefix.

**Decision.** `BAIKAL_URL` and `VITE_DAV_URL` are origin-only
(`scheme://host[:port]`, no path) — Caddy `reverse_proxy` upstreams cannot
contain paths. The app mirrors full CardDAV server paths under `/dav`:
a request to `/dav/dav.php/…` is proxied to the origin at `/dav.php/…`.
Caddy's `handle_path /dav/*` strips the `/dav` prefix before proxying;
Vite's dev proxy has an equivalent `rewrite` that strips `/^\/dav/`.

**Consequences.** Same app URLs work in dev and prod without URL
adjustment. Must ensure any future proxy target also supports path
rewriting; Caddy and Vite proxy semantics must stay in sync.

## 010 — License and project name

**Context.** The repo was set up without a license or name committed, leaving
both as open questions through phase 0.
**Decision.** MIT license (maximum adoption, aligned with InfCloud's
predecessor licensing philosophy) and the name "Natel" (a play on
"navigateur de contacts" / "natel" as a Swiss term for mobile phone).
**Consequences.** MIT allows unrestricted use, modification, and
redistribution. The name is short and available on npm/Docker Hub.

## 011 — Phase 1 spike outcome: vCard round-trip validated

**Context.** Phase 1 exit criterion: real vCards round-trip byte-for-byte
through the parser. The spike assembled 387 real-world vCards (381 from
Baïkal/DAVx⁵, 6 synthetic) and a round-trip test suite in `tests/vcard/`.

**Decision.** The exit criterion is met for all parsing paths exercised by the
current parser (`parse` + `serialise` for the editable subset FN, N, TEL,
EMAIL, with all other properties preserved via `raw`). The tests assert both
semantic equality (same property set) and, via `normalise`, byte-for-byte
equality after folding/line-ending normalisation and known ical.js
inconsistencies (VALUE param stripping, property name case, multi-valued param
expansion).

**What was validated (green locally via `pnpm check`):**
- 387 vCards round-trip with semantic equality — all 387 pass.
- 387 vCards round-trip with normalised byte-equality — all 387 pass.
- Serialisation edge cases (create FN/N from scratch, reorder/delete TEL with
  stale params) — 3 tests pass.
- Conditional writes: `If-Match` on PUT and DELETE, `If-None-Match: *` on
  create, 412 → `DavError.CONFLICT` — mocked unit tests in `tests/dav/` pass.
- Proxy strip-prefix contract: Caddy `handle_path /dav/*` and Vite dev proxy
  `rewrite /^\/dav/` are in sync. Both require origin-only upstream URLs.

**What was validated live on 2026-09-23 (against the author's Baïkal instance, sabredav 4.7.0):**
1. "Baïkal returns 412 on stale If-Match" — full conditional-write contract
   validated on a throwaway contact (see ROADMAP.md for the sequence). The
   spike script also ran end to end: 381 real cards fetched, parse+serialise
   comparison matched the round-trip suite's normalisation results.
2. "Caddy proxy validated end to end with Basic Auth" — Docker image rebuilt
   from the current Dockerfile + Caddyfile, run locally with `BAIKAL_URL`
   pointing at the Baïkal origin. SPA served at `/`, CardDAV reachable at
   `/dav/dav.php/`, `PROPFIND` with Basic Auth returns 207 (see ROADMAP.md).

**How to re-run the live checks.**
```bash
# 1. spike: connect to CardDAV, dump all vCards, check parse→serialise
DAV_URL=https://my.carddav.server \
DAV_USERNAME=user \
DAV_PASSWORD=pass \
pnpm tsx scripts/spike.ts

# 2. Caddy + live backend
BAIKAL_URL=https://my.carddav.server \
SITE_ADDRESS=:8080 \
caddy run
# Then open http://localhost:8080/ and http://localhost:8080/dav/dav.php/
```

**Consequences.** Both manual checks validated live on 2026-09-23.
Phase 1 exit criterion is met; MVP work can start.

## 012 — ical.js BDAY normalisation on vCard 3.0

**Context.** ical.js's vCard 3.0 design gives BDAY a `detectType` that types
every value as `date` or `date-time` and drops the `VALUE` parameter. Three
consequences for real cards:
- a free-text birthday (`BDAY;VALUE=text:circa 1987`) is typed `date`;
  `getFirstValue()` then throws while hydrating it, which made `parse()` fail
  for the whole card, and `toString()` mangles it (`VALUE=DATE:circ 187`);
- a digit-only text birthday (`BDAY;VALUE=text:1950`) hydrates as a year and
  is written back as `BDAY;VALUE=DATE:1950`;
- vCard 4.0 is not affected: `VALUE=text` is kept.

**Decision.** `retypeTextBirthdays` in `src/vcard/` runs right after parsing:
any BDAY whose value cannot be hydrated is retyped `text` with its original
string, so it parses, displays as-is and serialises as `BDAY;VALUE=TEXT:…`.
`readBirthday` also reads the jCal first and falls back to
`valueType: "text"` with null parts if hydration throws. On save, a BDAY whose
year/month/day are unchanged is not touched at all. The `VALUE=TEXT → DATE`
rewrite of digit-only v3 text birthdays is accepted: it is what ical.js emits
for the untouched card, and the date value is equivalent.

**Consequences.** Free-text birthdays are visible, survive a save of any other
field, and are replaced by a date only when the user types date parts. REV
has the same `detectType` on vCard 3.0 but is not retyped: the UI never reads
it, and a malformed REV is left to ical.js's normalisation.

## 013 — "Écraser avec ma version" applies only the fields the user changed

**Context.** On a 412, the user can overwrite: the app refetches the card for
a fresh ETag, then PUTs with `If-Match`. Applying the whole draft onto the
fresh copy reverted every editable field changed elsewhere since the page
loaded, even fields the user never touched (a phone number fixed on another
device came back to its old value).

**Decision.** The overwrite applies only the fields marked dirty against the
version the user started editing (`applyDraft(fresh, draft, dirtyDiff(...))`).
Untouched fields keep the server's current values. A normal save still
applies the whole draft onto the version it was built from.

**Consequences.** "My version" means "my changes": a concurrent edit to a
field the user also changed is still overwritten, which is what the button
says. A TEL or EMAIL list the user changed is written as a whole, since rows
are matched by position.
