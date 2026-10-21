# Decisions

One entry per decision, newest last. Each entry stays under about 350
words, and most need less than 150: the context in a sentence or two, the
decision, and the consequences. A rejected alternative is named only when
it was a real candidate, in one line with its reason. An entry records what
was decided and why; how it is built belongs in the code, its tests,
ARCHITECTURE.md or DESIGN.md. A decision that changes gets a new entry, and
the old one says which entry amends or replaces it. Each part opens its own
paragraph with its name in bold. The order is **Context.**, **Decision.**,
then **Rejected.** when an alternative is named, and **Consequences.**

## 001 — Contacts only

**Context.** InfCloud bundles CalDAV and CardDAV. The author doesn't use the
calendar, and calendar UIs are an order of magnitude more work.

**Decision.** No calendar, ever. It's in the README scope and AGENTS.md invariants.

**Consequences.** Smaller scope, clearer positioning, a smaller audience by design.

## 002 — Static SPA + Caddy, no backend

**Context.** Goal is minimal memory footprint and trivial deployment. CardDAV
servers send no CORS headers, so a browser client needs same-origin access.

**Decision.** Vite static build served by Caddy, which also reverse-proxies
`/dav/*`. No Node runtime, no database.

**Consequences.** A small image and little RAM. Features that need server
state are excluded or done client-side. Amended by ADR 032, which adds a
session process.

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

**Consequences.** If either library proves inadequate, the swap is contained
to one module.

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

Replaced by ADR 032: the browser still never stores credentials, and a
reload no longer signs out.

## 008 — vCard 3.0 default

**Context.** Baïkal and DAVx⁵ default to 3.0; Apple clients too.

**Decision.** Never change a card's version on save. Create new cards as 3.0.

**Consequences.** Some 4.0-only properties won't be authorable from the UI. Fine.

## 009 — /dav URL contract: proxy strip prefix

**Context.** Caddy in production and Vite in development both have to reach
the CardDAV server's own paths (`/dav.php/principals/`…) under one `/dav`
prefix.

**Decision.** `CARDDAV_URL` and `VITE_DAV_URL` are origins only
(`scheme://host[:port]`), since a Caddy upstream can't carry a path. A
request to `/dav/<path>` reaches the server's `/<path>`: both proxies strip
`/dav` and nothing else.

**Consequences.** The app uses the same URLs in development and production.
Caddy's and Vite's proxies must keep the same rules.

## 010 — License and project name

**Context.** The repo was set up without a license or name committed, leaving
both as open questions through phase 0.

**Decision.** MIT license (maximum adoption, aligned with InfCloud's
predecessor licensing philosophy) and the name "Natel".

**Consequences.** MIT allows unrestricted use, modification, and
redistribution. The name is short and available on npm/Docker Hub.

## 011 — Phase 1 spike outcome: vCard round-trip validated

**Context.** Phase 1's exit criterion: real vCards round-trip through the
parser.

**Decision.** Met. 387 vCards (381 from Baïkal and DAVx⁵, 6 synthetic)
round-trip in `tests/vcard/` with the same properties and, once folding and
known ical.js differences are normalised, the same bytes. On 2026-09-23, a
live Baïkal (sabre/dav 4.7.0) answered 412 to a stale `If-Match`, and the
Caddy image proxied CardDAV with Basic Auth. `scripts/spike.ts` reruns the
live check.

**Consequences.** MVP work started on this parser.

## 012 — ical.js BDAY normalisation on vCard 3.0

**Context.** On vCard 3.0, ical.js types every `BDAY` as a date and drops
`VALUE`, so a free-text birthday (`circa 1987`) made the whole card fail to
parse, or came out mangled.

**Decision.** `retypeTextBirthdays` in `src/vcard/` retypes, right after
parsing, a `BDAY` that isn't a date as text, kept as written. A birthday
whose parts don't change is not touched on save. A digit-only text birthday
written back as a date (`VALUE=DATE:1950`) is accepted: it means the same.

