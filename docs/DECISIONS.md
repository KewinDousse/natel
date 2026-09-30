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

## 014 — The server is set by the operator, the login asks only for credentials

**Context.** Natel exists to put a same-origin proxy in front of one CardDAV
server (002, 009). A login form that accepts any server URL would let anyone
use a public Natel instance to reach any CardDAV server, and would need CORS
on that server, which Baïkal does not send.

**Decision.** The CardDAV server is configuration: `BAIKAL_URL` in production,
`VITE_DAV_URL` in development. The sign-in screen asks only for username and
password. Every CardDAV request goes to the same-origin `/dav` prefix; the
app never talks to another origin and never stores a server URL.

**Consequences.** One Natel instance serves one CardDAV server. Connection
errors can no longer be CORS errors: they are wrong credentials or the
upstream server being unreachable through the proxy. How discovery finds the
principal behind `/dav` (well-known redirect or a known path) is settled when
the login is reworked; a Baïkal-specific answer goes behind its own function,
per invariant 6.

## 015 — Discovery and hrefs behind the /dav proxy

**Context.** With the server behind `/dav` (014), three things break. tsdav's
discovery reads `/.well-known/carddav` with `redirect: "manual"`, which a
browser turns into an opaque response, and it resolves every href against the
origin root. Servers answer with absolute paths in their own URL space
(`/dav.php/principals/alice/`): resolved against the page, they land outside
`/dav`; the proxy rewrites no bodies, so the same holds for hrefs sent in a
REPORT body. And redirects (`Location: /dav.php/`, or an absolute URL on the
server's origin) lead the browser out of `/dav` too.

**Decision.** The proxy rewrites the `Location` of upstream responses under
`/dav` (Caddy `header_down`, the same rule in Vite's dev proxy), and sends the
upstream's own `Host`. `src/dav/internal.ts` does discovery itself (RFC 6764,
RFC 6352 §7.1): PROPFIND `current-user-principal` on a context root, letting
the browser follow a redirect, then `addressbook-home-set` on the principal,
then the home's children. Every href read from a response goes through
`fromServerHref` (server path → `/dav` + path), every href written into a body
through `toServerPath` (the inverse). Context roots, in order:
`/dav/.well-known/carddav` (any server with RFC 6764 redirects: Radicale,
Nextcloud, Baïkal when its web server is set up for it), `/dav/` (a server
that answers at its root), `/dav/dav.php/` via `baikalContextRoot()` (a Baïkal
without the well-known redirect). A 401 stops the search: another root would
not fix the password.

**Consequences.** A server under any path works as long as it redirects its
well-known URL. Without that redirect, only a root or `/dav.php/` server is
found, at the cost of one or two extra PROPFINDs at sign-in. Caddy and Vite
must keep the same `Location` rule.

## 016 — New cards are named after their UID; a 412 on create is shown

**Context.** A create is a PUT with `If-None-Match: *` followed by a PROPFIND
for the ETag. If the PUT lands but the answer or the PROPFIND is lost, the
user sees an error and saves again. With a random href per attempt, the retry
made a second resource with the same UID, which servers reject with an
unclear error (RFC 6352 `no-uid-conflict`), while the contact already
existed.

**Decision.** A new card's href is `<uid>.vcf` (`cardHref`), so a retry
targets the same resource and gets a 412. That 412 is shown as is, with a
message saying the contact already exists and the list should be reloaded.
Recovering it automatically (reading the card and writing over it when it
has our UID) was considered and rejected: invariant 5 stays without
exception, every 412 reaches the user.

**Consequences.** A retry after a lost answer never duplicates a contact and
says what happened; the user reloads to see the card that was saved.

## 017 — e2e against Radicale run from pip, not Docker

**Context.** The stack plans Playwright e2e against Radicale in Docker. The
cloud sandboxes where agents work have no Docker daemon, but have Python and
a preinstalled Chromium. CI has both.

**Decision.** `pnpm e2e` starts Radicale from `pip` (`tests/e2e/radicale.sh`,
version pinned in `tests/e2e/requirements.txt`) with fresh storage on each
run, and serves the production bundle with `vite preview`, whose `/dav` proxy
is the dev one. Every test empties the address book first. CI and the
sandbox run the same commands; the sandbox points Playwright at its own
Chromium through `PLAYWRIGHT_CHROMIUM_EXECUTABLE`.

**Consequences.** Contributors need Python 3 to run e2e locally. The
Caddyfile is not exercised by e2e. Other
servers of the compatibility matrix (Baïkal, Xandikos) can reuse the suite
by starting a different server on the same port.

## 018 — Compatibility matrix: Baïkal from Docker, Xandikos without authentication

**Context.** The compatibility matrix runs the e2e suite against Radicale, Baïkal and
Xandikos, with workarounds isolated and recorded (invariant 6). ADR 017 runs
Radicale from pip; the other two servers don't fit that mould as they are.

**Decision.**
- The app needed no workaround: the suite passes unchanged on all three.
- Baïkal is a PHP application with no pip or single-binary release, so
  `tests/e2e/baikal.sh` runs a pinned community image of it,
  `ckulka/baikal:0.10.1-nginx`. Its installer is skipped by writing its
  config (with an unused admin password) and a SQLite database holding the
  test user before it starts.
- Xandikos leaves authentication to a proxy in front of it and takes any
  credentials, so the wrong-password test is skipped on it: it would test
  the server, not the app.
- Xandikos commits every change with dulwich, which reads the user's git
  config; `xandikos.sh` gives it an empty `HOME` so a signing setup there
  can't fail its writes.
- Nextcloud is left out: its image and first-run setup take minutes per job,
  and it runs the same sabre/dav as Baïkal.

**Consequences.** CI runs one e2e job per server. Running the Baïkal leg
locally needs a Docker daemon; Radicale stays the default of `pnpm e2e`.

## 019 — Display preferences: browser defaults, overrides in localStorage

**Context.** The FR/EN switch sits in the app header. More
languages are planned, and on phones the header has no room for it: the switch
truncates the address book's name in the meantime. Users will also want to
choose other display settings, such as how dates are shown. Locale state
lives in memory only today (`src/i18n/react.tsx`, DESIGN.md), so a choice is
lost on reload, which is also a logout (ADR 007).

**Decision.**
- Every display preference defaults to what the browser says. For the
  language: the first entry of `navigator.languages` (else
  `navigator.language`) whose primary subtag (`fr-CH` → `fr`) is in
  `locales`, French when none is.
- A preference the user sets explicitly is stored in `localStorage` under
  one key, `natel.preferences`, as a JSON object: `{ "locale": "en" }`. Only
  explicit choices are stored; "browser language" removes the field, and the
  key once the object is empty. Unknown fields and values are kept when
  writing; a value this version doesn't support (`"locale": "de"`) counts as
  absent when reading, so the browser default applies. Content that doesn't
  parse as a JSON object counts as `{}` and is overwritten on the next write.
- Storage is best effort: a change applies in memory first, then the write
  is attempted in a `try`/`catch`. When storage is unavailable or throws
  (private browsing, quota), at startup or later, nothing is shown and
  preferences live in memory for the tab.
- A tab reads the preferences when it loads; other open tabs apply a change
  on their next load.
- `localStorage` holds nothing sensitive, now or for any later preference:
  any script running on the origin can read it, and so can anyone with
  access to the browser profile, and it outlives the session. Only display
  choices go there; never credentials or anything derived from them, the
  server's address, a username, contact data, or search terms. Invariant 3
  is unchanged.
- The settings page is `/contacts/settings`, a child of the `/contacts`
  layout like `/contacts/new`: it has the same auth guard, and the header,
  the search and the list stay as they are.
  - Desktop: it fills the detail pane, in the detail content's `44rem`
    column. Mobile: its own screen, with the contact page's 56px top bar
    (back "Contacts" left, "Paramètres" / "Settings" right).
  - Content: a `font-display` title, then one labelled `<select>` per
    preference, in the form-field recipe. The language select lists
    `locales` by their own names ("Français", "English"), plus "Langue du
    navigateur" / "Browser language". A change applies at once; there is no
    save button.
  - Back, or `Esc` on desktop, returns to `/contacts`.
  - It opens from a ghost icon button (gear, "Paramètres" / "Settings") in
    the header, where the FR/EN switch is, on phones and on desktop. Opening
    it during an edit goes through the discard dialog, as Sign out does.
- The sign-in screen, where there is no header, keeps a compact language
  select in place of the FR/EN switch, writing the same preference. This
  changes DESIGN.md's "Sign-in screen", which merging this ADR accepts.

**Consequences.** The header gets back the room for the address book's name
on phones. Adding a language is a translation file plus its entry in
`locales`, which the selects list. When this is built, DESIGN.md gets the
settings page and the sign-in select, and its passages about the FR/EN
switch are updated: "Copy and i18n" (memory only, `navigator.language`), the
header recipes (the language switch; New contact and Sign out placed after
it), the mobile header row, and "settings" under "Still not designed". The
choice is remembered per browser, not per CardDAV account, which suits one
Natel per server (ADR 014).
