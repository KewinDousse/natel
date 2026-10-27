# Natel — Design system ("Annuaire" direction)

This document is the source of truth for how Natel's UI looks and behaves: the
rules, the layout, and the choices a reader can't guess from the code. Exact
class sets live in the components and in `src/components/ui/`, exact wording
in `src/i18n/`. The reference HTML files in
`natel-design/`, a local untracked handoff, are visual references only; when
they disagree with this document, this document wins.

## Files

| File | Role |
|---|---|
| `src/index.css` | Tailwind v4 + shadcn tokens, fonts via Fontsource, base layer, `leader` utility |
| `src/components/ui/` | The shared controls, which [ARCHITECTURE.md](ARCHITECTURE.md#source-layout) lists. Button and field recipes are class helpers, and icons have a 2px stroke. Build controls from these rather than repeating classes, and restyle a vendored shadcn primitive with them rather than keeping its defaults |
| `natel-design/natel-annuaire-*.html` | Visual references: identity (palette, type, shapes, motion), sign-in, list and contact page. The contact page's edit mode there is superseded by "Contact page" below |

From the reference files, copy only class names on elements; never their
`<style>` block, inline scripts, placeholder portraits or "Prototype" panel.
Fonts come from Fontsource: no CDN, no Google Fonts URL, no remote images.

## Core rules

1. **Directory grammar.** A contact row reads like a phone directory entry: the part the list sorts by in bold, the other after it, dotted leader, primary phone number right-aligned. The default sort is by first name (**Given** Family, ADR 026); by last name the row reads like a Swiss phone book, **Family** Given.
2. **Red (`brand`) marks position, never action.** Allowed: wordmark, A–Z group letters, the 3px selection bar, the sign-in panel. Forbidden: buttons, links, error states, icons meaning "delete".
3. **Primary action = ink pill.** Destructive actions use `destructive`, always with an icon and a text label.
4. **Two typefaces, strict roles.** `font-display` (Big Shoulders 700) for the wordmark, the A–Z letters (group letters and rail), screen, state and dialog titles, and avatar initials; never for running text or labels. Everything else is `font-sans` (Work Sans 400/700, and 500 for the second part of a list name).
5. **Numbers are tabular.** Phone numbers, dates, counts.
6. **Nothing that sits on the page has a shadow.** Only floating layers: `shadow-float` (menus, popovers, toasts), `shadow-overlay` (dialogs, mobile sheets).
7. **Photos are rounded squares, not circles.** No photo → initials in the display face, in the order the list sorts by (Aline Dessendre → "AD", by last name "DA"), on one of six tints drawn from the card's UID, so a person keeps theirs on every device, while the name is typed, and after a rename. The tints have no red or pink (marks and selection use them) and one lightness, so none stands out. An organisation-only card shows a building icon on the neutral avatar.

## Type scale

Sizes are tokens in `src/index.css` (`--text-*`), used as `text-<name>`; `cn` knows them, so a size never knocks out a colour class.

| Token | Size / line height | Use |
|---|---|---|
| `caption` | 12 / 16px | Counts, hints, kbd |
| `small` | 13 / 18px | A–Z rail, sign-in tabs |
| `body` | 15 / 24px | Running text from `lg` (16px below, so iOS doesn't zoom) |
| `name` | 17 / 24px | Names in the list, the page's main information |
| `wordmark` | 32px / 1 | "Natel" in the header |
| `title-sm` | 36px / 1 | Group letters; screen titles on phones |
| `title` | 44px / 0.95 | Screen titles from `sm` |
| `person` | 56px / 0.95 | Screen titles from `lg` |

Tailwind's own sizes, `text-sm` (14px) to `text-5xl`, cover the rest, apart from the sign-in's giant wordmark.

The list's hierarchy follows what people look for: the name first, then its number, then the photo and the letter that help find it. The group letters mark the position without outweighing the names.

## Layout

**Desktop (`lg`, ≥ 1024px):** full-height grid. Header bar, then the list pane (own scroll) beside the detail pane on `bg-muted` (own scroll, content at most `44rem` wide).

**Mobile (< 1024px):** page scroll. Sticky header: wordmark, address-book switcher, settings and the round "+" on one row down to 320px, then the search. No detail pane: opening a contact is a separate route.

Sticky offsets use `--header-h`, never hardcoded pixels.

## Components

### Header
- Wordmark: live text, in ink in the app header (red only on the sign-in panel and the identity page).
- Address-book switcher: a pill with a chevron. On phones it takes the room the actions leave and truncates the book's name, which the menu shows in full.
- Book menu, below the books (ADR 020): export the selected book as `<name>.vcf` (disabled, still focusable, while the book shows no contact) and import a `.vcf` file.
- Import dialog: shows progress while cards are sent and can't be dismissed meanwhile; then the counts (imported, already in the book, failed) and each failed card with its reason. The list behind fills in as contacts are created.
- Search: `/` focuses it, `Esc` clears it; a `/` hint on desktop while empty, a clear button while not.
- Settings: a gear link, always present, even with no address book. Signing out lives in the settings, so the bar keeps its room for the book's name. Being a link, it gets the discard dialog first when an edit is unsaved. It carries the dot of Update notifications.
- Sync warning, only when the contacts shown couldn't be reloaded: an alert button before the settings link, in `text-warning`, its label from `xl`. Its panel says when the last sync worked and offers to retry, or, when the server refused the session, to sign in again. A reload that works closes it and confirms in a toast. Nothing shows while sync works; a book that never loaded shows the list's failed state instead.
- New contact: a round ink "+" link, a labelled pill from `lg`, once the server has an address book.

### Group (letter section)
A two-column grid: the letter, sticky under the header, then the section's rows. The letter sits centred on its section's first row, never above it.

### Contact row
- The name puts the part the list sorts by first, in bold, the other in medium weight so it stays legible; the full name is in `title`. A card with neither a name nor an organisation shows "Unnamed contact" in muted italic (the muted grey keeps 4.5:1; transparency wouldn't), on its page too.
- From `sm`, a dotted leader runs to the trailing value. On phones the value drops under the name and the leader hides: single-line rows truncate names too much there.
- Trailing value priority: first `TEL` with `TYPE=cell` → first `TEL` → first `EMAIL` → `ORG`. A phone number is in ink from `sm` (muted under the name on phones), the others muted.
- The current contact takes the selection background and the red selection bar.

### A–Z rail
Right edge, all 26 letters; absent letters are greyed, hidden from screen readers and out of the tab order. Jumps are instant. Hidden while a search is active. Contacts whose initial isn't A–Z go into a "#" group at the end of the list, which the rail doesn't show, so it keeps its 26 plain letters.
- Touch: sliding a finger along the rail follows the letter under it, as native contact apps do; an absent letter lands on the next present one (or the last one before it). The page doesn't scroll meanwhile.
- From `lg`, the rail sits outside the list's scrolling pane, so the whole scrollbar stays clickable.

### List toolbar
The count (announced politely) on the left, the group filter, and from `sm` the first-name / last-name sort toggle on the right. The sort is a display preference, remembered like the language (ADR 026); below 640px only the settings offer it, so the count and the filter share a row.

### List states
- Loading: skeleton rows in the letter grid, hidden from screen readers, which hear a loading message instead.
- Failed: a state title, a hint and a retry button. An expired session offers to sign in again instead.
- Empty book: offers a new contact and an import.
- No book on the server, an empty group and no search result use the same state block, title and hint only.
- The detail pane with no contact open shows the wordmark, and on desktop the `N` and `?` keys.

### Incomplete address book
A successful fetch can still leave cards unreadable or missing. Above the
list toolbar, a compact warning box gives the number of cards not displayed,
with a hint to retry or check another CardDAV client, and a retry button.
The message lives in a persistent polite status region, clears on recovery
or a book switch, and stays visible while searching or filtering. If every
card failed, the empty-book state doesn't show. It never claims the cards
were deleted or that Natel knows why they could not be loaded.

### Group filter
Shown only when the book has a group (ADR 022: group cards and `CATEGORIES`). One group at a time; contacts without a group aren't a choice.
- Trigger: the address-book switcher's pill, "All groups" by default.
- Menu: built like the book menu, "All groups" first, then each group with its number of contacts; the chosen one is checked.
- Filtered: the pill shows the group's name and a × that goes back to every group. The count names the group; search applies within it; the A–Z rail greys the letters without a contact in the group.
- The choice lasts for the session; it goes back to every group when another book is selected, or when the group no longer exists.

### Buttons
`buttonClass({ variant, size })` gives every button and button-like link its classes. Variants: `primary` (the ink pill), `outline`, `destructive` (always icon + label), `ghost` (quiet; an icon-only one has a translated `aria-label`). Sizes `sm`, `md` (default), `lg`, `icon`, `icon-sm`.

Touch targets are ≥ 40px (44–48px on mobile forms). Every interactive element shows keyboard focus: `FOCUS_RING` by default, an inset ring on contact rows, the muted background on menu items.

### Buttons inside a field
The password's show button and the search's clear button are ghost buttons 32px high, centred vertically in the field, so they never touch its border. `FIELD_BUTTON_HIT_AREA` extends their touch target to 44px in height without drawing it, and never over the field's text.

### Form fields
`fieldClass()`. Labels above, in bold; hints and error messages below, linked with `aria-describedby`. Invalid fields take `aria-invalid="true"` and a red border. A focused field's border turns ink, doubled by a 1px ring (red when invalid), with the mouse as with the keyboard. Mobile inputs stay at 16px so iOS doesn't zoom.

### Sign-in screen
Desktop: a full-height red panel on the left, the form on the right. On the panel's right edge, a column of thumb-index tabs as on a paper phone book (A–B … W–Z), decorative and desktop only; N–P, for Natel, is the white tab. Their labels stay fully opaque: lighter, they fall under 4.5:1 on the red. At the bottom, the tagline and a giant wordmark. A compact language select sits top right and writes the same preference as the settings (ADR 019); on the red panel it is restyled by overriding colour variables locally, never with new colours. Mobile: the red block on top, with the language select, and the form below.

The form has two fields, username and password. There is no server field: the CardDAV server is set by the operator (ADR 014).

Outside a secure context (plain HTTP, except on `localhost`), a warning line says the password can be read on the network. It doesn't block the sign-in: a trusted network over HTTP is a legitimate use, and the browser already flags the page.

Connection errors appear above the form, saying what failed and what to do: wrong credentials, or the CardDAV server not answering behind the proxy.

## Contact page: a reading view and a form

Clicking a contact opens its page **to read**. "Edit" switches the same route to **the form**. The two are laid out separately, each for its job: the reading view shows only what the card has, in compact rows; the form shows every field the card can take, labelled. Switching keeps the section the user was looking at in place (see Switching), not every pixel.

Why read first: people mostly look up, call and copy. Numbers must stay `tel:` links, and a keyboard must not pop up on mobile just to read. Per-field autosave is ruled out: each save is a full vCard PUT with `If-Match`, so autosave multiplies conflicts and makes "cancel" impossible.

The page root is `<article data-mode="view|edit">` with a visually hidden `<h1>`. The tab title is the card's `FN` followed by " · Natel". Both states share one column and `src/components/contact-fields.tsx`: sections, type labels and menus, the row buttons.

### Settings
`/contacts/settings` (ADR 019): in the detail pane on desktop, its own screen with the contact page's top bar on phones. Sections open like the contact page's:
- Account: who is signed in, and sign-out. When the server doesn't confirm the sign-out, the user stays signed in and a toast says so.
- Display: language, appearance (system, light, dark), sort order, and the map addresses open in (automatic, OpenStreetMap, the device's maps app, Apple Maps, Google Maps). A change applies at once; there is no save button.
- Keyboard shortcuts, desktop only.
- About and help, last (see below).

Back, or `Esc` on desktop, returns to `/contacts`.

### App information and help
In settings, an "About and help" section shows the version, and the source
revision when the build has one. The user guide opens inside the app, at `/contacts/settings/help`;
the bug form stays external, with `noopener noreferrer`.

### Update notifications

A newer stable release puts a small ink dot on the header's settings gear, at its
top right, ringed with the background colour; the link's label becomes "Settings,
new version available". The dot goes away once the settings have shown that
release, and comes back only for a later one. Nothing else in the list announces it.

In the settings' "About and help", the release has a block with a border, without a
shadow, in `bg-muted` on phones and in `bg-background` on the desktop's muted pane:
"Natel X is available." in bold, a link opening the release notes in another tab
and an "Ignore this version" button. Ignoring stores only the version in this browser and
focuses the line that replaces the block, which links to the latest known release.
That line also says whether server checks are enabled, and makes no "up to date"
claim after a failed check. The demo shows neither the dot nor the server check
status. A check never prevents contact use or asks for a reload.

### Embedded user guide
`/contacts/settings/help` uses the contact page's column and top bar. The
content is `docs/user-guide.md`, imported at build time, English only and
marked `lang="en"`; only the surrounding navigation is translated. Its
renderer turns headings, paragraphs, bold, inline code and links into
React elements, so no HTML sink or new dependency is needed; unsupported
syntax fails the checks. Relative links resolve to the public documentation on GitHub. The
heading takes focus on arrival. Arrow keys scroll natively here, and `Esc`
doesn't navigate.

### New contact
`/contacts/new` is the form on a blank vCard 3.0 card, with no reading view to go back to. Save creates the card in the selected book (`If-None-Match: *`) and lands on its page, read; cancel goes back to the list. A 412 on create is an error, not an edit conflict.

### Sections
Both states group values in the same sections, in the same order: phones, e-mails, addresses, birthday, groups, website, nickname (form only; the reading view shows it under the name), note. A section opens with a light rule (it separates without outweighing the values) and a title line led by its icon; the title's right slot holds the section's action. Titles follow the number of values ("Phone" / "Phones").

### Reading view, top to bottom
1. Mobile only: a top bar, back left, "Edit" right. The back link names the selected book, so the page says which book it belongs to; with no book, it reads "Contacts".
2. Photo, initials, or the building icon. Desktop: the "Edit" pill top right.
3. The name, in the text face and in ink, in the order the list sorts by. It is the page's identity: no part of it is muted.
4. Under it, muted: job title · organisation (the organisation is left out on an organisation's own card), then the nickname.
5. Call (primary), Text and Email (outline), for the first number and the first e-mail; absent when the card has neither.
6. The sections the card has, and only those. A section's pencil opens the form on that section; on devices that hover, it shows on hover or focus, on touch it always shows.
7. Rows: type | value | copy button, the button right after the value so it reads as its own. A birthday, and a website without a label, have no type. A value too long to sit beside its type goes under it on phones. No copy button on a phone's touch screen: a long press on a link already offers to copy.
   - Phones and e-mails are `tel:` and `mailto:` links. The primary number (first `TYPE=cell`, else the first number) is larger and bold.
   - Each address is one block, as on an envelope, each line only when the card has it; copying joins the lines with commas.
   - Each address links to a map search on its street, postal code and locality, region and country: a post office box or an extended line would only blur the search. A post office box alone has no link. The map is the one the settings choose (ADR 037); a web map opens in a new tab, the device's maps app (`geo:`) in place.
   - A website is a link only for `http(s)`: another scheme could open a local application.
   - A birthday with a day, a month and a year is followed by the age, muted, from 1 to 130: past that, the year is a placeholder.
   - Groups are chips; each filters the list on its group (see Group filter). On phones, where the list is another screen, it also goes back to the list.
   - The note keeps its line breaks.

Dotted leaders are used in the list only: they need right-aligned values.

### Form, top to bottom
1. Mobile only: the top bar, back left.
2. Photo, with change and remove buttons beside it.
3. Given name and family name, in the order the list sorts by, then organisation and job title, two by two on every screen so the top stays short. A card needs one of the three names: with none, all three are invalid under one message. An organisation's card is named after it: when an edit changes its organisation or clears the person's name, `FN` follows `ORG` (unless it was a name of its own).
4. Phones and e-mails always, each with a dashed "Add" button under its last row: the new row appears right above it and takes the focus. Addresses when the card has them, with the same button, the new address's street taking the focus. Birthday when the card has one; groups on an existing card; website, nickname and note when the card has them or the user opened them.
5. Rows: type menu | field | remove button, wrapping under the menu when the field would get narrower than 10rem. A row without a remove button keeps its room, so fields line up. Picking a type rewrites only the card's `cell`/`work`/`home` types and keeps the others (`INTERNET`, `PREF`, `VOICE`…); a type the menu doesn't offer still shows as it is. Phones offer mobile, work, home and other; e-mails, addresses and websites offer home, work and other.
   - Address: the extended line (c/o, building), then street, then postal code and locality on one line, then country, in the order the reading view shows them. A post office box and a region stay as the card has them.
   - Birthday: day / month / year.
   - Groups (ADR 022): chips with a ×, and a field suggesting the book's other groups. Group cards never show in the list.
6. Below the sections, so nothing above shifts: one dashed button per empty optional section, which opens it and focuses its first field, the information-not-shown link (see States), move, and delete.
7. A sticky bottom bar at the foot of the screen, even when the form is shorter: the error count after a failed save on the left, Cancel / Save on the right. Conflicts and errors show **inside this bar**, so they never push the form.

### Grouped contact labels (`X-ABLABEL`)
For a phone, e-mail, address and the first website, a non-empty
`X-ABLABEL` in the same vCard group replaces the row's type. Apple built-in
labels are translated; unknown built-ins show without their wrapper. Custom
labels show as stored.

The row's type menu offers its label first, selected, then the usual types.
Choosing a type removes the group's `X-ABLABEL` on save, even when that type
matches the underlying `TYPE`; reselecting the label cancels that. Editing a
value keeps the label. Displayed labels are left out of the
information-not-shown dialog.

### Custom address labels
An address's type menu ends with "Custom…" (ADR 036), which shows a
label field above the address, filled with the address's own label when it
has one other than Apple's built-ins. The label is saved as the group's
`X-ABLABEL`; the address's `TYPE` stays as it was. Left empty, the field
removes the label. A label over an empty address is an error under the
field, since saving drops an empty address. Phones, e-mails and websites
don't offer it.

### Switching
- Enter: "Edit", the `E` key, a section's pencil, or `?edit` in the URL (the same route on mobile).
- A pencil opens the form with that section where its title was on screen, and focuses its first field. Otherwise the top of the page stays in place.
- Leave: Save (then back to the reading view with a toast), Cancel, `Esc` or the back arrow. With unsaved changes, the discard dialog asks first.

### States
- **Field error**: validated on blur and on save, not on each keystroke. A save that finds errors sends nothing, counts them in the bottom bar, scrolls the first one to the middle of the screen and focuses it.
- **ETag conflict (412)**: a warning in the bottom bar, offering to reload or to overwrite with the user's version. Never overwrite silently.
- **List changed on both sides (412, ADR 038)**: when a phone, e-mail or address list the user changed was changed elsewhere too, the warning names those sections, says to reload and make the changes again, and offers to reload only.
- **Dialogs** (`src/components/ui/dialog.tsx`): a bottom sheet on phones, centred from `sm`. Focus stays inside; `Esc` or a click outside closes, except while something runs. The discard dialog offers to keep editing or to discard (destructive).
- **Move** (ADR 021): above delete, absent on a new contact and with a single book, disabled while the draft has unsaved changes. Its dialog lists the other books as radio buttons; while the move runs, the focus goes to the dialog's panel. Success lands on the contact's page in the target book, now selected. A card changed or gone elsewhere shows the conflict with "Reload" only.
- **Delete**: the form's last element, absent on a new contact. The dialog names the contact and says it goes from every synced device. A 412 offers "Reload" only: there is no version of the user's to push, and deleting a card changed elsewhere unseen is exactly what the ETag prevents.
- **Photo** (ADR 023): the file picker, then a crop dialog with a square frame. The frame has the initial focus and takes drag, pinch, wheel, arrow keys and `+` / `-`; a zoom slider goes from 1× to 4×. The new photo shows in the form before it is saved. On a vCard 2.1 card, or one without a version, only removing the photo is offered.
- **Information not shown**: what the card holds that Natel doesn't show (`X-` properties, `IMPP`, `RELATED`…) is never edited and survives every save (invariant 4). A link under the form, absent at 0, counts them and opens a dialog listing them as the card writes them, so someone who knows vCard can inspect them.
- **Group write failed**: the bottom bar says the contact is saved but some groups were not, each with its reason, and offers reload or overwrite for one changed elsewhere.

## Brand assets

The [brand kit](brand/README.md) holds the brand files and their rules.
`theme-color` follows the theme: the brand red in light, the dark
background in dark.

## Dark mode

Natel follows the system setting unless the settings choose light or dark
(ADR 026). `src/index.css` defines every colour token for light and again
for `data-theme="dark"`, each with its `color-scheme`, so native controls and
scrollbars follow. `public/theme.js` sets `data-theme` before the first
paint, so nothing flashes. Components never name a dark colour; the tokens
carry it. The one exception is the dialog overlay, which dims more in dark
(`dark:` follows `data-theme`).

- Very dark greys, never pure black; fields a notch lighter than the surface
  they sit on.
- Ink and white swap: the primary pill turns light with dark text.
- `brand` turns lighter for letters and small marks; large red areas use
  `brand-surface`, which turns darker so the sign-in panel doesn't glare.
- Shadows become a 1px light keyline.
- Photos are never dimmed or filtered.
- `tests/lib/contrast.test.ts` checks the audited pairs in both modes, from
  the hex each token carries in its comment: keep that hex in step with the
  value, and add a pair when a component puts text on a new surface.
- The PWA manifest's `background_color` stays white: a manifest can't vary
  by scheme, so an installed Natel shows a white splash in dark mode.

## Demo

Only in the demo build (ADR 025), so a visitor always knows nothing is saved. It has two books (ADR 027), so the book switcher and moving a contact have something to show.
- Sign-in: a line above the form says any username and password work and nothing is saved; the privacy note under it says nothing typed leaves the browser.
- Signed in: a "Demo" mark next to the wordmark, and under the header bar one line saying nothing is saved. On phones, where a contact, a new contact or the settings replace the header, the mark sits in the top bar.

### Demo direct links

Opening `/contacts` or one of its child routes in the demo starts an
in-memory session named `demo`, without showing the sign-in screen. The
root and `/login` show the demo sign-in form on a fresh load; signing out
returns there.
A reload resets the contacts and opens the requested page directly.

## Still not designed

Offline state.

## Drawn but without a vCard mapping

These elements appear in the references, but which vCard property they read and write is not decided. Don't build them until it is recorded in `docs/DECISIONS.md`.

- **Favourite** (top-right of the contact page): no standard vCard property.
- **"Other date"**: `ANNIVERSARY` is vCard 4.0 only, and cards are created as 3.0 (ADR 008).

## Keyboard shortcuts
Single keys never fire while typing in a field, in a menu, behind a dialog, or with a modifier they don't expect (Shift and AltGr are left to the layout, since some need them for `/` or `?`).

| Key | Where | Does |
|---|---|---|
| `/` | desktop | Focuses the search |
| `↑` / `↓` | desktop | Opens the previous / next contact in the list as shown; with none open, `↓` the first and `↑` the last. A focused row hands its focus on. They don't scroll the page, except past the list's ends. |
| `N` | everywhere | Opens a new contact, when there is an address book |
| `E` | contact page | Enters edit mode |
| `⌘` / `Ctrl` + `Enter` | edit mode | Saves, from a field too (`⌘S` belongs to the browser) |
| `Esc` | everywhere | Cancels the edit, closes the dialog, clears the search; closes the settings on desktop |
| `?` | everywhere | Opens the shortcuts dialog |

The shortcuts dialog shows `⌘` on Apple devices and `Ctrl` elsewhere, and on phones lists only the keys that work there.

## Motion
- Search filters instantly, no list animation. A–Z jumps are instant.
- Hover/press: colour only. Dialogs and toasts fade and slide in; the selection bar fades in on the current row. Menus and panels appear without motion.
- `prefers-reduced-motion` is handled globally by the tokens file; don't add motion that bypasses it.

## Copy and i18n
- FR and EN from day one; FR is ~30% longer. No fixed-width buttons. Every icon-only button has a translated `aria-label`.
- Only list-row names and trailing values truncate, plus the book's name on phones, in the header and in the top bar's back link. UI labels wrap.
- French typography: `’` apostrophe, « » with non-breaking spaces, a non-breaking space before `?` and `:`.
- The mobile phone type is labelled "Mobile" in both languages: "Natel", the Swiss word for it, would read as the app's name.
- The French "E-mail" keeps its hyphen on one line: the strings put a word joiner (U+2060) on each side of it, since Work Sans has no non-breaking hyphen.
- Swiss numbers are displayed in local format (`079 000 00 01`), foreign numbers in international format. Numbers are stored as they are in the vCard; formatting is display only.
- Search is accent-insensitive, matches name, organisation, e-mail and phone digits, and highlights matches.
- The language defaults to the browser's (ADR 019). Languages are listed by their own names.

## Accessibility checklist
- Text contrast ≥ 4.5:1; the large A–Z letters, input borders and the focus ring ≥ 3:1, in light and dark (checked by `tests/lib/contrast.test.ts`).
- Every screen and dialog passes axe (WCAG 2.1 A and AA, plus best practices) in light and dark, on desktop and phone (`tests/e2e/a11y.spec.ts`); the states it can't reach against a test server, no address book and an import in progress or failing, are not checked. The empty detail pane's wordmark is a logotype, which WCAG 1.4.3 exempts from contrast: it carries `data-logotype` and the check skips it.
- The `hidden` attribute always wins over display utilities (base layer rule): use it instead of toggling classes.
- List = `<nav aria-label>` + `<ul role="list">`; the current contact has `aria-current`.
- A retry that runs in place, in the sync warning or the incomplete-book box, keeps the focus with `aria-disabled`; when its box goes away, the focus it held moves to the settings link or to the list.
- Dialogs and panels give the focus back to what opened them.
- Menus take the arrow keys and Home/End; `Esc` closes them and returns to the trigger, a click outside closes them.
- The result count is announced (`aria-live="polite"`).
- `<html lang>` follows the language in use.
- The toasts' live region (`role="status"`) is always in the page, so a toast's text is read when it appears.
