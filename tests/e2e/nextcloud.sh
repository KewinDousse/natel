#!/bin/bash
# SQLite keeps this disposable CardDAV instance independent of a database service.
set -euo pipefail

: "${DAV_PORT:?}" "${E2E_USER:?}" "${E2E_PASSWORD:?}"

image="nextcloud:35.0.2-apache@sha256:e0b1a2af52c82c07b7a0e8e59878bd8769e704447734d5d238a836982f51b9c8"
name="natel-e2e-nextcloud"
hooks="$(cd "$(dirname "$0")/nextcloud" && pwd)"

docker rm -f "$name" >/dev/null 2>&1 || true
exec docker run --rm --name "$name" \
  -p "127.0.0.1:$DAV_PORT:80" \
  -e NEXTCLOUD_ADMIN_USER="$E2E_USER" \
  -e NEXTCLOUD_ADMIN_PASSWORD="$E2E_PASSWORD" \
  -e NEXTCLOUD_TRUSTED_DOMAINS=127.0.0.1 \
  -e SQLITE_DATABASE=natel-e2e \
  -v "$hooks:/docker-entrypoint-hooks.d/before-starting:ro" \
  -v "$hooks/apache.conf:/etc/apache2/conf-enabled/zz-natel-e2e.conf:ro" \
  "$image"
