# Changelog

Notable changes to Natel. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.5.0] - 2026-11-07

### Upgrade notes

- The image no longer turns on Caddy's admin API: its healthcheck now reads a site Caddy serves on `127.0.0.1:2021`, set by `NATEL_HEALTH_PORT`. Containers that set `NATEL_ADMIN: "off"` and disabled the healthcheck can drop both. Change the port if another service on a shared network namespace uses it, and turn the admin API back on only for a probe or tool of yours that reads port 2019, and never on a shared namespace, where it reopens the issue below. Bare-metal installations that copy the Caddyfile get the listener too and can delete its site block. See [deployment](docs/deployment.md#host-network-sidecars-and-pods) and [bare metal](docs/bare-metal.md#configure).

### Added

- The address book is in each page's address, as in /contacts/work/ada, so a reload or a shared link opens the same book, and signing in opens the page that was asked for. The settings move to /settings.
- A .vcf file dropped on the window is imported into the selected address book.
- An import first shows what it will do, and lists the cards that look like contacts already in the book, which can be left out.
- Settings offers a button to check for a newer release immediately when server update checks are enabled, with a result or an error shown after the check.
- The move dialog warns that a contact may no longer appear in some groups after moving to another address book and asks you to check its groups afterwards.
- The deployment guide explains that Natel checks no password when Xandikos is exposed directly, and gives a tested Caddy site that protects it.

### Changed

- Contact pages show compact initials beside the name and organisation on phones and desktop. Photos keep their full size, and long names wrap beside the avatar.
- Contact forms use text controls for additions and deletion, and contact groups use compact rectangular chips to distinguish them from primary actions.
- Contact photos, initials and organisation icons are round by default. Settings lets you choose rounded squares instead; the choice applies to the list, contact pages and forms and is remembered in your browser.
- Contact forms group optional information in one Add information menu and separate move and delete actions from field additions.
- Contact lists hide dotted leaders when they would shorten a name, giving long names more room without changing the pane width or trailing values.
- Contact pages use compact rows on desktop and lighter sections on phones. Settings lets you keep this automatic layout or place row labels on the left or above values at every screen width, with a live preview. Copy and edit controls align beside the first value of each desktop section.
- The selected contact's red marker is shorter and stays centred beside its image.
- On phones, the top bar's back link names the address book the page belongs to.

### Fixed

- The password's show button and the search's clear button sit centred in their fields, and smaller.
- vCard 3.0 text now escapes semicolons as required by the standard, and text birthdays retain their characters across repeated saves. Long vCard lines follow the recommended 75-byte limit. Clients affected by the ical.js semicolon decoding issue, including Nextcloud Contacts, may display an extra backslash; see the compatibility notes.

### Security

- Containers that share their network namespace (`network_mode: host`, a VPN or Tailscale sidecar, a Kubernetes pod) and kept the default `NATEL_ADMIN` exposed Caddy's unauthenticated admin API to every process on that namespace, which could reconfigure Caddy to collect passwords. The admin API is now off by default; containers on their own Docker network were not affected.
- The image updates Caddy to 2.11.9, and Go, x/net and musl to versions that fix high-severity vulnerabilities a scan reported in 0.4.1; a scan does not show that each one was reachable in Natel. Bare-metal installations update their own Caddy package.
- HTTPS deployments can enable NATEL_HTTPS_ONLY_COOKIE=true to prevent a sibling subdomain from planting an attacker's session when the TLS proxy is bypassable or HTTPS is not detected. The setting defaults to false to preserve HTTP access; see [HTTPS session cookies](docs/deployment.md#https-session-cookies) before enabling it.

## [0.4.1] - 2026-10-26

### Upgrade notes

- Update checks are enabled by default. Your Natel server consults a static version file hosted on GitHub Pages at most once per 24 hours while the app is used. Set `NATEL_UPDATE_CHECKS=false` to disable these external requests; no contacts or credentials are sent.

### Added

- A contact can have several addresses, each with an extended line (c/o, building) and a label of its own, such as "Chalet".
- A contact's address opens a map search for it: by default Apple Maps on Apple devices, the device's maps app on Android, OpenStreetMap elsewhere. The settings choose another, Google Maps included.
- A group on a contact's page filters the list on that group.
- A full birthday shows the age.
- A dot on the settings icon tells you when a newer release is available; the settings link to its release notes and let you ignore that version on this browser.

### Changed

- The header loses its red band along the top, a decoration the contact, settings and new-contact screens on phones didn't have.
- After a conflict, overwriting is no longer offered when the phones, e-mails or addresses the user changed were changed elsewhere too: the warning names them and offers to reload.

## [0.4.0] - 2026-10-26 [YANKED]

Withdrawn the day it was published. Its changes are released in 0.4.1.

## [0.3.1] - 2026-10-20

### Fixed

- The image's provenance attestation is stored in the registry too, next to
  the image. `gh attestation verify` already found it on GitHub for 0.3.0.

## [0.3.0] - 2026-10-20

### Added

- Sign-in sessions: a reload, or reopening the browser, keeps you signed
  in, up to 7 days, or 12 hours without use. `natel-session`, a small
  process in the image, checks the password against the CardDAV server and
  keeps it in memory, never on disk; the browser holds only a session cookie
  that page scripts can't read. Restarting the container signs everyone
  out. Without Docker, run Caddy under `natel-session`
  ([bare-metal.md](docs/bare-metal.md)).
- `NATEL_TRUSTED_PROXIES`: behind a reverse proxy, the CardDAV server sees
  each client's own address, so it or a fail2ban can block password
  guessing.

### Changed

