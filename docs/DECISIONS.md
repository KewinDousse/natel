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
