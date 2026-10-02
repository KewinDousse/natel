# Changelog

Notable changes to Natel. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed

- The image runs Caddy as an unprivileged user (UID 10001) and listens on
  port 8080, and 8443 for HTTPS: publish `8080:8080` instead of `8080:80`,
  and point a reverse proxy at port 8080. A `/data` volume from an earlier
  version must be handed to that user once:
  `docker run --rm -v <volume>:/data alpine chown -R 10001:10001 /data`.
- Caddy's admin API is off outside the image, which keeps it on
  `127.0.0.1:2019` for its healthcheck only.

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
  categories mode don't show (see Compatibility in the README).
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
