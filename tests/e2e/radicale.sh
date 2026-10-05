#!/bin/bash
# Starts a throwaway Radicale for the e2e suite, with the port and the one
# user given by the Playwright config. Storage lives in a fixed folder wiped
# at every start: the exec below leaves no shell behind to clean up on exit.
set -euo pipefail

: "${DAV_PORT:?}" "${E2E_USER:?}" "${E2E_PASSWORD:?}"

data="${TMPDIR:-/tmp}/natel-e2e-radicale"
rm -rf "$data"
mkdir -p "$data"
printf '%s:%s\n' "$E2E_USER" "$E2E_PASSWORD" > "$data/users"
# Headers of its own, as a web server in front of Baïkal can send: the
# Caddyfile's /dav proxy must neither pass them on nor let them add to its
# own. Vite's drops only Server and X-Powered-By.
cat > "$data/config" <<'CONFIG'
[headers]
Content-Security-Policy = default-src *
Referrer-Policy = unsafe-url
X-Content-Type-Options = nosniff
X-Powered-By = PHP/8.4.0
CONFIG

exec "${RADICALE_BIN:-radicale}" \
  --config "$data/config" \
  --server-hosts "127.0.0.1:$DAV_PORT" \
  --auth-type htpasswd \
  --auth-htpasswd-filename "$data/users" \
  --auth-htpasswd-encryption plain \
  --rights-type owner_only \
  --storage-filesystem-folder "$data/collections" \
  --logging-level warning
