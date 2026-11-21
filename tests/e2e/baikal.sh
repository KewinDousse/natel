#!/bin/bash
# Starts a throwaway Baïkal for the e2e suite from the image baikal/ builds,
# on the port and with the one user given by the Playwright config. The
# install wizard is skipped: the config and a database holding the user are
# written beforehand. Storage lives in a fixed folder wiped at every start.
# The one argument is Baïkal's WebDAV authentication type, Basic when left
# out.
set -euo pipefail

: "${DAV_PORT:?}" "${E2E_USER:?}" "${E2E_PASSWORD:?}"

auth="${1:-Basic}"
name="natel-e2e-baikal"
data="${TMPDIR:-/tmp}/natel-e2e-baikal"

docker build -q -t "$name" "$(dirname "$0")/baikal" >/dev/null
# Baïkal runs its upgrade wizard unless the config names its own version.
version=$(docker image inspect -f \
  '{{index .Config.Labels "org.opencontainers.image.version"}}' "$name")
if [[ ! $version =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "baikal.sh: no Baïkal version in the image label (got '$version')" >&2
  exit 1
fi
docker rm -f "$name" >/dev/null 2>&1 || true
rm -rf "$data"
mkdir -p "$data/config" "$data/db"

# Baïkal checks both Basic and Digest credentials against
# md5(user:realm:password). The
# admin password is never used, but without one Baïkal runs its installer.
md5() { printf '%s:BaikalDAV:%s' "$1" "$2" | md5sum | cut -d' ' -f1; }
digest=$(md5 "$E2E_USER" "$E2E_PASSWORD")
admin=$(md5 admin "$E2E_PASSWORD")

cat > "$data/config/baikal.yaml" <<YAML
system:
  configured_version: '$version'
  timezone: 'UTC'
  card_enabled: true
  cal_enabled: false
  invite_from: ''
  dav_auth_type: '$auth'
  admin_passwordhash: '$admin'
  failed_access_message: 'user %u authentication failure for Baikal'
  auth_realm: 'BaikalDAV'
  base_uri: ''
database:
  sqlite_file: '/var/www/baikal/Specific/db/db.sqlite'
  backend: 'sqlite'
  encryption_key: 'natel-e2e'
YAML

# As the calling user, so the files it writes stay theirs to change.
docker run --rm --user "$(id -u):$(id -g)" -v "$data/db:/db" \
  -e E2E_USER -e DIGEST="$digest" "$name" php -r '
  $db = new PDO("sqlite:/db/db.sqlite");
  $db->exec(file_get_contents("/var/www/baikal/Core/Resources/Db/SQLite/db.sql"));
  $user = getenv("E2E_USER");
  $db->prepare("INSERT INTO users (username, digesta1) VALUES (?, ?)")
    ->execute([$user, getenv("DIGEST")]);
  $db->prepare("INSERT INTO principals (uri, email, displayname) VALUES (?, ?, ?)")
    ->execute(["principals/$user", "$user@example.org", $user]);
'
# The container's web server runs as another user; this keeps the files
# writable for it and removable for the next run, without a chown.
chmod -R a+rwX "$data"

# In the foreground, so the Playwright config's SIGTERM stops (and --rm
# removes) the container.
exec docker run --rm --name "$name" \
  -p "127.0.0.1:$DAV_PORT:80" \
  -v "$data/config:/var/www/baikal/config" \
  -v "$data/db:/var/www/baikal/Specific/db" \
  "$name"