**Consequences.** Free-text birthdays show and survive a save of any other
field; only typing date parts replaces them. vCard 4.0 is not affected.

## 013 — "Écraser avec ma version" applies only the fields the user changed

**Context.** On a 412, the overwrite refetches the card and writes it again.
Applying the whole draft reverted fields changed elsewhere that the user
never touched.

**Decision.** The overwrite applies only the fields the user changed
(`dirtyDiff`); the others keep the server's values.

**Consequences.** "My version" means "my changes": a field changed on both
sides is still overwritten, as the button says. A phone or e-mail list the
user changed is written whole, since rows match by position.

## 014 — The server is set by the operator, the login asks only for credentials

**Context.** A sign-in form taking any server URL would let anyone use a
public Natel to reach any CardDAV server, and would need CORS, which Baïkal
doesn't send.

**Decision.** The server is configuration: `CARDDAV_URL`, or `VITE_DAV_URL` in
development. Sign-in asks only for a username and password, and the app
talks only to its own `/dav`.

**Consequences.** One Natel serves one CardDAV server. A connection error is
wrong credentials or a server the proxy can't reach, never CORS.

## 015 — Discovery and hrefs behind the /dav proxy

**Context.** Behind `/dav`, servers answer with hrefs and redirects in their
own URL space (`/dav.php/principals/alice/`), which lead the browser out of
`/dav`, and tsdav's discovery can't follow a redirect in a browser.

**Decision.**
- Natel discovers books itself (`src/dav/internal.ts`, RFC 6764 and
  RFC 6352): `current-user-principal`, `addressbook-home-set`, then the
  home's books, trying `/dav/.well-known/carddav`, `/dav/`, then Baïkal's
  `/dav/dav.php/`. A 401 stops the search.
- Every href read is mapped into `/dav` (`fromServerHref`), every href
  written mapped back out (`toServerPath`).
- Both proxies send the server's own `Host` and keep redirects under
  `/dav`: they take only the path and query of an absolute URL, keep escaped paths as they are, and strip
  cookies and authentication challenges. Browser tests check that every
  followed request stays under `/dav/`.

**Consequences.** A server under any path works if it redirects its
well-known URL; otherwise only one at its root or at `/dav.php/`, for one or
two extra PROPFINDs at sign-in. Caddy and Vite must keep the same rules.

## 016 — New cards are named after their UID; a 412 on create is shown

**Context.** When a create's PUT lands but its answer is lost, the user saves
again. With a random href, the retry made a second card with the same UID,
which servers refuse with an unclear error.

**Decision.** A new card's href is `<uid>.vcf`, so a retry hits the same
resource and gets a 412, shown with a message saying the contact already
exists.

**Rejected.** Recovering that 412 automatically: invariant 5 holds without
exception, and every 412 reaches the user.

**Consequences.** A lost answer never duplicates a contact; the user reloads
to see it.

## 017 — e2e against Radicale run from pip, not Docker

**Context.** The cloud sandboxes where agents work have no Docker, but have
Python and a Chromium.

**Decision.** `pnpm e2e` runs Radicale from pip (`tests/e2e/radicale.sh`,
pinned), on fresh storage, against the production bundle served by
`vite preview`. Every test empties the book first. A sandbox points
Playwright at its own Chromium (`PLAYWRIGHT_CHROMIUM_EXECUTABLE`).

**Consequences.** Running e2e locally needs Python 3. Other servers reuse the
suite on the same port.

## 018 — Compatibility matrix: Baïkal from Docker, Xandikos without authentication

**Context.** The e2e suite runs against Radicale, Baïkal and Xandikos; the
last two don't install from pip.

**Decision.**
- Baïkal runs from a pinned community image, `ckulka/baikal:0.10.1-nginx`,
  its installer skipped by writing its config and a SQLite database holding
  the test user.
- Xandikos takes any credentials and leaves authentication to a proxy, so the
  wrong-password test is skipped on it. It gets an empty `HOME`, so a git
  signing setup can't fail its writes.
