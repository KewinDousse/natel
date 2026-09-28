#!/bin/bash
# Starts a throwaway Radicale for the e2e suite, with the port and the one
# user given by the Playwright config. Storage lives in a fixed folder wiped
# at every start: the exec below leaves no shell behind to clean up on exit.
set -euo pipefail

: "${RADICALE_PORT:?}" "${E2E_USER:?}" "${E2E_PASSWORD:?}"

data="${TMPDIR:-/tmp}/natel-e2e-radicale"
rm -rf "$data"
mkdir -p "$data"
printf '%s:%s\n' "$E2E_USER" "$E2E_PASSWORD" > "$data/users"

exec "${RADICALE_BIN:-radicale}" \
  --server-hosts "127.0.0.1:$RADICALE_PORT" \
  --auth-type htpasswd \
  --auth-htpasswd-filename "$data/users" \
  --auth-htpasswd-encryption plain \
  --rights-type owner_only \
  --storage-filesystem-folder "$data/collections" \
  --logging-level warning
