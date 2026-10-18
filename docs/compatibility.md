# Compatibility

## CardDAV servers

| Server                               | Evidence                                                               | Limits                                                                                                                                |
| ------------------------------------ | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Baïkal                               | The end-to-end suite runs in CI; manual checks also use Baïkal 0.10.1. | Configure discovery for an installation under a path. Baïkal can serve a stored 4.0 card as 3.0; Natel saves the version it receives. |
| Radicale                             | The end-to-end suite runs locally and in CI.                           | No claim about every version or configuration.                                                                                        |
| Xandikos                             | The same end-to-end suite runs locally and in CI.                      | The test instance has no authentication; its password checks are not exercised.                                                       |
| Nextcloud and other RFC 6352 servers | Not in the compatibility suite.                                        | Compatibility is unverified; group formats can differ.                                                                                |

Natel authenticates with a CardDAV username and password. For a server that
requires it, use an application password. SSO and delegated authentication
are not implemented. The address books must already exist on the server.

## Synced clients

The manual Android checks use Google Contacts and DAVx⁵. Public fixtures
include cards exported by iCloud and written by DAVx⁵. They exercise photos,
custom labels, birthdays without a year and properties Natel does not edit.
Native iPhone and Mac photo checks, including WebP, remain to be completed:
iCloud export/import does not validate those applications.

## Groups

Clients store groups in two ways:

- Natel creates separate group cards, the form used by Apple Contacts,
  iCloud and DAVx⁵ in its default setup.
- Nextcloud's web app and DAVx⁵ in "groups are per-contact categories" mode
  store `CATEGORIES` on each contact. They do not show groups created in Natel.
  Natel reads their categories, and can remove a contact from them.

Natel reads both forms and writes new memberships as group cards. Test the
chosen grouping setup with your other clients before reorganising a book.

## Browsers and installed app

Automated browser tests use Chromium, with desktop and phone viewports.
They include accessibility checks in light and dark themes. Sign-in also
runs in Firefox, and sign-in, the list, editing and photos in WebKit,
Safari's engine. Phone emulation does not replace a test on a physical
phone, and Playwright's WebKit does not replace Safari itself. Use a current
browser and report issues with its version and device.

The app has an installable manifest. Installation depends on the browser's
support and normally requires HTTPS; it adds no offline mode. A session
lasts across reloads and browser restarts, up to 7 days, or 12 hours
without use.

## vCards and book size

Natel creates vCard 3.0 contacts and edits the version it reads, including
4.0. The UI covers a subset of fields. Other properties, parameters and
groups are retained; serialisation may normalise line folding, property
case and equivalent parameter forms. See the preservation tests in
[`tests/vcard/`](../tests/vcard/) and [decisions](DECISIONS.md).

The selected address book is loaded in full, including inline photos;
search then runs locally. This is intended for personal address books.
There is no published large-book benchmark or incremental synchronisation.