- The app needed no workaround for either.

**Rejected.** Nextcloud: minutes of setup per job, for the same sabre/dav as
Baïkal.

**Consequences.** CI runs one e2e job per server. The Baïkal leg needs Docker
locally; Radicale stays the default.

## 019 — Display preferences: browser defaults, overrides in localStorage

**Context.** The language switch had no room in the phone header, more
languages and display settings were coming, and a choice held in memory was
lost on reload.

**Decision.**
- Each display preference defaults to the browser's: for the language, the
  first of `navigator.languages` Natel supports, else French.
- An explicit choice is stored in `localStorage` under `natel.preferences`,
  as JSON. Unknown fields are kept, an unsupported value reads as absent,
  and storage is best effort: without it, choices last for the tab.
- `localStorage` holds display choices only, never credentials, a server
  address, a username, contacts or searches: any script on the origin can
  read it.
- The choices are made on a settings page; the language can also be chosen
  on the sign-in screen (DESIGN.md "Settings", "Sign-in screen").

**Consequences.** Choices are per browser, not per account, which suits one
Natel per server (ADR 014). A new language is a translation file and an
entry in `locales`.

## 020 — Import skips a card whose UID is already in the book

**Context.** An imported file often holds cards the book already has: an
export imported back, or a rerun after an import cut short.

**Decision.**
- Import sends each card's original text, never a re-serialised one, to
  `<uid>.vcf` with `If-None-Match: *`. A card without a UID gets one.
- A card whose UID is already in the book is skipped. A failure doesn't stop
  the rest, and nothing is undone. The import ends with three counts
  (imported, already in the book, failed) and the reason for each failure.
- Export fetches the book again and writes each card as the server returned
  it, or fails rather than write an incomplete file.
- Both actions end the address-book menu; the import runs in a dialog
  (DESIGN.md).

**Rejected.** Writing over the existing card: a write over a version the user
hasn't seen (invariant 5). Importing a copy with a new UID: an export
imported back would double the book. Asking for each card: that is duplicate
merging, planned later.

**Consequences.** An import can be rerun safely. A card that changed in the
file isn't updated. A card added elsewhere since the book loaded shows as
failed (a 412), and a reload settles it.

## 021 — Moving a contact: copy, then delete; a refused delete undoes the copy

**Context.** CardDAV has no move between books that servers agree on, so a
move is a create in the target, then a conditional delete in the source, and
either step can fail or lose its answer.

**Decision.**
- The move fetches the card again and stops with the conflict box, writing
  nothing, if its ETag changed since the edit started. The card's text goes
  over unchanged, to `<uid>.vcf`; a card without a UID gets one from its
  href, so a retried move targets the same card. Unsaved changes never
  move: the action waits for a save or a cancel.
- A create refused outright changes nothing. A create that may have landed
  is not followed by the delete.
- A delete refused outright undoes the copy and shows the delete's error. A
  delete that may have landed undoes nothing, since that could lose the
  contact.
- Whenever the contact may be in both books, the message says so and both
  books reload.
- A button in edit mode opens a dialog listing the other books (DESIGN.md).

**Consequences.** A move never writes over a change made elsewhere and never
loses a contact; at worst it leaves it in both books, and says so. For a
moment the same UID exists in two books, which RFC 6352 allows.

## 022 — Groups: read CATEGORIES and group cards, write group cards

**Context.** Clients split between two ways to group contacts: `CATEGORIES`
on the contact's card (Nextcloud, Thunderbird add-ons, DAVx⁵ in categories
mode), and separate group cards listing members by UID (Apple, iCloud, DAVx⁵
by default).

**Decision.**
- A group card is a group, not a contact, and stays out of the list. Groups
  match by name, trimmed and case-sensitive, across both forms.
- Natel reads both and writes group cards, which DAVx⁵ and Apple devices,
  the clients Baïkal users sync with, understand. A new group card is vCard
  3.0 with `X-ADDRESSBOOKSERVER-KIND:group`; an existing one keeps its own
  member property.
