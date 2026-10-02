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
3. **Baïkal-first, not Baïkal-only.** Baïkal is the documented target. CI runs
   the end-to-end tests against Baïkal, Radicale and Xandikos; Nextcloud is
   expected to work but isn't tested.
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
      - "8080:8080"
```

Open `http://localhost:8080`, log in with your CardDAV credentials.

Your browser sends those credentials with every request, so anywhere but on
your own machine, serve Natel over HTTPS: behind a reverse proxy (below), or
let its Caddy get a certificate itself.

## Compatibility

Natel reads and writes plain vCards, so any CardDAV client sees the same
contacts. Groups are the exception, because clients store them in two ways:

- **Groups made in Natel** are separate group cards, the form Apple
  Contacts, iCloud and DAVx⁵ (in its default setup) use. They show on
  iPhones, Macs and those Android phones.
- **Nextcloud's web app, and DAVx⁵ set to "groups are per-contact
  categories"**, store groups as `CATEGORIES` on each contact instead, and
  don't show groups made in Natel. Their groups do show in Natel, and a
  contact can be taken out of them there.

## Configuration

| Variable | Default | |
|---|---|---|
| `BAIKAL_URL` | (required) | Origin of your CardDAV server, `scheme://host[:port]`, no path. Reached from inside the container: `http://baikal` works when Baïkal is a service of the same Compose file. |
| `SITE_ADDRESS` | `http://` (port 8080) | What Caddy serves. Set it to your domain (`contacts.example.com`), publish the host's ports 80 and 443 to the container's 8080 and 8443 (`"80:8080"`, `"443:8443"`) and keep `/data` in a volume, and Caddy fetches and renews the certificate itself. |

The container runs as an unprivileged user, UID 10001. A new named volume on
`/data` needs nothing; a host directory mounted there, or a volume created by
an earlier version, must belong to that user (`chown -R 10001:10001`).

### Finding your address books

Natel looks for the server's address books under `/.well-known/carddav`, then
at the root of `BAIKAL_URL`, then under `/dav.php/`. Baïkal at the root of its
domain is found without any setup. Baïkal under a path
(`https://example.com/baikal/html/`, with `BAIKAL_URL=https://example.com`)
needs the `.well-known` redirect on that origin, for example with nginx:

```nginx
location = /.well-known/carddav {
    return 301 /baikal/html/dav.php;
}
```

### Behind a reverse proxy

Natel listens on port 8080 in the container; the proxy terminates HTTPS and
forwards everything, `Authorization` header included.

**Traefik**, with Docker labels. `websecure` and `letsencrypt` stand for the
entrypoint and certificate resolver of your Traefik configuration, and the
container must share a network with Traefik:

```yaml
services:
  natel:
    image: ghcr.io/kewindousse/natel:latest
    environment:
      BAIKAL_URL: https://dav.example.com
    labels:
      - traefik.enable=true
      - traefik.http.routers.natel.rule=Host(`contacts.example.com`)
      - traefik.http.routers.natel.entrypoints=websecure
      - traefik.http.routers.natel.tls.certresolver=letsencrypt
      - traefik.http.services.natel.loadbalancer.server.port=8080
```

**SWAG**, in `/config/nginx/proxy-confs/natel.subdomain.conf`, with the
container named `natel` on SWAG's network and `contacts` in SWAG's
`SUBDOMAINS` (or a wildcard certificate):

```nginx
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name contacts.*;
    include /config/nginx/ssl.conf;
    client_max_body_size 0;

    location / {
        include /config/nginx/proxy.conf;
        include /config/nginx/resolver.conf;
        set $upstream_app natel;
        set $upstream_port 8080;
        set $upstream_proto http;
        proxy_pass $upstream_proto://$upstream_app:$upstream_port;
    }
}
```

**Nginx Proxy Manager**: add a proxy host for your domain with scheme `http`,
forward hostname `natel` (the container, on the same Docker network) and port
`8080`. In the SSL tab, request a certificate and turn on "Force SSL".

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

[CONTRIBUTING.md](CONTRIBUTING.md) covers the end-to-end tests and pull
requests, [SECURITY.md](SECURITY.md) how to report a vulnerability, and
[CHANGELOG.md](CHANGELOG.md) what changed between releases.
