# Compatibility

The summary comes first; each section below gives the claims behind it, with
their evidence.

## At a glance

✅ checked · ✅¹ checked, see the note below the table · ◐ partly checked ·
⬜ not checked · – not applicable

**Servers**

| Server                               | Status | Limit                               |
| ------------------------------------ | :----: | ----------------------------------- |
| Baïkal                               |   ✅   | Discovery to configure under a path |
| Radicale                             |   ✅   | Not every version or configuration  |
| Xandikos                             |   ◐    | Tested without authentication       |
| Nextcloud and other RFC 6352 servers |   ⬜   |                                     |

**Synced clients**

| Feature                      | Android (DAVx⁵) | iPhone | Mac |
| ---------------------------- | :-------------: | :----: | :-: |
| Photos                       |       ✅        |  ✅¹   | ⬜  |
| Photo from Safari, cropped   |        –        |   ✅   | ⬜  |
| Birthday without a year      |       ⬜        |   ✅   | ⬜  |
| Custom address label         |       ✅        |   ✅   | ⬜  |
| Notes                        |       ⬜        |   ✅   | ⬜  |
| Groups                       |      ✅²        |   ✅   | ⬜  |
| Deletion and conflicts       |       ⬜        |   ✅   | ⬜  |
| `.vcf` import from Safari    |        –        |   ⬜   | ⬜  |

¹ iPhone photos: in both checks, the cards iOS wrote back held a JPEG, and
an animated GIF showed still.

² Android groups: DAVx⁵ in categories mode doesn't show Natel's groups.

**Browsers**

| Browser               | Status | Limit                                       |
| --------------------- | :----: | ------------------------------------------- |
| Chromium              |   ✅   |                                             |
| Safari on iPhone      |   ✅   |                                             |
| WebKit (Playwright)   |   ◐    | Sign-in, list, editing and photos only      |
| Firefox               |   ◐    | Sign-in only                                |

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

Each claim below names the [device check](device-checks/) that supports
it. Public fixtures include cards exported by iCloud and written by DAVx⁵.
They exercise photos, custom labels, birthdays without a year and
properties Natel does not edit.

### Android: DAVx⁵ and Google Contacts

- Photos set in Natel display (ADR 023).
- A custom address label round-trips: Natel's shows in Google Contacts,
  and a rename there shows in Natel
  ([2026-10-29](device-checks/2026-10-29-android.md)).

### iPhone: Contacts and Safari

Checked on an iPhone SE with iOS 26.6.1.

- JPEG, PNG and WebP photos display
  ([2026-10-23](device-checks/2026-10-23-iphone.md)), and so do GIF and
  EXIF-oriented portrait JPEG photos, upright
  ([2026-10-29](device-checks/2026-10-29-iphone.md)). The cards iOS wrote
  back held a JPEG in place of the PNG and WebP photos (2026-10-23) and of
  the GIF, an animated one showing still in Contacts (2026-10-29).
- In Safari, a photo from the library opened the crop dialog with Natel
  0.3.1 ([2026-10-23](device-checks/2026-10-23-iphone.md)), and so does one
  taken with the camera from Natel 0.4.1
  ([2026-10-29](device-checks/2026-10-29-iphone.md)). Automated WebKit
  tests do not cover that native picker.
- iOS writes a birthday without a year as 1604 without
  `X-APPLE-OMIT-YEAR`. Natel reads that 1604 as no year only on complete
  dates in iOS-produced vCard 3.0 cards, and unrelated edits leave the
  stored birthday alone (ADR 039). An edit in Natel then in Contacts kept
  it yearless ([2026-10-29](device-checks/2026-10-29-iphone.md)).
- A custom address label round-trips between Natel and Contacts
  ([2026-10-29](device-checks/2026-10-29-iphone.md)).
- Notes sync in both directions, and a note edited alone in Natel kept the
  other fields and the Apple photo's bytes. Group membership, deletion,
  conflict handling and installation from Safari were checked
  ([2026-10-23](device-checks/2026-10-23-iphone.md)).

Not checked: importing a `.vcf` through Safari's file picker, other iOS
versions, and iCloud as the server.

### Mac

Native Mac photo checks, including WebP, remain to be completed: iCloud
export/import does not validate those applications.

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
