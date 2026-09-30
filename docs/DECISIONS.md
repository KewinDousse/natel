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

## 020 — Import skips a card whose UID is already in the book

**Context.** Natel exports the selected address book as one `.vcf`
file and imports one into it, each card created with `If-None-Match: *` at
`<uid>.vcf` (ADR 016). A file often holds cards the book already has: an
export imported back, or a second run after an import cut short. What
happens to such a card has to be chosen, and the menu that holds the two
actions is not drawn in DESIGN.md.

**Decision.**
- Import, card by card, into the selected book:
  - `src/vcard/` splits the file (read as UTF-8) into card texts. Each is
    parsed only to read its UID and check it can be read; the original text
    is what gets sent, never a re-serialised card. Unknown properties and
    the vCard version stay as they are (ADR 005; ADR 008 covers only the
    cards Natel creates), and a version the server refuses fails there.
  - A card without a UID gets a random one, added as one `UID:` line before
    `END:VCARD`.
  - A card whose UID a card of the book already has (as loaded, compared
    exactly) is skipped: neither written over nor copied. Each import
    updates the loaded book, so importing the same file twice changes
    nothing the second time.
  - Cards are created one after the other, and a failure doesn't stop the
    rest; nothing is undone. The import ends with three counts, imported,
    already in the book and failed, and names each failed card with its
    reason. Failed covers: a card the parser can't read, a UID repeated
    earlier in the same file, a 412 (a card already sits at `<uid>.vcf`,
    added elsewhere: this is how that 412 reaches the user, with a hint to
    reload), a server refusal (such as RFC 6352 `no-uid-conflict`) and a
    network error.
  - A file with no card is an error ("Ce fichier ne contient aucun
    contact."), not three zeros.
- Export fetches the selected book again and writes each card's text as the
  server returned it, cards the app can't parse included, one after the
  other. If a listed card can't be fetched, the export fails and says so
  rather than write an incomplete file. The file is built in the browser
  and named after the book's display name, else the last segment of its
  href, with characters not allowed in file names replaced by `_`. Export
  is disabled while the book shows no contact.
- Design, accepted by merging this ADR and then written into DESIGN.md:
  - The two actions sit at the end of the address-book menu, below a
    separator, as `menuitem`s: "Exporter « Contacts »" / "Export “Contacts”"
    and "Importer un fichier .vcf…" / "Import a .vcf file…", which opens
    the file picker (`.vcf`, `text/vcard`). « » take non-breaking spaces.
  - The import runs in a dialog built like the discard dialog, titled
    "Importer dans « Contacts »" / "Import into “Contacts”". It can't be
    dismissed while cards are being sent (stopping halfway gains nothing,
    since a rerun is safe). Progress ("12 / 40") and then the counts are
    `tabular`, in an `aria-live="polite"` region, followed by the failed
    cards and a Close button.
  - Behind the dialog, the list shows each contact as it is created. Close
    leaves the user on that list, with nothing selected: the imported
    contacts sit in their A–Z places like any other.

Rejected:
- Writing over the existing card: a write over a version the user has not
  seen, which invariant 5 exists to prevent.
- Importing it as a copy with a new UID: importing an export back doubles
  the book.
- Asking for each card: that is the duplicate detection and merge planned
  for Phase 4 (ROADMAP.md).

**Consequences.** An import can be rerun safely after a failure. Cards that
changed in the file since the book got them are not updated: the counts
show them as already in the book, and updating them is left to the Phase 4
merge. A card added elsewhere since the book was loaded shows up as failed
rather than skipped; reloading and importing again settles it.

## 021 — Moving a contact: copy, then delete; a refused delete undoes the copy

**Context.** CardDAV has no move across address books that
servers agree on, so a move is a create in the target book (`PUT` with
`If-None-Match: *` at `<uid>.vcf`, ADR 016) followed by a conditional
`DELETE` in the source. When the create lands and the delete doesn't, the
contact is in both books, and what happens then has to be chosen. The action
itself is not drawn in DESIGN.md.

**Decision.**
- What moves is the card as the server has it. The move fetches the card
  again (text and ETag). If the ETag is not the one the edit started from,
  or the card is gone (`NOT_FOUND`), it stops there with the conflict box,
  as for a 412, and writes nothing; any other failure of that fetch shows
  the error and writes nothing either. Otherwise that text is sent with
  only its line endings restored to CRLF (the multistatus XML turns them
  into LF), and the delete uses that ETag. A card without a UID gets one
  `UID:` line before `END:VCARD`, whose value is the last segment of the
  source href without `.vcf`: a retried move then targets the same href in
  the target book. Unsaved changes are never part of a move: while the draft
  differs from the version it started from, the action is disabled with a
  hint to save or cancel first.
- Each request's outcome is read from its `DavError` code. A definite answer
  (`CONFLICT`, `NOT_FOUND`, `AUTH`) means the request did not take effect;
  `NETWORK` and `UNEXPECTED` (any other status, including 5xx, or a lost
  answer to the PUT or to the PROPFIND that follows it) mean it may have.
  For a clear refusal that maps to `UNEXPECTED` (a 409, a 415), the cautious
  message is accepted.
  - The create gets a definite answer: nothing changed, the error is shown.
    A `CONFLICT` means a card already sits at that href in the target, maybe
    left by an earlier move; the message says so and the target book is
    reloaded.
  - The create may have landed: the delete is not sent. A message says the
    contact may have been copied to the target book and was not removed from
    the source, and both books are reloaded.
  - The delete succeeds: the move is done. It lands on the contact's page in
    the target book, which becomes the selected book, with a toast "Déplacé
    vers « Travail »".
  - The delete gets a definite answer: the source card changed, was deleted
    elsewhere, or may not be deleted. The copy is deleted with the ETag its
    create returned, then the delete's error is shown as it would be for a
    plain delete: the conflict box with "Recharger" for `CONFLICT` and
    `NOT_FOUND` (a delete made elsewhere wins, whatever code the server
    uses), the usual handling for `AUTH`. The move didn't happen.
  - The delete may have landed: nothing is undone, since undoing would lose
    the contact if the delete did happen. A message says the contact was
    copied to the target book and may still be in the source one, and both
    books are reloaded.
  - Undoing the copy succeeds or gets `NOT_FOUND`: undone. Anything else: a
    message says the contact may be in both books, and both are reloaded.
- After a failure the user stays on the source contact's page, in edit mode,
  as after a failed delete: messages appear in the bottom bar like a save
  error, and "Recharger" reloads the books and leaves edit mode as the
  delete conflict does.
- A 403 on either request goes through the app's handling of `AUTH`, as for
  a save. A read-only book or a server that refuses a UID already present
  under another href (RFC 6352 `no-uid-conflict`) is left to the
  compatibility matrix (ADR 018).
- Design, accepted by merging this ADR and then written into DESIGN.md:
  - In edit mode, an outline button "Déplacer vers un autre carnet" sits
    right above "Supprimer le contact", absent on a new contact and when the
    account has a single book.
  - It opens a dialog built like the delete dialog: title "Déplacer ce
    contact ?", the other books as native radio buttons in a `fieldset`
    (none selected at first), actions "Annuler" / "Déplacer" (primary,
    disabled until a book is chosen).
  - While the move runs, "Déplacer" shows a spinner and "Déplacement…", and
    nothing in the dialog responds, so a second click can't start another
    create.

**Consequences.** A move never writes over a change made elsewhere and
never loses a contact. When an answer is lost, the contact may end up in
both books, and the user is told. For a moment the same UID exists in two
books; RFC 6352 only requires a UID to be unique within one address book.

## 022 — Groups: read CATEGORIES and group cards, write group cards

**Context.** vCard has two ways to put a contact in a group,
and clients split between them.
- `CATEGORIES` on the contact's own card: Nextcloud's Contacts app,
  Thunderbird add-ons, and DAVx⁵ when set to "groups are per-contact
  categories".
- A separate group card, `KIND:group` with `MEMBER` lines in vCard 4.0,
  `X-ADDRESSBOOKSERVER-KIND:group` with `X-ADDRESSBOOKSERVER-MEMBER` in
  vCard 3.0, members given as `urn:uuid:<UID>`: Apple Contacts and iCloud,
  and DAVx⁵ by default, which reads both forms whatever the version. For
  Baïkal, DAVx⁵ recommends "groups are separate VCards (or the method used
  by your other clients)" (davx5.com/tested-with/baikal). sabre/dav (Baïkal,
  Nextcloud) serves 4.0 cards as 3.0 by default, turning `KIND`/`MEMBER`
  into their `X-ADDRESSBOOKSERVER-` forms.
