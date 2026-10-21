# Using Natel

## Sign in and sign out

Use the credentials of the CardDAV server configured by the person running
Natel. There is no Natel registration or password reset. If your server
requires an application password, use it here.

You stay signed in on this browser, across reloads and browser restarts,
until you sign out, for 7 days at most, or 12 hours without using Natel.
Restarting Natel on its server signs everyone out. Your password stays on
the server running Natel, in memory, never in your browser. On a shared
computer, use **Settings → Sign out** before leaving.
A password manager can fill the sign-in form for you.

## Find a contact

Choose an address book from the menu next to Natel's name. Search matches
names, phone numbers, email addresses and organisations. Use the A–Z index
when no search is active; on a touch screen, slide along it to browse.
A group filter appears when the book contains groups.
On a contact's page, choose an address to look it up on a map: by
default Apple Maps on Apple devices, your maps app on Android, and
OpenStreetMap elsewhere. Settings also let you choose the map, the
language, theme and sort order.

## Edit, create, move or delete

Open a contact, then choose **Edit**. Changes are sent when you choose
**Save**, not while you type. **Cancel** discards the draft after confirmation
when it has changed. Fields Natel does not display are preserved on save;
vCard formatting can be normalised.

A contact can have several addresses. Each one can take an extended line
(c/o, building) and, from its type menu, a label of your own, such as
"Chalet", saved the way Apple Contacts and DAVx⁵ save theirs.

Use **New contact** to create a card in the selected book. In edit mode,
**Move to another address book** moves the card between existing books.
**Delete contact** removes it from the server and therefore from your other
synced devices. Export a backup before a large reorganisation.

## Photos

In edit mode, choose **Change photo**, select an image and crop it or keep
the whole image. **Remove photo** removes it when the contact is saved.
Large photos are reduced, hidden metadata is removed, and formats or
orientations that need conversion are prepared for synced clients.
Existing photos are left alone when you edit other fields.

A server or reverse proxy can reject a card for its size. If saving fails,
the draft stays open. See [troubleshooting](troubleshooting.md#photos-and-large-cards).

## Groups

On a contact's page, choose one of its groups to show only that group's
contacts in the list.

Use the groups section in edit mode to add or remove a membership. Natel
reads group cards and per-contact categories, but creates group-card
memberships. Read [compatibility](compatibility.md#groups) if you also use
Nextcloud or DAVx⁵ in categories mode.

## Import and export

Open the address-book menu and choose **Export** to download the whole
selected book as a `.vcf` file. Exports can contain personal data; store them
somewhere private. Natel reports an incomplete fetch rather than producing
an incomplete export.

**Import a .vcf file…** imports into the selected book. Cards with a UID
already in that book are skipped, not merged or replaced. The result shows
imported, skipped and failed cards. An import with failures is not rolled
back; check the result before importing again. This is not duplicate
detection by name, email or phone number.

## Concurrent edits

If a phone or another client changed a contact after Natel read it, saving
shows a conflict. **Reload** takes the current server version and discards
your draft. **Overwrite with my version** reads the current card, then
applies only the fields you changed, with another conditional write.
It can report another conflict if the card changes again.

A conflict while deleting offers a reload so you can inspect the contact
before deciding to delete it again.

## Keyboard and installation

On a desktop, press **?** to see keyboard shortcuts. **/** focuses search,
**N** creates a contact, and **Ctrl/⌘+Enter** saves an edit.

To install Natel, use the browser's install command or **Add to Home Screen**
where available. The installed app still needs network access and follows
the same session rules as a browser tab.
