# Deploying Natel

Natel needs an existing CardDAV server. For a local first run, follow the
[quick start](../README.md#quick-start). For access from another machine,
serve Natel over HTTPS and keep its HTTP port reachable only by your reverse
proxy. A Docker-published port can bypass ufw or firewalld rules: bind a
local-only port to `127.0.0.1`, or use a private Docker network for the proxy. Credentials also travel from Natel to the CardDAV server: use HTTPS
there unless that connection stays on a trusted local container network.

The examples below use the published image, which listens on port 8080.

## Published images

`ghcr.io/kewindousse/natel` is built for linux/amd64 and linux/arm64, with
an `X.Y.Z` tag for each release, `X.Y` for the newest patch of each minor
version, and `latest` for the most recently published release.
Use an explicit `X.Y.Z` tag for a repeatable installation. Each release
carries a provenance attestation, which checks that the image came from
this repository's CI:

```sh
gh attestation verify oci://ghcr.io/kewindousse/natel:X.Y.Z --owner KewinDousse
```

## Configuration

| Variable                | Default               |                                                                                                                                                                                                                                                                                                                                                     |
| ----------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CARDDAV_URL`           | (required)            | Origin of your CardDAV server, `scheme://host[:port]`, no path. Reached from inside the container: `http://baikal` works when Baïkal is a service of the same Compose file.                                                                                                                                                                         |
| `SITE_ADDRESS`          | `http://` (port 8080) | What Caddy serves. Set it to your domain (`contacts.example.com`), publish the host's ports 80 and 443 to the container's 8080 and 8443 (`"80:8080"`, `"443:8443"`) and keep `/data` in a volume, and Caddy fetches and renews the certificate itself.                                                                                              |
| `NATEL_TRUSTED_PROXIES` | (none)                | The reverse proxies in front of Natel, as addresses or ranges separated by spaces (`172.16.0.0/12`), or `private_ranges` if nothing on those networks reaches Natel directly. The CardDAV server then sees each client's own address instead of the proxy's (see below). Only list your proxies: an address listed here can claim to be any client. |
| `NATEL_ADMIN`           | `127.0.0.1:2019`      | Caddy's admin API, which reconfigures it without authentication and which the image's healthcheck reads. Set it to `"off"` when the container shares its network namespace (see below): only `"off"` turns it off; an empty value keeps it on at `localhost:2019`.                                                                                  |
| `NATEL_SESSION_ADDR`    | `127.0.0.1:2020`      | Where `natel-session`, which holds sign-in sessions, listens for Caddy. Change the port only when the container shares its network namespace and another service uses it (see below).                                                                                                                                                              |

The container runs as an unprivileged user, UID 10001. A new named volume on
`/data` needs nothing; a host directory mounted there must belong to that
user (`chown -R 10001:10001`).

### Password guessing

Natel adds no protection against password guessing: every sign-in attempt
goes to the CardDAV server, which accepts or refuses it. Use strong
passwords. For the server, or a fail2ban reading its logs, to block an
attacker, it needs the client's address. Behind a reverse proxy, set
`NATEL_TRUSTED_PROXIES`; then have the web server in front of Baïkal read
`X-Forwarded-For` from Natel, with nginx for example:

```nginx
set_real_ip_from 172.20.0.5;   # Natel
set_real_ip_from 172.20.0.2;   # the reverse proxy in front of Natel
real_ip_header X-Forwarded-For;
real_ip_recursive on;
```

List those two exact addresses (pin them in your Compose file, or give the
network a subnet only they share), never a whole range: any address
`set_real_ip_from` covers can claim to be any client, and so dodge a ban or
get someone else banned. With Apache, `RemoteIPHeader X-Forwarded-For` and one
`RemoteIPInternalProxy` line per address do the same.

### Finding your address books

Natel looks for the server's address books under `/.well-known/carddav`, then
at the root of `CARDDAV_URL`, then under `/dav.php/`. Baïkal at the root of its
domain is found without any setup. Baïkal under a path
(`https://example.com/baikal/html/`, with `CARDDAV_URL=https://example.com`)
needs the `.well-known` redirect on that origin, for example with nginx:

```nginx
location = /.well-known/carddav {
    return 301 /baikal/html/dav.php;
}
```

### Behind a reverse proxy

Natel listens on port 8080 in the container; the proxy terminates HTTPS and
forwards everything, the session cookie included. Set
`NATEL_TRUSTED_PROXIES` to the proxy's address: Natel then knows the browser
used HTTPS, and every session cookie is one a sibling subdomain can't
replace.

**Traefik**, with Docker labels. `websecure` and `letsencrypt` stand for the
entrypoint and certificate resolver of your Traefik configuration, and the
container must share a network with Traefik:

```yaml
services:
  natel:
    image: ghcr.io/kewindousse/natel:0.3.1
    environment:
      CARDDAV_URL: https://dav.example.com
      # Only Traefik reaches Natel, on their shared network: no port is published.
      NATEL_TRUSTED_PROXIES: private_ranges
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

### Host network, sidecars and pods

The admin API listens on the container's own `127.0.0.1`. With
`network_mode: host`, `network_mode: service:…` or `container:…` (a VPN or
Tailscale sidecar, say), or in a Kubernetes pod, that address is shared:
any user or process on the host, or any container sharing the namespace
(the sidecar, the pod's other containers), could reconfigure Caddy, for
example point `/dav` at a server of theirs and collect passwords. A port
2019 already in use, by another Caddy for instance, also keeps Natel from
starting.

`natel-session` listens on that shared `127.0.0.1` too, on port 2020. It
gives credentials only to Caddy, which holds a secret from it, but Caddy's
admin API can read that secret: one more reason to turn it off. A port 2020
already in use keeps Natel from starting: set `NATEL_SESSION_ADDR` to a
free port then.

In those setups, turn the API off, and the healthcheck with it, since it
reads the API and would then fail:

```yaml
services:
  natel:
    image: ghcr.io/kewindousse/natel:0.3.1
    network_mode: host
    environment:
      CARDDAV_URL: https://dav.example.com
      NATEL_ADMIN: "off"
    healthcheck:
      disable: true
```

On the host's network, Natel also listens in plain HTTP on port 8080 of
every interface, and no `ports:` mapping can keep it to `127.0.0.1`. With a
reverse proxy on the same machine, set `NATEL_BIND: 127.0.0.1` (see
[bare-metal.md](bare-metal.md)); otherwise, open 8080 in the
host's firewall to your proxy alone, which works here, unlike for a
published port.

Kubernetes doesn't run the image's healthcheck: `NATEL_ADMIN` alone is
enough there. A Docker network shared with a reverse proxy, as in the
Traefik example above, needs none of this.

### Without Docker

Natel is static files, a Caddyfile and a small Go binary, so it runs on any
machine with Caddy.
[bare-metal.md](bare-metal.md) covers the build, the settings, and
the defaults to change for it to stay safe.

## Updating

Read the target version's entry in the [changelog](../CHANGELOG.md),
including any port or volume changes.
Save open edits and [export](user-guide.md#import-and-export) the address
books you want to back up. For a complete backup, use your CardDAV
server's own backup procedure: Natel has no contact database of its own.

Change the image tag in your `compose.yaml` to the release you have chosen,
such as `ghcr.io/kewindousse/natel:0.3.1`. With the repository's root
`compose.yaml`, set it as `NATEL_IMAGE` in the `.env` file next to it
instead. Then run:

```sh
docker compose pull
docker compose up -d --no-build
```

The new container starts without sessions: reload Natel and sign in again.
Check that the selected book loads and try an edit on a made-up contact.
Display preferences stay in this browser.

To return to a previous image, restore its tag and run the same commands.
Check its release notes for compatibility with your deployment. Changing
the Natel image does not undo edits made on the CardDAV server; restore
those through that server's backup procedure if needed.

For a source build, check out the chosen revision and run
`docker compose up -d --build` with the root `compose.yaml`, leaving
`NATEL_IMAGE` unset. Without Docker, see
[bare-metal.md](bare-metal.md#update).