Natel shows `CATEGORIES` read-only today (DESIGN.md), and the ROADMAP asks to
read both and write one.

**Decision.**
- Natel writes group cards. The people who run Baïkal sync it with DAVx⁵ on
  Android, where group cards are the default, and with Apple devices, which
  only understand group cards. `CATEGORIES` stays readable for cards written
  by other clients.
- Reading, within one address book (groups belong to a book):
  - A card with `KIND:group` or `X-ADDRESSBOOKSERVER-KIND:group` (any case)
    is a group, not a contact, and is left out of the contact list. Its name
    is its `FN`, else its `N`, else its UID.
  - Its members are its `MEMBER` and `X-ADDRESSBOOKSERVER-MEMBER` values,
    matched to the book's contacts by UID with or without `urn:uuid:`.
    Members that match no contact are kept and ignored.
  - Names are compared trimmed and case-sensitive, between group cards and
    against `CATEGORIES` values. A contact's groups are the group cards
    listing it plus its `CATEGORIES` values, each name once.
  - Every group name of the book, empty group cards included, is offered as
    a suggestion in "Ajouter un groupe".
- What a save writes is a delta: the group names added and removed between
  the version the edit started from and the draft.
  - An added name gets a member line in one group card with that name, the
    first by href, or a new group card if none has it: vCard 3.0 (ADR 008)
    with `UID`, `FN`, `N:<name>;;;;`, `X-ADDRESSBOOKSERVER-KIND:group` and
    one `X-ADDRESSBOOKSERVER-MEMBER`, at `<uid>.vcf` with
    `If-None-Match: *` (ADR 016). An existing card gets the member property
    it already uses, else the one of its version. The value is
    `urn:uuid:<UID>`, without doubling a prefix the UID already has.
  - A removed name takes the contact out wherever it is recorded, so the
    chip doesn't come back: from every group card with that name listing
    it, and from its own `CATEGORIES`. There, only that value goes; the
    property is dropped once empty, and its other values, parameters and
    group prefix stay. Nothing is ever added to `CATEGORIES`.
  - A group card left with no member is kept: other clients show empty
    groups, and deleting one is a separate action. Group cards are written
    through `src/vcard/` like any card, so their unknown properties are kept
    (invariant 4).
