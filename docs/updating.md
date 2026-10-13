# Updating Natel

## Before an update

Read the target version's [release notes](https://github.com/KewinDousse/natel/releases)
and [changelog](../CHANGELOG.md), including any port or volume changes.
Save open edits and export the address books you want to back up. For a
complete backup, use your CardDAV server's own backup procedure: Natel has
no contact database of its own.

## Docker Compose

The root `compose.yaml` builds the current source by default. For a source
update, check out the chosen source revision and run `docker compose up -d --build`. Leave `NATEL_IMAGE` unset for those local builds.

To use a release containing the current port/UID changes, set its explicit
image tag in the `.env` file next to `compose.yaml`:

```dotenv
NATEL_IMAGE=ghcr.io/kewindousse/natel:X.Y.Z
```

Replace `X.Y.Z` with the published tag you have chosen. The existing `0.2.0`
image needs port 80 and the [separate installation example](deployment.md#published-images). Change that value for
an update, then run:

```sh
docker compose pull
docker compose up -d --no-build
```

The new container starts without sessions: reload Natel and sign in again.
Check that the selected book loads and try an edit on a made-up contact.
Display preferences stay in this browser.

To return to a previous image, restore its tag and run the same commands.
Check its release notes for compatibility with your deployment. Changing
the Natel image does not undo edits made on the CardDAV server; restore
those through that server's backup procedure if needed.

## Unreleased deployment changes

The current source includes deployment changes that are not in `0.2.0`.
When upgrading to a release that includes them:

- Publish the container's port **8080** for HTTP and **8443** for HTTPS,
  and point your reverse proxy at 8080.
- The image runs as UID/GID **10001**. A new `/data` named volume is ready
  to use. An existing one needs its ownership updated once, with the Natel
  container stopped. Replace `YOUR_NATEL_DATA_VOLUME` below with that volume:

  ```sh
  docker run --rm -v YOUR_NATEL_DATA_VOLUME:/data alpine chown -R 10001:10001 /data
  ```

Do not run the ownership command against a volume belonging to another
service. For a host directory, change ownership of that directory instead.

## Without Docker

Build the selected release, replace the served static files, and update the
Caddyfile when its release notes require it. Restart Caddy and reload the
app. See the [bare-metal guide](bare-metal.md#update) for paths and settings.
