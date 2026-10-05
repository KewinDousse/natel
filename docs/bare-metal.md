# Running Natel without Docker

Natel is a folder of static files and a Caddyfile: Caddy serves the files and
proxies `/dav` to your CardDAV server. The Docker image is that, set up for
you. Without it, these are the steps, and the places where a default would
leave a hole.

## Build

You need Node 24 with pnpm (`corepack enable`). Build from a release tag:

```sh
git clone https://github.com/KewinDousse/natel.git
cd natel
git checkout v0.3.0        # or later: older Caddyfiles lack these settings
pnpm install --frozen-lockfile
pnpm build                 # writes dist/
```

`pnpm dev` and `pnpm preview` are development servers. Don't serve Natel
with them.

## Caddy

Install Caddy 2.9 or later from a package
([caddyserver.com/docs/install](https://caddyserver.com/docs/install)), and
check with `caddy version`. Debian 12 and 13, Ubuntu 24.04 to 26.04 and the
distributions based on them ship Caddy 2.6, which lacks years of fixes and
refuses this Caddyfile:
`unrecognized servers option 'trusted_proxies'`.
On those, add Caddy's
[stable repository](https://caddyserver.com/docs/install#debian-ubuntu-raspbian),
or on Debian 13 install it from `trixie-backports`. Don't get an older Caddy
to start by deleting the lines it refuses: `NATEL_BIND` and
`NATEL_TRUSTED_PROXIES` (see the README) would then do nothing, and Natel
would listen on every interface.

The package runs Caddy as its own `caddy` user under systemd, allowed to
bind ports 80 and 443 without being root. Don't start Caddy as root by hand:
a flaw in it or in what it parses would then run as root.

## Install

Copy `dist/` alone into a folder of its own. Caddy serves every file in that
folder, so never point it at the repository: `.git/` or a `.env` would be
served too.

```sh
sudo mkdir -p /usr/share/natel
sudo cp -r dist/. /usr/share/natel/
sudo cp Caddyfile /etc/caddy/Caddyfile
```

If this Caddy already serves other sites, copy the `(security_headers)`
snippet and the site block into your own Caddyfile instead, and keep your
global options. The admin API then follows them: Caddy turns it on by
default, so add `admin off` there unless you need it.

## Configure

Set the environment in the service, with `sudo systemctl edit caddy`:

```ini
[Service]
Environment=BAIKAL_URL=https://dav.example.com
Environment=NATEL_ROOT=/usr/share/natel
Environment=NATEL_BIND=127.0.0.1
Environment=NATEL_HTTP_PORT=8080
```

then `sudo systemctl restart caddy`. That example serves Natel on
`127.0.0.1:8080`, for a reverse proxy on the same machine.

| Variable | Default | |
|---|---|---|
| `BAIKAL_URL` | (required) | Origin of your CardDAV server. Use `https://` unless the server runs on the same machine: Natel sends your password to it with every request. Caddy starts without it, but `/dav` then answers 503 and the sign-in reports that the server can't be reached. |
| `SITE_ADDRESS` | `http://` | What Caddy serves. Exposed directly, your domain (`contacts.example.com`): Caddy gets and renews the certificate itself, on ports 80 and 443. |
| `NATEL_BIND` | (all interfaces) | The interface Caddy listens on. Behind a reverse proxy on the same machine, `127.0.0.1`, so Natel can't be reached around the proxy in plain HTTP. A host in `SITE_ADDRESS` doesn't do that: Caddy still listens everywhere and only matches the `Host` header, which the client chooses. |
| `NATEL_ROOT` | `/usr/share/caddy` | The folder holding the contents of `dist/`, and nothing else. |
| `NATEL_ADMIN` | (off) | Caddy's admin API, which reconfigures Caddy without authentication for anyone on the machine. Leave it off. It is what `caddy reload` talks to, so `systemctl reload caddy` fails: use `systemctl restart caddy`. |
| `NATEL_HTTP_PORT`, `NATEL_HTTPS_PORT` | 80, 443 | The ports Caddy uses for HTTP and HTTPS when `SITE_ADDRESS` names none. |

## Update

Build the new tag, replace the contents of `/usr/share/natel` with the new
`dist/`, and copy the new Caddyfile if it changed (the release notes say so).
Then `sudo systemctl restart caddy`.