- Order and failures:
  - The contact's card is written first, and only when something on it
    changed (a `CATEGORIES` removal counts). If it fails, no group card is
    written, and the save fails as it does today.
  - Once it is saved, the edit continues from the saved version and its new
    ETag, so only the group changes still pending stay in the draft.
  - Each group card is then written with `If-Match` on the ETag it was
    loaded with, and the cached group card is updated with its new ETag and
    members, as contacts are.
  - A group card that fails leaves the contact's save in place. The bottom
    bar names the groups not updated and why, and the user stays in edit
    mode with those changes pending. For a 412 it offers, as for a contact
    (ADR 013): "Recharger", which reloads the book, leaves edit mode and
    drops the pending group changes; and "Écraser avec ma version", which
    fetches that group card again, applies only this contact's delta to it
    and writes it with its new ETag.
  - "Écraser avec ma version" on the contact's own card applies the same
    delta: `CATEGORIES` removals go onto the fresh card, and its other
    `CATEGORIES` values stay as the server has them.
- A contact without a UID gets one on the save that adds it to a group,
  since a member line needs one; the save lands on the contact's new route.
- Deleting a contact leaves its member lines in group cards: RFC 6350
  doesn't require members to resolve, and a delete stays one conditional
  `DELETE`, with no partial failure. Moving a contact (ADR 021) leaves its
  memberships in the source book the same way.