- `BAIKAL_URL` is now `CARDDAV_URL`: Natel isn't tied to Baïkal, and CI tests
  it against Baïkal, Radicale and Xandikos.
- The settings' help links end with "Report a bug"; the "Setup questions"
  link is gone.
- The image's entrypoint is `natel-session`, which runs Caddy as its child
  and listens on `127.0.0.1:2020`. Sharing the host's network, set
  `NATEL_SESSION_ADDR` if that port is taken. A command given to
  `docker run` still runs, under `natel-session`. Without Docker, build and
  install `natel-session` and run Caddy under it
  ([bare-metal.md](docs/bare-metal.md)).
- The image runs Caddy as an unprivileged user (UID 10001) and listens on
  port 8080, and 8443 for HTTPS.
- Caddy's admin API is off outside the image, which keeps it on
  `127.0.0.1:2019` for its healthcheck only.
- No file or folder whose name starts with a dot (`.env`, `.git/`) is
  served, so one left in the app's folder outside the image stays private.
- HSTS covers Natel's own host only, without `includeSubDomains`: a Natel
  at the root of a domain no longer forces HTTPS on all its subdomains for a
  year.
- A photo larger than 1024 px or 512 KB is scaled down to 1024 px on its
  longest side, so a phone photo fits a server's default request limit: a
  JPEG, or a PNG when it has transparency and stays under 512 KB, or comes
  out lighter. A smaller photo is still kept as it is. A large photo no
  longer stops on the "too large to crop" error.

### Fixed

- A CardDAV server that never answers no longer leaves Natel waiting: after
  60 seconds without the start of an answer, the request fails and says the
  server didn't answer in time. A save, deletion or import may still have
  gone through, and the message says so.
- After a network error, a save, deletion, import or group change says it
  may have gone through anyway: the connection can drop after the server
  made the change.
- Apple birthdays without a year display without the placeholder year.
- Custom phone, email, address and website labels from Apple/DAVx⁵ are shown;
  changing a label's type removes that custom label.
- A saved vCard ends with CRLF, and an existing `REV` advances on save.
- Rotated photo uploads have their orientation applied for synced clients.

### Security

- Authenticated DAV requests and redirects stay under the configured proxy;
  resource paths preserve their escaped segments.
- Updates and deletions require a single strong ETag, refusing weak tags,
  wildcard tags and multiple tags.
- Photo uploads strip hidden metadata from simple WebP files and JPEG HDR
  gain maps. Existing photos are preserved when another field is edited.
- The proxy only forwards the DAV methods the app uses, drops cookies and
  upstream browser authentication challenges, and isolates upstream error pages.
- The app uses Trusted Types and encodes contact action links so contact data
  cannot add URL parameters.
- Docker build dependencies and Caddy/Alpine dependencies are updated.
  Caddy's official image still has compiled dependency findings under review;
  these updates do not establish that every finding is exploitable or resolved.
- Direct deployments have explicit HTTP read deadlines and require Caddy
  2.11.7 or later. A stalled HTTP/1.1 keep-alive upload can still outlive the
  body idle deadline; see [bare-metal deployment](docs/bare-metal.md#http11-stalled-uploads-with-keep-alive).

## [0.2.0] - 2026-10-01

### Added

- Contact photos, in the list and on the contact page. "Change photo" opens
  a crop dialog; an uncropped JPEG, PNG, GIF or WebP is kept byte for byte,
  without the metadata that doesn't show (GPS location, camera, dates), and
  keeps its orientation. "Remove photo" removes it. Works on vCard 3.0 and
  4.0 cards.
- Groups: a contact's groups are read from group cards (Apple, DAVx⁵) and
  `CATEGORIES`, and can be added and removed on an existing contact; Natel
  writes them as group cards, which Nextcloud's web app and DAVx⁵ in
  categories mode don't show (see [group compatibility](docs/compatibility.md#groups)).
- Move a contact to another address book.
- Export the selected address book as a `.vcf` file, and import one into it,
  skipping cards already there.
- Installable as an app (PWA), with the brand's icons.
- Dark mode, following the system setting.
- Keyboard shortcuts: arrows through the list, `N` for a new contact,
  Ctrl/⌘+Enter to save, `?` to list them.
- A settings page, where the language now lives; a language you pick is
  remembered on this browser.

### Changed

- A contact with neither a name nor an organisation shows as "Unnamed
  contact".
- A server that refuses a card for its size says so, with a hint about its
  request size limit.

### Fixed

- A semicolon that the server escapes in a field (as Radicale does) no
  longer shows a backslash, and no longer gains one on each save.
- Screen readers now name the form fields, list rows and pages that had no
  accessible name.

## [0.1.0] - 2026-09-30

### Added

- Sign in with the CardDAV credentials of the server set by `BAIKAL_URL`;
  credentials stay in memory only.
- Address books: switch between them, contact list grouped A–Z with
  accent-insensitive search.
- Contact page: view, then edit in place the name, a nickname, phones,
  e-mails, an address, birthday, organisation, job title, a website and a
  note.
- Properties the app doesn't edit are kept as they are, and counted in edit
  mode.
- Create and delete contacts.
- Changes made elsewhere are detected on save (reload the server's version,
  or overwrite only the fields you changed) and on delete (reload before
  deleting).
- English and French.
- Docker image for amd64 and arm64, served by Caddy with a healthcheck and a
  content security policy; Caddy proxies CardDAV requests to your server.
- Phone layout: the header stays on one row from 360px, and no screen
  scrolls sideways.
- The contact list shows the sorted part of the name first, and a finger
  sliding along the A–Z index scrolls the list on phones.
- Password managers recognise the sign-in form.
