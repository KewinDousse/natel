# Compatibility

## CardDAV servers

| Server                               | Evidence                                                               | Limits                                                                                                                                |
| ------------------------------------ | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Baïkal                               | The end-to-end suite runs in CI; manual checks also use Baïkal 0.10.1. | Configure discovery for an installation under a path. Baïkal can serve a stored 4.0 card as 3.0; Natel saves the version it receives. |
| Radicale                             | The end-to-end suite runs locally and in CI.                           | No claim about every version or configuration.                                                                                        |
| Xandikos                             | The same end-to-end suite runs locally and in CI.                      | The test instance has no authentication; its password checks are not exercised.                                                       |
| Nextcloud and other RFC 6352 servers | Not in the compatibility suite.                                        | Compatibility is unverified; group formats can differ.                                                                                |

Natel authenticates with a CardDAV
[username and password](user-guide.md#sign-in-and-sign-out); SSO and
delegated authentication are not implemented. The address books must already exist
on the server; [deployment](deployment.md#finding-your-address-books) shows
how to configure Baïkal's discovery.

## Synced clients

The manual Android checks use Google Contacts and DAVx⁵. Public fixtures
include cards exported by iCloud and written by DAVx⁵. They exercise photos,
custom labels, birthdays without a year and properties Natel does not edit.
Native Mac photo checks, including WebP, remain to be completed:
iCloud export/import does not validate those applications.

### iPhone SE with iOS 26.6.1

A manual check on 2026-10-23 used Natel 0.3.1 with Radicale 3.8.3. Native
Contacts displayed the JPEG, PNG and WebP test photos. Notes synced in both
directions; group membership, deletion, conflict handling and installation
from Safari were checked. Choosing a photo from the photo library, cropping
it in Safari and reading it back in Contacts worked. Importing a `.vcf`
through Safari's file picker was not tested.

Taking a new photo directly from Safari returned to the form without a crop
dialog or preview. The photo-file handling changes need another check on a
physical iPhone; automated WebKit tests do not validate that native picker.
The [short iPhone recheck](ios-device-recheck.md) covers that path and the
birthday after the changes.

The iOS-written card also omitted `X-APPLE-OMIT-YEAR` from a birthday whose
stored year was 1604. The exports isolate that omission before the next
Natel save. Natel recognizes this unmarked 1604 only on complete dates
in iOS-produced vCard 3.0 cards (ADR 039); unrelated edits leave the stored
birthday alone. The isolated note edit in Natel retained the other fields and
the Apple photo's bytes. Later iOS-written cards held JPEGs in place of
their PNG and WebP photos, so the check does not establish that their bytes
survive every client write.

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
support and normally requires HTTPS; it adds no offline mode.

## vCards and book size

Natel creates vCard 3.0 contacts and edits the version it reads, including
4.0. The UI covers a subset of fields. Other properties, parameters and
groups are retained; serialisation may normalise line folding, property
case and equivalent parameter forms. See the preservation tests in
[`tests/vcard/`](../tests/vcard/) and [decisions](DECISIONS.md).

The selected address book is loaded in full, including inline photos;
search then runs locally. This is intended for personal address books.
There is no published large-book benchmark or incremental synchronisation.