- The group filter in the list is not decided here: its design is drawn in
  DESIGN.md before it is built.

**Consequences.** Groups made in Natel show on iPhones, Macs and DAVx⁵
phones in their default setup. Nextcloud's web app and DAVx⁵ in categories
mode don't show them, though groups those clients made still show in Natel
and can be left from it. That can decide whether Natel suits someone, so the
README says it where people choose, in a "Compatibility" section next to the
quick start, when groups ship. Saving a contact can write several cards, so a
save can partly fail; the bottom bar then says what was not saved and how
to finish it. Loading a book now sorts group cards from contacts.

## 023 — Photos: the chosen image is kept as it is, without the metadata that doesn't show

**Context.** The contact page draws a photo and "Changer la
photo" / "Retirer la photo" (DESIGN.md), but `PHOTO` is neither shown nor
edited today; it is only preserved. The photo has to show on Android
(DAVx⁵, ez-vcard) and Apple clients in vCard 3.0 and 4.0, and the crop
needs either a library or a canvas. The maintainer's rule: Natel doesn't
lose what the user sees of their photo and doesn't choose a compression
level for them, so a large file makes a large card; metadata that doesn't
change how the image shows, such as a GPS location, can go. ical.js 2.2.1
reads a 3.0 `PHOTO` with an `ENCODING` as binary and round-trips it byte
for byte. It types the 4.0
data URI as `uri` but escapes it like text, so the comma comes out as
`data:image/jpeg;base64\,…`, on untouched cards and new properties alike;
ez-vcard and sabre/vobject unescape it, and RFC 6350's own examples
(§6.2.4) leave the comma unescaped. Radicale keeps the escaped form (adding
`\;`), but cuts the unescaped one at the comma: it stores
`data:image/jpeg\;base64` and the image is lost.

**Decision.**
- Reading, by the value's shape whatever the card's version: an `ENCODING`
  of `b` or `base64` (any case) is base64, its type taken from `TYPE` when it
  names an image type, else sniffed from the magic bytes; a value starting
  with `data:image/` is a data URI, including a 3.0 `PHOTO:data:…` with no
  `VALUE`, which ical.js hands over as a binary whose value is the data URI.
  The first `PHOTO` whose value yields base64 bytes with an image type,
  declared or sniffed, is shown, with `object-cover` in the page's
  `rounded-xl` square and the list's `rounded-lg` one (DESIGN.md rule 7),
  whatever its format; if none does, or the `<img>` fails to load, the
  initials show. List avatars take `loading="lazy"` and `decoding="async"`,
  since a photo can weigh several MB. A `PHOTO` pointing at a URL is not
  fetched, since the app loads no remote image. Apple's `X-ABCROP-RECTANGLE` is kept but not
  applied.
- The file's format comes from its magic bytes, never from `File.type` or
  the extension; the 3.0 `TYPE` and the 4.0 data URI's media type are
  written from it.