- A save writes only the groups added and removed. Leaving a group takes the
  contact out wherever it is recorded, `CATEGORIES` included; nothing is ever
  added to `CATEGORIES`. An empty group card is kept.
- The contact's card is written first, then the group cards with `If-Match`.
  A group card that fails leaves the contact saved, names the groups not
  updated, and offers reload or overwrite as for a contact (ADR 013).
- A contact without a UID gets one on the save that adds it to a group.
- Deleting or moving a contact leaves its member lines in group cards.

**Consequences.** Groups made in Natel show on iPhones, Macs and DAVx⁵ in its
default setup, not in Nextcloud's web app or DAVx⁵ in categories mode;
`compatibility.md` says so. A save can partly fail, and the bottom bar says
what is left.

## 023 — Photos: a small image is kept as it is, a large one scaled down, without the metadata that doesn't show

**Context.** A photo set in Natel has to show in Android (DAVx⁵) and Apple
clients, in vCard 3.0 and 4.0. Most platforms re-encode contact photos
anyway. A large card is refused by a stock server (an nginx in front of
Baïkal stops at 1 MB), and every phone downloads it at each sync only to
shrink it to an avatar.

**Decision.**
- An uncropped, upright JPEG, PNG, GIF or WebP of at most 1024 px and
  512 KB is kept byte for byte. Only the metadata that doesn't change how it
  shows (GPS location, camera, dates, XMP…) is removed, without re-encoding
  (`src/lib/photo-metadata.ts`).
- Anything else goes through a canvas, scaled down to 1024 px at most: a
  crop, a rotated photo (Google Contacts ignores the EXIF orientation),
  another format, a larger image, or a JPEG with HDR data, whose packets can
  hold private data. The result is a JPEG at quality 0.9, or a PNG when that
  keeps transparency or weighs less, and it is checked before it replaces
  anything. 1024 px is past what any client shows (Android keeps 720 px).
- A 3.0 card gets `PHOTO;ENCODING=b;TYPE=…`, a 4.0 card a data URI with the
  comma escaped as ical.js writes it, the only form Radicale keeps. The
  card's version never changes.
- A save touches `PHOTO` only when the user replaces or removes the photo. A
  photo given as a URL is never fetched, and Apple's crop rectangle is kept
  but not applied.
- A card the server refuses for its size (413) shows an error saying so;
  a dropped connection on a card over 1 MB says the size may be why.
- The crop is a canvas dialog with no library (DESIGN.md).

**Rejected.** A lossless JPEG crop through jpegtran in WebAssembly: it crops
only on the 8 px block grid and adds a few hundred KB. A PNG for every crop:
several times larger.

**Consequences.** A small photo stays as the user chose it; a large one makes
a card of a few hundred KB that servers and clients accept. A re-encoded
photo loses its metadata, its HDR gain map and all but the first frame of an
animation. Apple photos show uncropped. Checked on Android through DAVx⁵ and
Google Contacts; Apple devices are not checked yet.

## 024 — The escaped semicolon in text values is read as a semicolon

**Context.** Radicale escapes every semicolon in text (`NOTE:a\;b`), as
RFC 2426 asks, but ical.js decodes `\;` only in structured values such as
`N`. Natel showed `a\;b`, and each save added a backslash.

**Decision.** `decodeEscapedSemicolons` in `src/vcard/`, a named workaround,
makes ical.js decode `\;` in plain text and 4.0 `uri` values too. Writing is
unchanged: ical.js writes `;` unescaped, which RFC 6350 allows.

**Consequences.** A semicolon shows and saves as typed, on every server. An
untouched `\;` is written back as `;`, an accepted normalisation. Backslashes
that earlier saves piled up stay, except in a 4.0 photo's data URI, which
`unescapeDataUriSemicolons` repairs.

## 025 — Public demo: a static build with an in-memory CardDAV stand-in

