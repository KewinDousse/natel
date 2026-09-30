# Changelog

Notable changes to Natel. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

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