- Writing, when the frame ends as it opened (1×, centred: the centred
  square every client shows of a non-square photo; the final crop rectangle
  is compared by value, so a frame moved and brought back counts as
  unchanged), the image is kept whole:
  - A JPEG, PNG, GIF or WebP file keeps its image data byte for byte, at
    its size and resolution, with no re-encoding. Only its metadata is
    filtered, by copying the file's segments or chunks verbatim, in their
    order, which is lossless. Each format has an allowlist of what changes
    how the image shows; anything not on it is dropped, GPS location,
    camera, dates, thumbnails, comments and XMP included:
    - JPEG: SOI and every marker that isn't an `APPn` or `COM` (DQT, DHT,
      SOFn, DRI, SOS and its data, RSTn, EOI); `APP0` `JFIF`, rewritten
      with a 0 × 0 thumbnail (`JFXX` is dropped); every `APP2`
      `ICC_PROFILE` chunk, in order; `APP14` `Adobe`. For an HDR photo
      (Ultra HDR, or Apple's adaptive HDR: a JPEG with the `hdrgm` XMP
      packet or the ISO 21496-1 segment), the gain map also changes how it
      shows on an HDR screen, so `APP2` `MPF`, the `APP1` XMP packet that
      declares the `hdrgm` namespace, the `APP2` ISO 21496-1 gain map
      metadata (`urn:iso:std:iso:ts:21496:-1`, as Apple's adaptive HDR writes
      it), and the images the MPF index points to after EOI are kept, with
      the MPF offsets recomputed. Any other bytes after EOI (a Motion
      Photo's video, for one) are dropped.
    - PNG: `IHDR`, `PLTE`, `tRNS`, `IDAT`, `IEND`, `acTL`, `fcTL`, `fdAT`
      (APNG frames), `iCCP`, `sRGB`, `gAMA`, `cHRM`, `cICP`, `mDCv`, `cLLi`,
      `sBIT`.
    - WebP: `VP8X`, `VP8 `, `VP8L`, `ALPH`, `ANIM`, `ANMF`, `ICCP`. In
      `VP8X`, the I, E and X flags match the chunks kept, A and L stay as
      they are; the RIFF size is recomputed and odd-sized chunks keep their
      padding byte. A simple WebP (no `VP8X`) is copied unchanged.
    - GIF: header, logical screen descriptor, colour tables, Graphic
      Control Extensions (frame delay, disposal, transparency), image
      descriptors and data, the loop block (`NETSCAPE2.0` or
      `ANIMEXTS1.0`), trailer.
    - The EXIF orientation, in all three formats that carry it, is written
      back as a minimal EXIF block when it isn't 1: `Exif\0\0` (JPEG only),
      a TIFF header in the source's byte order, then IFD0 with one entry
      (0x0112, SHORT, count 1) and a next-IFD offset of 0. In a JPEG it
      takes the original `APP1`'s place, after `APP0` `JFIF`; in a PNG it is
      an `eXIf` chunk before the first `IDAT`; in a WebP an `EXIF` chunk,
      with the E flag set. With orientation 1 or none, there is no block.
    The filter is `src/lib/photo-metadata.ts`, with no dependency, tested in
    `tests/lib/`: the image data comes out unchanged; the orientation still
    applies, for a JPEG, a PNG `eXIf` and a WebP; a PNG with `tRNS` keeps
    its transparency; an APNG and an animated GIF and WebP keep every
    frame; an Ultra HDR JPEG and an ISO 21496-1 one keep their gain map;
    and fixtures with GPS, XMP, `COM` and `tEXt` come out without them.
    Apple, Android through
    DAVx⁵, Thunderbird and Nextcloud are expected to show all four (WebP
    since iOS 14 and macOS 11); the maintainer's device check confirms
    WebP on Apple and GIF and WebP through DAVx⁵. An animated GIF or WebP
    stays animated where the client supports it; Android re-encodes what it
    stores, so it doesn't.
  - A rotated phone photo keeps its orientation tag rather than having the
    rotation baked in, so it isn't re-encoded. Android's decoder may ignore
    EXIF and show it sideways: the maintainer's device check settles it,
    and if it does, rotated photos go through the canvas as below.
  - Any other format the browser decodes (AVIF, BMP, TIFF…), which not
    every client reads, goes through the canvas, as for a crop below.
- Writing, when the frame is moved or zoomed, or for an uncommon format:
  the square (or, uncropped, the whole image) is drawn on a canvas at the
  source's resolution, never scaled, and encoded in the source's family: a
  JPEG as JPEG at the highest quality the browser offers (1.0), anything
  else as PNG, lossless. This is the closest to the source a browser can
  write without a library, and it costs something: the result loses its
  colour profile and all metadata, the rotation is baked in, an HDR photo
  loses its gain map, a JPEG is often larger than its source,
  a 16-bit or HDR source drops to 8 bits, a HEIC or AVIF becomes a much
  larger PNG, and an animated GIF or WebP keeps only its first frame. The
  canvas is `display-p3` where the browser supports it
  (`getContext("2d", { colorSpace: "display-p3" })`), sRGB elsewhere, where
  a Display-P3 photo loses the colours outside sRGB.
- Considered: a lossless JPEG crop and rotation (jpegtran compiled to
  WebAssembly), which keeps the colour profile and adds no JPEG loss, but crops only on
  the 8 or 16 px block grid and adds a dependency of a few hundred KB, which
  needs the maintainer's approval. Encoding a cropped JPEG as PNG instead:
  lossless from there, but several times larger. Merging this ADR as
  written picks the canvas path; either option is asked for in review
  instead.
- A canvas past what the browser can hold shows an error in the dialog, in
  the `role="alert"` message, saying the image is too large to crop in this
  browser, and to zoom in or choose a smaller image; the image is never
  scaled down to fit. Browsers can fail silently there (iOS Safari caps a
  canvas at 16,777,216 px, less than a 24 MP photo, and may hand back a
  blank one), so every check runs: the area against that cap before
  drawing, in every browser so the behaviour is the same and testable, at
  the cost of refusing on desktop a crop it could handle; a `getContext` or
  `toBlob` that returns `null`; and the encoded blob decoded back to the
  expected size, with a few sampled pixels compared, within a JPEG
  tolerance, to the same area drawn small from the source. A blank image
  never replaces the user's photo, and the new photo shows on the contact
  page in edit mode before it is saved. An uncropped JPEG, PNG, GIF or WebP never goes through the
  canvas, so it is unaffected.
- No size limit of Natel's own. A server that refuses the card for its size
  (413, a new `DavError` code `TOO_LARGE` in `src/dav/`) shows an error
  saying the server refused a card this large and
  that its request size limit can be raised (a stock nginx in front of
  Baïkal stops at 1 MB); the edit stays open. A proxy often closes the
  connection on a large body instead, so a network failure on a card
  larger than 1 MB shows the same hint.
- Encoding in the card:
  - On a 3.0 card: `PHOTO;ENCODING=b;TYPE=JPEG:<base64>` (or `TYPE=PNG`,
    `GIF`, `WEBP`; RFC 2426, what Apple and ez-vcard write, and what ical.js
    writes for a binary value).
  - On a 4.0 card: `PHOTO:data:image/jpeg;base64\,<base64>` (or `image/png`,
    `image/gif`, `image/webp`), the data URI of RFC 6350 with the comma
    escaped as ical.js writes it. That form survives every server tested,
    Radicale included, and ez-vcard (DAVx⁵) and sabre/vobject read it; the
    unescaped one loses the photo on Radicale. A data URI read from the
    card, its comma escaped or not, is written back as ical.js writes it.
    ical.js decodes `\,` but leaves `\;` as is, and would write the
    semicolon Radicale escapes as `\\;`, a media type ez-vcard no longer
    reads: `unescapeDataUriSemicolons` in `src/vcard/`, a named workaround in
    the manner of ADR 012, decodes `\;` in the `PHOTO` and `LOGO` data URIs
    of a 4.0 card right after parsing (RFC 6350 §3.4 allows escaping it),
    whatever the number of backslashes before it, which also repairs a card
    an earlier save made grow to `\\\;`. A
    3.0 `uri` value, which ical.js neither decodes nor escapes, is copied as
    written.
  - The card's version never changes for a photo.
- Editing: the draft holds the photo as unchanged, replaced (a new image) or
  removed, and `serialise` touches `PHOTO` only for the last two, so a save
  that doesn't change the photo leaves every `PHOTO` as it was. "Changer la
  photo" replaces every `PHOTO` with one new property that carries only
  `ENCODING` and `TYPE` (3.0) or no parameter (4.0): none of the old
  parameters, such as Apple's `X-ABCROP-RECTANGLE`, is carried over to the
  new image. "Retirer la photo", shown only when a photo is displayed,
  removes them all. `LOGO` is left alone. It is one field for ADR 013's
  overwrite. A new contact can get a photo too.
- Input: any image the browser decodes (`accept="image/*"`, which also makes
  iOS hand over HEIC as JPEG). The EXIF orientation is applied for display
  and for the canvas: `createImageBitmap(file, { imageOrientation:
  "from-image" })`, retried without options where the engine rejects that
  value, and a test checks the baked dimensions of an orientation-6 JPEG. An image that
  doesn't decode shows an error in the dialog, in the `role="alert"`
  message.
- Crop on a canvas, with no library, in a dialog built like the discard
  dialog. Merging this ADR accepts that design, which then goes into
  DESIGN.md:
  - Title "Recadrer la photo" / "Crop photo"; actions "Annuler" (outline)
    and "Utiliser la photo" / "Use photo" (primary).
  - A square frame, `rounded-xl` like the result, up to 20rem wide (the
    dialog's width on phones), the image dimmed outside it. The image
    fills the frame at first, centred.
  - The frame is focusable and has the initial focus, a translated
    `aria-label`, its instructions linked with `aria-describedby`, and the
    focus ring. It takes the drag (`touch-action: none`), pinch and wheel
    (a non-passive listener), and, while focused, the arrow keys to move and
    `+` / `-` to zoom. A labelled range input "Zoom" goes from 1× (fills the
    frame) to 4×.
  - `Esc` closes the dialog only, never the edit mode behind it.
- Fixtures: the implementation ships synthetic fixtures in the shapes real
  clients write (Apple 3.0 with `X-ABCROP-RECTANGLE`, a DAVx⁵ 4.0 data URI,
  a JPEG with EXIF orientation 6, a WebP). Photos made by Apple Contacts and
  DAVx⁵ on test devices (no real person) are maintainer work, and join
  `fixtures/public/` when provided. Round-trip tests check that a card keeps
  its photo byte for byte when another field is edited, except that a 4.0
  data URI in `PHOTO` or `LOGO` read with `,` or `\;` is written with `\,`
  and `;`; and that an uncropped JPEG, PNG, GIF or WebP lands in the card
  with its image data byte for byte and only the kept metadata.

**Consequences.** Photos set in Natel show on Android and Apple devices, as
the user chose them: a large file makes a large card, which every client
downloads on each sync and Natel loads with the book at sign-in, and which
a server with a small request limit refuses. DAVx⁵ keeps only a scaled-down
copy on the phone, and writes that copy back if the contact is later edited
there. Only a crop or an uncommon format re-encodes the image (and a
rotated photo, if the device check requires it). A photo
set in Natel carries no GPS location, camera or date: nothing that doesn't
show leaves the device. Apple photos show uncropped, filling their square,
until `X-ABCROP-RECTANGLE` is applied. The maintainer checks on real devices that
a 3 to 5 MB photo, a rotated phone photo (a 24 MP iPhone one included), a
WebP and a GIF set in Natel show right through DAVx⁵ and on iOS.
