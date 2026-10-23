# Short iPhone recheck

Use a build containing ADR 039 and the photo-selection changes. Check its
commit identifier, not only the package version, and keep it with the
results. Use the dedicated test account and `NATEL iOS 24 octobre` book,
with an export saved before editing it. The 2026-10-23 evidence must remain
separate from this recheck.

Allow about seven minutes, including adding and removing the CardDAV
account. Keep Natel open on a computer and use a harmless object for photos.

## Direct camera capture

1. On the iPhone, sign in to Natel in Safari and select the test book. Open
   `NATEL 05 Safari`, choose **Edit → Change photo → Take photo**, photograph
   the object and accept it in the system camera.
2. Confirm that Natel shows **Crop photo**. Move the frame and change the
   zoom, then choose **Use photo → Save**. If the dialog never appears,
   record that fact and any visible message; do not count a photo-library
   retry as a successful camera test.
3. Reload the contact on the computer, reselecting the test book. Verify
   that the new crop is upright. Check the same photo in native Contacts
   after synchronisation. Repeat the camera selection once to check that
   a second choice still opens the crop dialog.

## Birthday without a year

1. In Natel, open `NATEL 01 Apple`. Its stored iOS-written birthday is
   14 July 1604 without `X-APPLE-OMIT-YEAR`. Verify that the new build shows
   **14 July** and that the edit form's year is empty.
2. Change the day to **15**, leave the year empty and save. Verify
   **15 July**, without a year, in both Natel and native Contacts.
3. In native Contacts, change only the note and save. Reload Natel and
   reselect the book. Confirm that the birthday still shows **15 July**,
   with an empty year in the form. Keep a fresh export for comparison.

## Finish

Record the iPhone model, exact iOS version, Natel build identifier and the
result of each case. Export the test book, then remove only the temporary
CardDAV account from the iPhone. Sign out of Natel in Safari and any
installed web app, and remove the test files after preserving the evidence.

This recheck does not validate macOS Contacts, iCloud as a server, every iOS
version, or importing a `.vcf` through Safari's file picker.
