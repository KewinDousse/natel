#!/bin/bash
# Starts a throwaway Xandikos for the e2e suite on the port given by the
# Playwright config. Xandikos leaves authentication to a proxy in front of
# it, so it takes any user; the current user's principal is set to the
# suite's. Storage lives in a fixed folder wiped at every start.
set -euo pipefail

: "${DAV_PORT:?}" "${E2E_USER:?}"

data="${TMPDIR:-/tmp}/natel-e2e-xandikos"
rm -rf "$data"
mkdir -p "$data/home"

# Xandikos commits every change with dulwich, which reads the user's git
# config: a signing setup there would fail every write.
export HOME="$data/home"

exec "${XANDIKOS_BIN:-xandikos}" serve \
  --directory "$data/collections" \
  --autocreate \
  --current-user-principal "/$E2E_USER/" \
  --listen-address 127.0.0.1 \
  --port "$DAV_PORT"
