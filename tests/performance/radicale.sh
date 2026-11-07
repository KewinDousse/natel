#!/bin/bash
set -euo pipefail

# Keep benchmark storage separate from the compatibility suite and other runs.
data="$(mktemp -d "${TMPDIR:-/tmp}/natel-performance.XXXXXX")"
trap 'rm -rf "$data"' EXIT
TMPDIR="$data" bash tests/e2e/radicale.sh &
server=$!
trap 'kill "$server" 2>/dev/null || true; wait "$server" || true' TERM INT
wait "$server"
