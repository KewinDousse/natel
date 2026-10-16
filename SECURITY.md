# Security

## Reporting a vulnerability

Please report vulnerabilities privately, through
[GitHub's private reporting](https://github.com/KewinDousse/natel/security/advisories/new),
not in a public issue.

Useful reports include, for example: credentials leaving the browser other
than to the configured CardDAV server, a session cookie that opens another
user's session or outlives its sign-out, a way to make the proxy reach another
host, script injection through vCard content, or a save that loses data.

## Known scanner findings

Image scanners report vulnerabilities in the Go modules Caddy is built
with. Natel runs the official Caddy binary rather than its own build
(ADR 031 and ADR 033), and moves to each official release that ships the
fixes.

`natel-session` is built with the Go standard library only, which it links
statically: a Go standard library finding against `/usr/bin/natel-session`
is fixed by a rebuild on the Go release that ships the fix.

Findings in the Node build stage don't reach the published image, which only
receives the built static files from it.

## Supported versions

Fixes go into the latest release only.
