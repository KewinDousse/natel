# Natel

A modern, lightweight web UI to browse and edit your contacts on a CardDAV server.
Built for [Baïkal](https://sabre.io/baikal/), works with any RFC 6352 server.

> **Status:** alpha. Browsing, creating, editing and deleting contacts
> work. See [ROADMAP.md](ROADMAP.md).

## Why

Self-hosting contacts with Baïkal is easy. Editing them from a browser is not:
the only dedicated open-source web client, InfCloud, had its last release in 2015,
is painful to deploy, and looks like it. Every other option is a full groupware
suite (Nextcloud, SOGo, Kurrier) or a native client.

Natel fills that gap: one container, one URL to configure, a UI that
feels like it was made this decade. Contacts only.

## Principles

1. **Never lose data.** Any vCard property the UI doesn't understand is preserved
   byte-for-byte on save. Concurrent edits (e.g. from your phone) are detected via
   ETags and never silently overwritten.
2. **Tiny footprint.** A static SPA served by Caddy, which also proxies CardDAV
   requests to your server. No Node runtime, no database, no state. Target: under
   20 MB RAM at rest.
3. **Baïkal-first, not Baïkal-only.** Baïkal is the tested, documented target.
   Radicale, Xandikos and Nextcloud are expected to work and are in the CI matrix.
4. **Zero-knowledge proxy.** Your credentials go from the browser to your CardDAV
   server through the proxy, unchanged. The proxy stores nothing.

## Quick start

```yaml
# docker-compose.yml
services:
  contacts:
    image: ghcr.io/kewindousse/natel:latest
    environment:
      BAIKAL_URL: https://dav.example.com           # your CardDAV server origin
    ports:
      - "8080:80"
```

Open `http://localhost:8080`, log in with your CardDAV credentials.

## Non-goals

- Calendars, tasks, mail. This is a contacts app.
- A backend. If a feature needs server-side state, it doesn't belong here.
- Replacing your CardDAV server. This is a client.
- Full vCard 4.0 coverage. A useful subset is edited in the UI; everything else
  is preserved, not edited.

## Development

See [AGENTS.md](AGENTS.md) for the working conventions (they apply to humans too)
and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how the pieces fit together.

```sh
pnpm install
pnpm dev        # SPA on :5173, expects a CardDAV server at VITE_DAV_URL
pnpm check      # typecheck + lint + tests — must be green before any PR
```
