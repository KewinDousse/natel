<h1>
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/brand/readme/banner-dark-en.png">
    <img alt="Natel: the contact editor your CardDAV server is missing." src="docs/brand/readme/banner-light-en.png">
  </picture>
</h1>

[![CI](https://github.com/KewinDousse/natel/actions/workflows/ci.yml/badge.svg)](https://github.com/KewinDousse/natel/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Natel is a web editor for the contacts on your CardDAV server. The server
keeps your contacts in sync across your phones and computers, but often
gives you nowhere to edit them in a browser. Natel fills that gap: one small
container, contacts only, pointed at the server you already run.

**[Try the demo](https://demo.natel.app/)** (made-up contacts, edits reset
on reload) · [Quick start](#quick-start) · [Documentation](#documentation-and-help)

<p>
  <img alt="The contact list and a contact's page, on a desktop screen." src="docs/screenshots/desktop.png" width="74%">
  <img alt="A contact's page on a phone." src="docs/screenshots/mobile.png" width="23%">
</p>

> [!WARNING]
> Natel is alpha software, and it edits the contacts your other devices
> sync. Before your first edit, export each address book from the
> address-book menu, or back up your CardDAV server. The
> [compatibility notes](docs/compatibility.md) list what is tested and what
> remains to check.

## Why Natel

- **Baïkal and Radicale have no contact editor.** Baïkal's web page
  administers the server, Radicale's manages collections; neither edits a
  contact.
- **The usual alternatives are dormant or heavy.** InfCloud, and
  CardDavMATE, its contacts-only part, have had no release since 2015.
  Nextcloud Contacts needs a whole Nextcloud.
- **Natel is only a contact editor.** A static app and a small session
  process: the image is about 26 MB to download, and an instance takes
  about 16 MB of memory at rest ([architecture](docs/ARCHITECTURE.md#build)).

## Features

- Search contacts, browse several address books, and move a contact between them.
- Create, edit and delete contacts; add photos and crop them.
- Filter by group and edit memberships. Natel reads both the group cards
  Apple and DAVx⁵ write and Nextcloud's categories, and writes group cards,
  which Nextcloud doesn't show (see [compatibility](docs/compatibility.md#groups)).
- Import and export `.vcf` files.
- Phone and desktop layouts, light and dark themes, English and French,
  keyboard shortcuts. Installable as an app, though it needs a connection.

## Your contacts and your password

Whatever you don't edit on a card stays as it was, including the fields
Natel doesn't show, apart from the revision date a save moves. The formatting may shift a little, so a card can come
back with different line breaks or letter case, but nothing is lost, and
tests check this on every change.

If you edit a contact that someone changed on another device in the
meantime, Natel tells you instead of saving over their change.

Your password never touches a disk. Natel checks it with your CardDAV
server when you sign in and keeps it in memory until the
[session](docs/user-guide.md#sign-in-and-sign-out) ends. The only things
Natel stores about you in your browser are a session cookie that page
scripts can't read, your display settings and the release version you choose
to ignore.

## Update notifications

Natel checks for new releases from your server by default. You can disable
these checks in the [deployment configuration](docs/deployment.md#update-checks).
No contacts or credentials are sent; GitHub Pages receives the server's public
IP address and may log it.

## Quick start

Natel needs an existing CardDAV server and account; it does not host
address books. It is [tested](docs/compatibility.md#carddav-servers)
against Baïkal, Radicale and Xandikos. In a `compose.yaml`, set
`CARDDAV_URL` to your server's origin (`scheme://host[:port]`, without a
path):

```yaml
services:
  natel:
    image: ghcr.io/kewindousse/natel:0.3.1
    environment:
      CARDDAV_URL: https://dav.example.com
    ports:
      - "127.0.0.1:8080:8080"
```

```sh
docker compose up -d
```

Open `http://localhost:8080` on the machine running Docker and sign in with
your CardDAV account. The port is bound to `127.0.0.1`, so this setup is
local only: to reach Natel from other machines, serve it over HTTPS as the
[deployment guide](docs/deployment.md) shows, with Traefik, SWAG and Nginx
Proxy Manager examples. Natel also [runs without Docker](docs/bare-metal.md).

Keep an explicit version tag, and read the [changelog](CHANGELOG.md) before
[updating](docs/deployment.md#updating).

## Documentation and help

- [User guide](docs/user-guide.md): contacts, photos, groups, conflicts and sign-out.
- [Compatibility](docs/compatibility.md): tested servers and clients, group formats,
  browsers and known limits.
- [Deployment and updates](docs/deployment.md), also
  [without Docker](docs/bare-metal.md).
- [Troubleshooting](docs/troubleshooting.md): sign-in, discovery, photos and support.
- [Issues](https://github.com/KewinDousse/natel/issues/new/choose) for bugs and feature requests.
- [Security](.github/SECURITY.md): report vulnerabilities privately.

## Scope

Natel is a contacts client and stays one: no calendars, tasks or mail, no
accounts or permissions of its own, and no contacts or credentials stored
on the server. The UI edits a subset of vCard fields and keeps the others.
Offline use, incremental sync, duplicate merging, delegated authentication
and limits on password guessing are not implemented.

## Contributing

[CONTRIBUTING.md](CONTRIBUTING.md) covers setup, checks and pull requests,
including running the app on made-up contacts without a server.
[Architecture](docs/ARCHITECTURE.md) explains how the app fits together, and
[decisions](docs/DECISIONS.md) why it is built that way.

Natel is available under the [MIT license](LICENSE).