**Context.** The launch needs a public demo. A real server reset nightly
would mean hosting one and exposing it to launch traffic, which the
maintainer declined.

**Decision.**
- `src/dav/demo.ts` implements `src/dav/`'s API in memory, per tab: the same
  functions and `DavError`, ETags and `If-Match` checked as a server would,
  and a short delay. A type-only test holds it to the real API. Everything
  above `src/dav/` runs unchanged.
- It is a build mode, `VITE_DEMO=1`, never in the Docker image (a test
  checks). The build can be served under a subpath, carries the CSP as a
  meta tag, and ships a `404.html` for deep links.
- Sign-in accepts anything, and every screen says it is a demo. The contacts
  are made up (`src/dav/demo-seed.ts`), with phone numbers from ranges
  reserved for fiction. A reload brings the seed back, so there is nothing
  to moderate.
- GitHub Pages serves it, deployed at each `vX.Y.Z` tag.

**Rejected.** A service worker answering as a CardDAV server: a PROPFIND and
REPORT responder to write. Mock Service Worker: a dependency for the demo
alone. Stubbing the query hooks: it would leave `src/vcard/` and saving out.

**Consequences.** The demo shows the whole UI, editing included, at no
hosting cost, but not compatibility with a real server, which the e2e matrix
covers. A change to `src/dav/`'s API must change `demo.ts`, and the compiler
enforces it. Another site can frame the demo, since a meta tag can't set
`frame-ancestors`; it holds no real data. Amended by ADR 035, which serves
it at the root of its own domain.

## 026 — The theme and the list's sort are display preferences too

**Context.** The UI review asked for a theme choice overriding the system's,
and for the list's sort to survive a reload.

**Decision.**
- Both are display preferences under ADR 019's rules: `"theme"` (`light` or
  `dark`, absent for the system's) and `"sort"` (`family`, absent for the
  first name).
- The default sort is the first name, as names are said in French and
  English.
- `public/theme.js`, loaded before the styles, sets `data-theme` before the
  first paint: an inline script would need a hash in the CSP.
- The group filter stays per session: it depends on a book's content.

**Rejected.** CSS `light-dark()`: it needs Safari 17.5, and below that every
colour token fails, so iPhones on iOS 16 would get a broken page.

**Consequences.** A reload keeps the theme and the sort, per browser. Without
JavaScript the page stays light, which matters little, since Natel needs it.

## 027 — The demo's two books: Runeterra and Expédition 33

**Context.** The demo's second book was thin, and the maintainer asked for
two books that each tell their own story.

**Decision.** "Runeterra" holds the League of Legends characters, with their
groups. "Expédition 33" holds about a dozen characters and places from
*Clair Obscur: Expedition 33*, with both kinds of group, an organisation and
an unknown property. Phone numbers still come from fiction ranges (ADR 025).

**Consequences.** The demo uses the characters' names only, with no artwork.

## 028 — Apple's year-less birthday: year 1604 with `X-APPLE-OMIT-YEAR`

**Context.** iCloud writes a birthday without a year as
`BDAY;X-APPLE-OMIT-YEAR=1604;VALUE=date:1604-07-14`, since vCard 3.0 has no
date without a year. Natel showed "14 juillet 1604".

**Decision.** A workaround for Apple (invariant 6) in `src/vcard/`: a year
named by `X-APPLE-OMIT-YEAR` reads as absent, and a 3.0 card writes a
year-less birthday in Apple's form, which Apple and DAVx⁵ read back. A 4.0
card keeps `--MMDD`. A birthday given a year drops the parameter, and an
unchanged birthday is left as it is (ADR 012).

**Consequences.** Apple's year-less birthdays show as such and stay so
through a save. A 3.0 card with `--MMDD` gets Apple's form once its birthday
is edited.

## 029 — `REV` moves to the time of each save

**Context.** After an edit in Natel, a card kept the `REV` another client had
written. RFC 6350 makes `REV` the card's revision, set by the client that
writes it.

