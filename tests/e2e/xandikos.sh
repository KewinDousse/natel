#!/bin/bash
# Starts a throwaway Xandikos for the e2e suite behind the Caddy site of
# xandikos.Caddyfile, in the image Natel itself is built from, on the port and
# with the one user given by the Playwright config. Storage lives in a fixed
# folder wiped at every start.
set -euo pipefail

: "${DAV_PORT:?}" "${E2E_USER:?}" "${E2E_PASSWORD:?}"

root="$(cd "$(dirname "$0")/../.." && pwd)"
image="$(sed -n 's/^FROM \(caddy:[^ ]*\) AS caddy$/\1/p' "$root/Dockerfile")"
name="natel-e2e-xandikos-caddy"
data="${TMPDIR:-/tmp}/natel-e2e-xandikos"
socket="$data/run/xandikos.sock"

docker rm -f "$name" >/dev/null 2>&1 || true
rm -rf "$data"
mkdir -p "$data/home" "$data/run"

# Xandikos commits every change with dulwich, which reads the user's git
# config: a signing setup there would fail every write.
HOME="$data/home" "${XANDIKOS_BIN:-xandikos}" serve \
  --directory "$data/collections" \
  --autocreate \
  --current-user-principal "/$E2E_USER/" \
  --listen-address "$socket" &
xandikos=$!
trap 'kill "$xandikos" 2>/dev/null || true' EXIT

# Caddy answers 401 before reaching its upstream, so Playwright can't tell
# whether Xandikos is up.
until [ -S "$socket" ]; do
  kill -0 "$xandikos"
  sleep 0.1
done

hash="$(docker run --rm "$image" caddy hash-password --plaintext "$E2E_PASSWORD")"

# Without exec, so the trap above stops Xandikos when the container ends.
docker run --rm --name "$name" \
  -p "127.0.0.1:$DAV_PORT:8080" \
  -e XANDIKOS_SITE=:8080 \
  -e XANDIKOS_USER="$E2E_USER" \
  -e XANDIKOS_PASSWORD_HASH="$hash" \
  -e XANDIKOS_UPSTREAM=unix//run/xandikos/xandikos.sock \
  -v "$root/tests/e2e/xandikos.Caddyfile:/etc/caddy/Caddyfile:ro" \
  -v "$data/run:/run/xandikos" \
  "$image"
