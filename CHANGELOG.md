# Changelog

Notable changes to Natel. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

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

- `BAIKAL_URL` is now `CARDDAV_URL`, since Natel works with any CardDAV
  server. Rename it in your compose file or service before upgrading.
- The settings' help links end with "Report a bug"; the "Setup questions"
  link is gone.
- The image's entrypoint is `natel-session`, which runs Caddy as its child
  and listens on `127.0.0.1:2020`. Sharing the host's network, set
  `NATEL_SESSION_ADDR` if that port is taken. A command given to
  `docker run` still runs, under `natel-session`. Without Docker, build and
  install `natel-session` and run Caddy under it
  ([bare-metal.md](docs/bare-metal.md)).
- The image runs Caddy as an unprivileged user (UID 10001) and listens on
  port 8080, and 8443 for HTTPS: publish the container's port 8080 instead
  of 80, and point a reverse proxy at port 8080. A `/data` volume from an earlier
  version must be handed to that user once:
  `docker run --rm -v <volume>:/data alpine chown -R 10001:10001 /data`.
- Caddy's admin API is off outside the image, which keeps it on
  `127.0.0.1:2019` for its healthcheck only.
- No file or folder whose name starts with a dot (`.env`, `.git/`) is
  served, so one left in the app's folder outside the image stays private.
- HSTS covers Natel's own host only, without `includeSubDomains`: a Natel
  at the root of a domain no longer forces HTTPS on all its subdomains for a
  year. A browser that already has the old rule drops it for the subdomains
  on its next visit to an updated Natel; one that doesn't come back keeps it
  until it expires.
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