**Decision.** `stampRevision` in `src/vcard/` sets `REV` to the time of the
save, in UTC to the second, on contacts and group cards. A card without
`REV` doesn't get one.

**Consequences.** A card saved in Natel says when. A moved or imported card
keeps its `REV`, since its text goes over unchanged.

## 030 — Display grouped `X-ABLABEL` values and replace them with an explicit type

**Context.** Apple and DAVx⁵ cards carry custom labels ("Chalet", "Bateau")
as an `X-ABLABEL` grouped with their `TEL`.

**Decision.** `appleLabelOf` in `src/vcard/` reads a property's label by its
group. The UI shows it in place of the row's type (DESIGN.md "Grouped
contact labels"). Choosing another type writes `TYPE` and drops the label;
changing only the value keeps it. Creating custom labels is out of scope;
ADR 036 amends this for addresses.

**Consequences.** Labels show on their field rather than among the
information not shown, and survive every save.

## 031 — Bound upload reads with a total budget in the official Caddy image

**Context.** Incomplete HTTP/1.1 uploads could outlive Caddy 2.11.7's body
idle deadline and hold upstream connections. Natel keeps the official Caddy
binary rather than a custom build.

**Decision.** The Caddyfile sets `protocols h1 h2`, `read_header 1m`,
`read_body 10m` and `read_body_idle -1s`: a fixed ten-minute budget per
request body, with the idle reader off.

**Consequences.** A stalled upload is bounded, in Docker and on bare metal; a
body that takes more than ten minutes fails. There is no size cap. HTTP/3
is off, since Caddy
doesn't enforce the budget there. Tests check the budgets on the real
Caddyfile.

## 032 — Server-side sessions in a session process next to Caddy

**Context.** A reload signed the user out (ADR 007), so every opening of the
app meant signing in again: the main friction left in daily use. A session
cookie keeps the password out of page scripts, but needs state on the
server, which Caddy doesn't hold (ADR 002).

**Decision.** `natel-session`, a Go binary with only the standard library
(`session/`), is the container's entrypoint and runs Caddy as its child. It
holds sign-in sessions in memory and does nothing else.
- `POST /session` checks the credentials with a `PROPFIND` on the CardDAV
  server and sets an `HttpOnly`, `SameSite=Strict` cookie, `Secure` and
  `__Host-` over HTTPS. The app keeps only the username.
- For each `/dav/*` request, Caddy asks `natel-session` for the
  `Authorization` to send (`forward_auth`), on the loopback, with a secret
  `natel-session` gives Caddy at startup.
- A sign-in or sign-out is accepted only from Natel's own page
  (`Sec-Fetch-Site`, else `Origin`).
- A session ends after 12 hours without use, 7 days at most, on sign-out, or
  when the container restarts. An account holds at most 20 sessions, and at
  most 10,000 are open; past that, a sign-in gets a 429. Nothing is written to disk, and no log line
  carries a password, token, username or address.
- If either process stops, the container stops and Docker restarts both.

This amends ADR 002, ADR 007 and invariants 2 and 3 in `AGENTS.md`.

**Rejected.** The Credential Management API: Chromium only.
`sessionStorage`: any script on the origin can read the password.

**Consequences.** A reload keeps the session in every browser, and page
scripts never see the password: an XSS can act as the user until sign-out,
but can't read it. The password stays in the container's memory for the
session's lifetime. Sign-out revokes the session on the server; if that
request fails, the user is told and stays signed in. Each `/dav` request
costs a loopback round trip. The repository gains Go code with its own tests
and CI job, security code reviewed before each release.

## 033 — The official Caddy binary on a plain Alpine base

**Context.** Starting under `cap_drop: ALL` means removing the file
capability from Caddy's binary, which copied the 52 MB binary into a new
layer: the image held it twice (127 MB unpacked, 46 MB compressed).

