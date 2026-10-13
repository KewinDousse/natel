# Troubleshooting and help

## Sign-in and address books

Use your CardDAV credentials, not a Natel account. If the server uses
application passwords, create one there. Natel has no password reset.

If the server cannot be reached, check `BAIKAL_URL`: it is an origin,
`scheme://host[:port]`, without a path, and must be reachable from inside
the Natel container. `localhost` inside that container refers to the
container itself. Check that your reverse proxy forwards `Authorization`
and all requests, including `/dav/`.

If a Baïkal installation is under a path, configure its
[`.well-known/carddav` redirect](deployment.md#finding-your-address-books).
Address books are created on the CardDAV server, not in Natel.

## Missing or stale contacts

Select the expected address book and clear the search and group filter.
If a sync warning appears, open it and retry; a rejected session asks you
to sign in again. A reload asks for credentials again and fetches the book.

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

## Get help or report a bug

Use [Discussions](https://github.com/KewinDousse/natel/discussions) for setup
questions and [the bug form](https://github.com/KewinDousse/natel/issues/new/choose)
for a reproducible problem. Include the image tag or source commit, server
name/version, browser/device, expected result and what happened.

Remove credentials, real contacts and private server addresses from logs
and screenshots. Use synthetic data for vCard examples. Report a suspected
vulnerability through [SECURITY.md](../SECURITY.md), privately.
