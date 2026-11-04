# Nextcloud compatibility tests

Run the shared end-to-end suite with Docker available:

```sh
E2E_SERVER=nextcloud pnpm e2e
```

The launcher uses the official Nextcloud 35.0.2 Apache image, pinned by digest,
with SQLite and the suite's synthetic user. The CardDAV backend is part of
Nextcloud itself; the Contacts web app is not needed. Storage is disposable
and only the loopback test port is published. Playwright stops and removes the
container when the suite ends.

The startup hook disables brute-force throttling and reduces password hashing
costs for the synthetic credentials, so repeated authentication tests do not
throttle each other. It also hides the system address book and disables the
Contacts Interaction app, leaving only the books created by the suite. These settings apply only to the test container.

The same suite runs in the CI compatibility matrix. It covers the configured
version with username/password authentication, not every Nextcloud version,
shared address book or authentication configuration. Nextcloud serves the suite’s
vCard 4.0 fixture as 3.0; photo tests verify that version and its base64 encoding. Group cards written by
Natel are distinct from the categories used by Nextcloud's Contacts web app;
see [group compatibility](../compatibility.md#groups).

## SQLite request handling

The test container uses one Apache worker so concurrent CardDAV requests cannot
compete for SQLite write locks. Keep-alive is disabled so idle connections cannot
hold that worker. The conflict tests still exercise stale ETags and verify the
server rejects conditional writes made against those versions.