**Decision.** A build stage takes the binary from the pinned `caddy:2-alpine`
and removes the capability. The runtime starts from the pinned `alpine` the
official image uses, adds what Natel needs from it (`ca-certificates`,
`mailcap`, its directories and `XDG_*` variables), and leaves out `curl` and
`libcap`.

**Consequences.** The binary is still the one the Caddy project builds. The
image drops to 70 MB unpacked and 26 MB compressed. Dependabot moves two
pinned bases; the Alpine minor release moves by hand to the official
image's. A change to the official Dockerfile no longer reaches Natel by
itself.

## 034 — Wait 60 seconds for a CardDAV answer to start

**Context.** Caddy's proxy waits on the CardDAV server without a limit, and
the app did too: a server that never answered left a save, or the list,
waiting for good.

**Decision.** Each DAV request from the app fails with its own error,
`TIMEOUT`, when the server's answer hasn't started within 60 seconds. Once
it starts, the body has no limit. Discovery stops at the first timeout,
since every root it tries is on the same server.

**Rejected.** A total budget per request: a large address book on a slow
connection can take longer to arrive. A `response_header_timeout` on
Caddy's proxy: Vite's proxy would still wait, and so would the app when the
network between the browser and Caddy drops the answer.

**Consequences.** A server that doesn't answer gets an error instead of an
endless wait. A write that times out may still have taken effect, so its
message says so, and saving again then meets a conflict. A PUT's 60
seconds include its upload.

## 035 — The demo at demo.natel.app

**Context.** The README and the link previews need the demo's address
before launch. GitHub Pages' own, `kewindousse.github.io/natel/`, follows
the repository's owner and name, and puts the app under a subpath.

**Decision.** The Pages site of `KewinDousse/natel` uses `demo.natel.app` as
its custom domain, a CNAME to `kewindousse.github.io`. The demo is built
for the root, like the normal build: neither takes a base path.

**Rejected.** The `github.io` address: it changes if the repository moves,
and it keeps a build option only the demo uses.

**Consequences.** The address stays if the repository moves. The demo
build is closer to the normal one, and its e2e tests run at the root. The
`natel.app` DNS zone now serves the demo too.

## 036 — Custom address labels as a grouped `X-ABLABEL`

**Context.** Users want to name an address ("Chalet", "Atelier") rather
than pick home, work or other. vCard has no property for that name; ADR 030
reads the one Apple and DAVx⁵ write, an `X-ABLABEL` in the address's group.

**Decision.** The address's type menu offers a custom label. Natel writes
it as the `X-ABLABEL` of the `ADR`'s group, giving an ungrouped `ADR` the
first free `itemN` group, and leaves `TYPE` as it was. An empty label
removes the `X-ABLABEL`. Phones, e-mails and websites keep ADR 030's
behaviour.
Each address is written back on the `ADR` it was read from, found by its
value and parameters whatever its group, so it keeps that property's group,
`X-ABLABEL` and `X-ABADR`. An address sharing its group with another
property, shown or not (a phone, `IMPP`, `X-ABRELATEDNAMES`), moves to a
group of its own, with its `X-ABADR`, before its label is set or removed,
so the other keeps its label. The label is vCard text, its commas,
semicolons and backslashes escaped.

**Consequences.** The label takes the form Apple and DAVx⁵ write theirs
in; a client that ignores `X-ABLABEL` shows the address's type. Naming an
ungrouped address adds a group prefix to its `ADR` line. Removing an
address leaves the rest of its group, its label included, as removing a
phone does. On an overwrite (ADR 013), the addresses are written whole,
labels included, as phones and e-mails are: one added or edited elsewhere
is replaced by the user's list. An address the other client changed takes
the `ADR` left in the group it was read from, if that group still holds the
`X-ABADR` it was read with, keeping that property's group and `X-ABADR`.
Any other gets a new `ADR`: an `ADR` left, in its group or another, may be
another address's, regrouped or added elsewhere, or removed by the user.
So does one whose `X-ABADR` changed elsewhere with its country: its old
group keeps that `X-ABADR` and the label, which shows twice on the card.
