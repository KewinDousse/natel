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
git checkout vX.Y.Z       # replace with the chosen published release tag
pnpm install --frozen-lockfile
pnpm build                 # writes dist/
```

`pnpm dev` and `pnpm preview` are development servers. Don't serve Natel
with them.

The settings below describe the current source. Its deployment hardening
is still in [Unreleased](../CHANGELOG.md#unreleased), not in `0.2.0`. Use a
release containing these settings once it is published; do not apply this
Caddyfile to an older release without checking its requirements.

## Caddy

Install Caddy 2.11.7 or later from a package
([caddyserver.com/docs/install](https://caddyserver.com/docs/install)), and
check with `caddy version`. Distribution packages, including backports, may
be older than this minimum. On Debian and Ubuntu, use Caddy's
[stable repository](https://caddyserver.com/docs/install#debian-ubuntu-raspbian)
if the distribution's package is too old. Don't get an older Caddy to start
by deleting the lines it refuses: the network restrictions and HTTP read
deadlines must stay active.

The package runs Caddy as its own `caddy` user under systemd, allowed to
bind ports 80 and 443 without being root. Don't start Caddy as root by hand:
a flaw in it or in what it parses would then run as root.

### Security updates

The minimum version above is for Caddyfile compatibility. Install security
updates for Caddy and its compiled Go dependencies from the package's
maintainer, and keep the operating system updated. A current Caddy version
can still have been built with vulnerable dependencies: check the package's
security notices too. If you build Caddy yourself, use a supported Go
toolchain with its security patches.

### HTTP read timeouts

The Caddyfile allows one minute to read request headers and one minute of
inactivity while reading an upload. Caddy 2.11.7 supports both settings.
The idle deadline resets when data arrives, so a slow or large upload can
continue while it makes progress. There is no total upload deadline or
minimum transfer rate. Keep these settings when integrating the site into
an existing Caddy configuration.

### HTTP/1.1 stalled uploads with keep-alive

With Caddy 2.11.7, an incomplete HTTP/1.1 upload using keep-alive can remain
open past the configured body idle deadline. An upload with `Connection:
close` is terminated as expected. For direct exposure, the configured Caddy deadlines alone
do not cover it; a front proxy needs its own stalled-upload protection.

## Install

Copy `dist/` alone into a folder of its own. Caddy serves every file in that
folder but those whose name starts with a dot (`.git/`, a `.env`), so never
point it at the repository: everything else in it would be served too.

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

| Variable                              | Default            |                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BAIKAL_URL`                          | (required)         | Origin of your CardDAV server. Use `https://` unless the server runs on the same machine: Natel sends your password to it with every request. Caddy starts without it, but `/dav` then answers 503 and the sign-in reports that the server can't be reached.                                                         |
| `SITE_ADDRESS`                        | `http://`          | What Caddy serves. Exposed directly, your domain (`contacts.example.com`): Caddy gets and renews the certificate itself, on ports 80 and 443.                                                                                                                                                                        |
| `NATEL_BIND`                          | (all interfaces)   | The interface Caddy listens on. Behind a reverse proxy on the same machine, `127.0.0.1`, so Natel can't be reached around the proxy in plain HTTP. A host in `SITE_ADDRESS` doesn't do that: Caddy still listens everywhere and only matches the `Host` header, which the client chooses.                            |
| `NATEL_ROOT`                          | `/usr/share/caddy` | The folder holding the contents of `dist/`, and nothing else.                                                                                                                                                                                                                                                        |
| `NATEL_ADMIN`                         | (off)              | Caddy's admin API, which reconfigures Caddy without authentication for anyone on the machine. Leave it unset, or set it to `off`: an empty value (`Environment=NATEL_ADMIN=`) turns it on at `localhost:2019`. It is what `caddy reload` talks to, so `systemctl reload caddy` fails: use `systemctl restart caddy`. |
| `NATEL_HTTP_PORT`, `NATEL_HTTPS_PORT` | 80, 443            | The ports Caddy uses for HTTP and HTTPS when `SITE_ADDRESS` names none.                                                                                                                                                                                                                                              |

## Update

Build the new tag, replace the contents of `/usr/share/natel` with the new
`dist/`, and copy the new Caddyfile if it changed (the release notes say so).
Then `sudo systemctl restart caddy`.
