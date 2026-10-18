# Troubleshooting and help

## Sign-in and address books

Use your CardDAV credentials, not a Natel account. If the server uses
application passwords, create one there. Natel has no password reset.

If the server cannot be reached, check `BAIKAL_URL`: it is an origin,
`scheme://host[:port]`, without a path, and must be reachable from inside
the Natel container. `localhost` inside that container refers to the
container itself. Check that your reverse proxy forwards the session cookie
and all requests, including `/session` and `/dav/`.

If every user is told the session expired, and signing in again reports
wrong credentials, Caddy lost the secret it shares with `natel-session`:
`natel-session` logs "credentials refused: the request doesn't carry
Caddy's secret". That follows a `caddy reload` run outside the container's
own processes. Restart Natel.

If a Baïkal installation is under a path, configure its
[`.well-known/carddav` redirect](deployment.md#finding-your-address-books).
Address books are created on the CardDAV server, not in Natel.

## Missing or stale contacts

Select the expected address book and clear the search and group filter.
If a sync warning appears, open it and retry; a rejected session asks you
to sign in again. A session ends after 12 hours without use, 7 days after
sign-in, or when the container restarts. A reload keeps the session and
fetches the book.

A card that cannot be fetched or parsed is not displayed, but Natel does
not delete it. Compare with another client or inspect it on your CardDAV
server. If you report the problem, supply a made-up card that reproduces it.

## Photos and large cards

The CardDAV server or a reverse proxy may impose a request-size limit.
Natel reduces large photo uploads, but another property or existing photo
can still make a card too large. Check the limits at each proxy and on the
server. Do not assume that a network failure means a size rejection.

Photo display also depends on the synced client; see
[compatibility](compatibility.md#synced-clients).

## Container logs

Follow the container's logs with:

```sh
docker compose logs -f --tail=100 natel
```

Caddy writes JSON logs to standard output at the `INFO` level: startup,
warnings and errors, plus access logs for `/dav/` requests. Access logs
include the HTTP method, status and duration in seconds. Static file
requests and the container's healthcheck do not produce access logs.

A `401` means authentication was rejected; a `412` means a conditional
write conflicted with the server's version. A `502` can indicate that the
proxy cannot reach the CardDAV server or received an invalid response.
Check `BAIKAL_URL`, connectivity from the container and the CardDAV
server's own logs.
A `207` is a normal WebDAV multi-status response; individual results
inside its body may still report failures.

Request URLs, headers, client addresses and TLS details, response headers
and authenticated user IDs are omitted from access logs. Request and
response bodies are not logged. Caddy's detailed HTTP error and reverse
proxy messages are suppressed because they can quote private data from
malformed responses; HTTP error statuses remain in access logs.
Runtime diagnostics can contain configured server addresses; review logs
before sharing them.

The supplied `compose.yaml` uses Docker's `local` logging driver with three
files of 10 MB each, rotated and compressed by Docker. Applying this setting
to an existing container requires recreating it with `docker compose up -d`.
If you use another deployment configuration, configure rotation there too.

Browser errors, including vCard parsing warnings, stay in the browser's
developer console. They do not appear in the container logs.

### Interrupted responses

If an upstream response is interrupted after its headers have been sent,
the access log can retain a successful status, such as `200`, and report a
zero duration. A successful status alone does not prove that the browser
received the complete response; check the browser and the CardDAV server
when diagnosing an interrupted transfer.

## Report a bug

Use [the bug form](https://github.com/KewinDousse/natel/issues/new/choose) for a
reproducible problem. Include the image tag or source commit, server
name/version, browser/device, expected result and what happened.

Remove credentials, real contacts and private server addresses from logs
and screenshots. Use synthetic data for vCard examples. Report a suspected
vulnerability through [SECURITY.md](../SECURITY.md), privately.
