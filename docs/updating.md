# Updating Natel

## Before an update

Read the target version's entry in the [changelog](../CHANGELOG.md),
including any port or volume changes.
Save open edits and export the address books you want to back up. For a
complete backup, use your CardDAV server's own backup procedure: Natel has
no contact database of its own.

## Docker Compose

Change the image tag in your `compose.yaml` to the release you have chosen,
such as `ghcr.io/kewindousse/natel:0.3.0`. With the repository's root
`compose.yaml`, set it as `NATEL_IMAGE` in the `.env` file next to it
instead. Then run:

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

For a source build, check out the chosen revision and run
`docker compose up -d --build` with the root `compose.yaml`, leaving
`NATEL_IMAGE` unset.

## Without Docker

Build the selected release, replace the served static files, and update the
Caddyfile when its release notes require it. Restart Caddy and reload the
app. See the [bare-metal guide](bare-metal.md#update) for paths and settings.
