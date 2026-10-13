# Natel — Design system ("Annuaire" direction)

This document is the source of truth for Natel's UI. The reference HTML files in
`natel-design/` are **visual references**, not code to copy; that folder is a local
untracked handoff and is never committed. When the two disagree, this document wins.

## Files

| File | Role |
|---|---|
| `src/index.css` (from the handoff `natel-annuaire-tokens.css`) | Tailwind v4 + shadcn tokens, fonts via Fontsource, base layer, `leader` utility |
| `src/components/button.ts`, `icons.tsx`, `dialog.tsx` | The button and field recipes as class helpers, the icon set, the dialog shell. Build controls from these rather than repeating classes |
| `natel-design/natel-annuaire-identite.html` | Design-system reference: palette with contrast ratios, type scale, shapes, motion |
| `natel-design/natel-annuaire-login.html` | Visual reference: sign-in screen |
| `natel-design/natel-annuaire-contacts.html` | Visual reference: list, search, and the contact page. Its edit mode, where the form keeps the reading view's layout, is superseded by "Contact page" below |

The reference HTML files were compiled with Tailwind 3 and embed fonts as base64.
**Do not copy their `<style>` block, their inline scripts, the SVG placeholder
portraits, or the dashed "Prototype" panel.** Copy only the class names on
elements; they were chosen to mean the same thing in Tailwind v4.

Dependencies (already in `package.json`): `@fontsource-variable/work-sans`,
`@fontsource-variable/big-shoulders`, `tw-animate-css`. No CDN, no Google Fonts
URL, no remote images — ever.

## Core rules

1. **Directory grammar.** A contact row reads like a phone directory entry: the part the list sorts by in bold, the other after it, dotted leader, primary phone number right-aligned. The default sort is by first name (**Given** Family, ADR 026); by last name the row reads like a Swiss phone book, **Family** Given.
2. **Red (`brand`) marks position, never action.** Allowed: wordmark, A–Z group letters, the 3px selection bar, the sign-in panel, the 6px top band. Forbidden: buttons, links, error states, icons meaning "delete".
3. **Primary action = ink pill** (`bg-primary text-primary-foreground rounded-full`). Destructive actions use `destructive`, always with an icon and a text label.
4. **Two typefaces, strict roles.** `font-display` (Big Shoulders 700) only at ≥ 32px: wordmark, group letters, screen and state titles. Everything else is `font-sans` (Work Sans 400/700, and 500 for the second part of a list name). Never Big Shoulders below 32px, except initials in avatars.
5. **Numbers are tabular.** Phone numbers, dates, counts: `tabular` class (or inside `a[href^="tel:"]` / `<time>`, handled by the base layer).
6. **Nothing that sits on the page has a shadow.** Only floating layers: `shadow-float` (menus, popovers, toasts), `shadow-overlay` (dialogs, mobile sheets).
7. **Photos are rounded squares, not circles.** List: `size-10 rounded-lg`. Detail: `size-28 rounded-xl`. No photo → initials in `font-display`, in the order the list sorts by (Aline Dessendre → "AD", by last name "DA"), on one of six tints (`--avatar-tint-1` to `-6`) drawn from the card's UID, so a person keeps theirs on every device, while the name is typed, and after a rename. The tints have no red or pink (marks and selection use them) and one lightness, so none stands out; the initials stay in `avatar-foreground`. Organisation-only card → building icon on the neutral `bg-avatar`.

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

Tailwind's own `text-sm` (14px), `text-base` (16px), `text-lg` and `text-xl` cover the rest.

The list's hierarchy follows what people look for: the name first, then its number, then the photo and the letter that help find it. The group letters mark the position without outweighing the names.

## Layout

**Desktop (`lg`, ≥ 1024px):** full-height grid. Header 6px `bg-brand` band + 64px bar. Below: list pane `minmax(26rem,34rem)` (own scroll, `border-r`) + detail pane `1fr` on `bg-muted` (own scroll). Detail content max width `44rem`.

**Mobile (< 1024px):** page scroll. Sticky header = band + 56px row (wordmark, address-book switcher, settings, round "+" button) + search row, on one row down to 320px. No detail pane: opening a contact is a separate route.

Sticky offsets: use `--header-h` (exposed on the header) with `top-[var(--header-h)]`; do not hardcode pixel offsets.

## Components

Recipes below are the exact class sets from the references. Build them as React components; use shadcn primitives (Button, Input, DropdownMenu, Dialog, Sheet…) and restyle them with these classes rather than keeping shadcn's defaults.

### Header
- Band: `h-1.5 bg-brand`.
- Wordmark: `font-display text-wordmark font-bold` — plain text "Natel", ink colour in the app header (red only on the sign-in panel and the identity page).
- Address-book switcher: `rounded-full px-2.5 h-8 text-sm font-bold text-muted-foreground hover:bg-muted` + chevron. On phones it takes the room the actions leave and truncates the book name, which the menu shows in full; the menu spans the header's width, 1rem from each edge.
- Book menu, below the books and a separator (ADR 020): "Exporter « Contacts »" (download icon) saves the selected book as `<name>.vcf`, disabled (`aria-disabled`, muted, still focusable) while the book shows no contact; "Importer un fichier .vcf…" (upload icon) opens the file picker (`.vcf`, `text/vcard`). An export that fails says so in a toast.
- Import dialog: built like the discard dialog, titled "Importer dans « Contacts »". While cards are sent it shows "12 / 40" (`tabular`, `aria-live="polite"`) and can't be dismissed; then the counts (imported, already in the book, failed, the last in `text-destructive` when not zero), the failed cards by name (or "Carte 3") with their reason in `text-muted-foreground`, and a primary "Fermer", which takes the focus. `Esc` closes it once finished. The list behind shows each contact as it is created; closing leaves the user on the list, nothing selected.
- Search: `field h-11 lg:h-10 rounded-full border border-input bg-background pl-10 pr-11 text-base lg:text-body`, search icon left, `/` kbd hint on desktop when empty, clear button when not empty. `/` focuses it, `Esc` clears it.
- Settings: ghost icon link (gear, `size-10 rounded-full text-muted-foreground hover:bg-muted`), accessible name and tooltip "Paramètres", on phones and desktop, always present, even with no address book. Opens `/contacts/settings`; being a link, an unsaved edit gets the discard dialog first. Signing out is there, so the bar keeps its room for the book's name.
- Sync warning, only when the contacts shown couldn't be reloaded: a ghost button before the settings link, in `text-warning`, alert icon, its label from `xl`: "Synchronisation impossible", or "Votre session a expiré" when the server refused the session. It opens a panel (`aria-expanded`), built like the book menu's (`rounded-lg bg-popover p-4 shadow-float`, `w-80` right-aligned under it from `sm`, the header's width on phones, where only the icon shows and a tap must be worth it): the label in bold, then in `text-sm text-muted-foreground` "Les contacts affichés ne sont peut-être plus à jour. Dernière synchronisation réussie il y a 12 minutes." (in hours, then days, past an hour; kept true while open) and a primary `sm` "Réessayer" (refresh icon) on the right; for an expired session, "Reconnectez-vous pour retrouver vos contacts." and "Se reconnecter", which signs out. The action takes the focus and is described by the text above it; `Esc` or a click outside closes the panel and gives the button the focus back, and the focus leaving it closes it too. While a reload runs, or waits for the network, a spinner replaces the icon, the action reads "Synchronisation…" and takes `aria-disabled`. A reload that works closes it all and says "Contacts à jour" in a toast, and the focus it held goes to the settings link; one that fails again says "Toujours impossible de synchroniser". A visually hidden polite live region reads the label when the warning appears. Nothing shows while sync works; a book that never loaded shows the list's failed state instead.
- New contact: round ink "+" link (`size-10 rounded-full bg-primary text-primary-foreground`) last, shown once the server has an address book; from `lg` a pill with its label, "+ Nouveau contact". Opens `/contacts/new`.

### Group (letter section)
```html
<section class="grid grid-cols-[2.75rem_1fr] sm:grid-cols-[3rem_1fr] border-t first:border-t-0 py-2">
  <h2 class="sticky top-[var(--header-h)] lg:top-2 self-start pl-2 pt-4 sm:pt-3.5 font-display text-title-sm font-bold leading-[0.8] text-brand">B</h2>
  <ul role="list">…rows…</ul>
</section>
```
The letter sits centred on its section's first row (56px on phones, 52px from `sm`), never above it.

### Contact row
- Link: `group relative flex items-center gap-3 rounded-lg px-2 min-h-[3.5rem] py-1.5 sm:min-h-[3.25rem] sm:py-0 hover:bg-muted aria-[current=true]:bg-selection`.
- Selection bar: `absolute inset-y-2.5 left-0 w-[3px] rounded-full bg-brand opacity-0 group-aria-[current=true]:opacity-100`.
- Content wrapper: `min-w-0 flex-1 sm:flex sm:items-center sm:gap-3`.
  - Name: `block min-w-0 truncate text-name` → the part the list is sorted by comes first, in bold, the other in medium weight (500), so it stays as legible: `<b class="font-bold">Family</b> <span class="font-medium">Given</span>` by last name, `<b class="font-bold">Given</b> <span class="font-medium">Family</span>` by first name. Full name, in the same order, in `title`. A card with neither a name nor an organisation shows "Contact sans nom" / "Unnamed contact" instead, in `italic text-muted-foreground` (the muted grey keeps 4.5:1; transparency wouldn't), and so does the contact page, in the family-name line and its title.
  - Leader: `<span class="leader hidden sm:block" aria-hidden="true">`.
  - Trailing value: primary phone (`text-sm tabular`, ink on ≥ sm, a notch under the name) or, if none, email/org (`text-sm text-muted-foreground`, truncated, `sm:max-w-[42%]`).
- **Mobile (< 640px):** trailing value drops under the name, leader hidden. This is deliberate: single-line rows truncate names too much on phones.

Trailing value priority: first `TEL` with `TYPE=cell` → first `TEL` → first `EMAIL` → `ORG`.

### A–Z rail
Right edge. All 26 letters in `font-display text-[0.8125rem] font-bold`, present letters `text-foreground`, absent `text-leader` + `aria-hidden` + `tabindex=-1`. Anchors jump to `#g-X` without smooth scrolling. Hidden while a search query is active.
- Touch: sliding a finger along the rail follows the letter under it, as native contact apps do; an absent letter lands on the next present one (or the last one before it). The rail takes `touch-none` so the page doesn't scroll meanwhile.
- From `lg`, the list scrolls in its own pane and the rail sits outside it (`lg:mr-8` on the list), so the whole scrollbar stays clickable.

### List toolbar
One size, `text-sm`: count (`text-muted-foreground`, `aria-live="polite"`) on the left; sort toggle "Prénom / Nom" on the right from `sm` (small bold pills, `aria-pressed`, their touch area extended to 44px). The sort is a display preference, remembered like the language (ADR 026, settings "Trier par"); below 640px only the settings offer it, so the count and the filter share a row (a long group name in the count can still wrap the filter under it). Between them, the group filter.

### List states
- Loading: eight skeleton rows (`animate-pulse`, `bg-muted` avatar and bars) in the letter grid, hidden from screen readers, which hear "Chargement des contacts…" instead.
- Failed: a state title in `font-display text-3xl`, "Impossible de charger les contacts", a muted hint and a primary "Réessayer" (refresh icon). An expired session says "Votre session a expiré" and offers "Se reconnecter", which signs out.
- Empty book: "Ce carnet est vide", "Ajoutez un premier contact, ou importez ceux d’un autre carnet.", a primary "Nouveau contact" and an outline "Importer un fichier .vcf".
- No book on the server, an empty group and no search result use the same state block, title and hint only.
- The detail pane with no contact open shows the wordmark (`data-logotype`), and on desktop the keys `N` nouveau contact · `?` raccourcis clavier.

### Incomplete address book

A successful fetch can still leave cards unreadable or missing. Above the
list toolbar, show a compact warning box (`mx-2 mt-3 rounded-lg border
border-warning/40 bg-warning/5 p-3 text-sm`), with an alert icon, the number
of cards not displayed, and a hint to retry or check another CardDAV client.
An outline small "Réessayer" button reloads the book; while running, it says
"Synchronisation…" and stays focusable with `aria-disabled`. The message
lives in a persistent polite status region, clears on recovery or a book
switch, and remains visible while searching or filtering. If every card
failed, do not show the empty-book state. On recovery, focus held by the
retry action moves to the list. This message does not claim the cards were
deleted or that Natel knows why they could not be loaded.

### Group filter
Shown only when the book has a group (ADR 022: group cards and `CATEGORIES`). One group at a time; contacts without a group aren't a choice.
- Trigger: "Tous les groupes" + chevron, the address-book switcher's pill (`h-8 rounded-full px-2.5 text-sm font-bold text-muted-foreground hover:bg-muted`); its accessible name is "Filtrer par groupe : <choice>".
- Menu ("Groupes"): built like the book menu (same item classes, arrow keys, Home/End, Escape back to the trigger, outside click closes). "Tous les groupes" first, a separator, then each group of the book by name, its number of contacts on the right in `text-sm font-normal text-muted-foreground tabular`; the chosen entry shows the check instead (`menuitemradio`, `aria-checked`). From `sm` it opens under the trigger, right-aligned, `min-w-[13rem]`; on phones it spans the toolbar's width.
- Filtered: the pill takes `bg-secondary` and the group's name in `text-foreground`, without chevron, plus a × ("Afficher tous les groupes") that goes back to every group. The count reads "12 contacts dans Famille" ("1 contact dans Famille"); search applies within the group; the A–Z rail keeps every letter and greys those without a contact in the group, as it does for the book. A group with no contact shows "Aucun contact dans ce groupe."
- For the session; it goes back to "Tous les groupes" when another book is selected, or when the group no longer exists.

### Buttons
`buttonClass({ variant, size })` in `src/components/button.ts` gives every button and button-like link its classes: `inline-flex items-center justify-center gap-2 rounded-full font-bold`, plus

| Variant | Classes |
|---|---|
| `primary` | `bg-primary text-primary-foreground hover:bg-primary/85` |
| `outline` | `border border-input bg-background hover:bg-accent` |
| `destructive` | `bg-destructive text-destructive-foreground`, always icon + label |
| `ghost` | `text-muted-foreground hover:bg-muted hover:text-foreground`, icon-only with a translated `aria-label` |

Sizes: `sm` (`h-9 px-3 text-sm`), `md` (`h-10 px-4 text-sm`, the default), `lg` (`h-12 lg:h-11 px-6 text-base`), `icon` (`size-10`), `icon-sm` (`size-9`). Icons come from `src/components/icons.tsx` (2px stroke, 16px by default).

Touch targets are ≥ 40px (44–48px on mobile forms). Every interactive element has the keyboard focus ring, `FOCUS_RING`: `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`.

### Form fields
`fieldClass()`: `field rounded-md border border-input bg-card px-3 text-base lg:text-body`, at `h-12 lg:h-11` (`h-11` in the contact form's rows). Labels above, `text-sm font-bold`. Hint below in `text-caption text-muted-foreground`, linked with `aria-describedby`. Invalid: `aria-invalid="true"` → `border-destructive`. Focused, with the mouse as with the keyboard, a field's border turns ink and a 1px ring doubles it (red when invalid). Mobile inputs stay at 16px (prevents iOS zoom).

### Sign-in screen
Desktop: `grid-cols-[5fr_6fr]`. Left: full-height `bg-brand` panel. On its right edge, from the top down to 62% of its height, a column of thumb-index tabs as on a paper phone book (A–B, C–D, E–G, H–K, L–M, N–P, Q–S, T–V, W–Z): `w-13`, each `flex-1`, `border-l border-b` in white at 35%, labels `text-[0.8125rem] font-bold` in white; N–P, for Natel, is a white tab with a red label. Labels stay fully opaque: lighter, they fall under 4.5:1 on the red. Decorative (`aria-hidden`, not clickable), desktop only. At the bottom, tagline + giant wordmark (`font-display`, `clamp(8rem,13vw,13rem)`, `leading-[0.78]`). Right: a compact language select top-right ("Langue" label, `h-9 px-2.5 text-sm` select), form centred, `max-w-[24rem]`. Mobile: red block on top (language select, wordmark 6.5rem, tagline), form below. On the red panel, restyle the select by overriding CSS variables locally (see the reference file) rather than adding new colours. The select writes the same preference as the settings page (ADR 019).

The form has two fields, username and password. There is no server field: the CardDAV server is set by the operator (ADR 014).

Served outside a secure context (`window.isSecureContext` is false: plain HTTP, except on `localhost`), a line above the form says the connection isn't encrypted and the password can be read on the network, "Cette connexion n’est pas chiffrée : votre mot de passe peut être lu sur le réseau." It is built like the privacy note under the form (open padlock icon, `text-sm leading-snug`), in `text-warning`. It doesn't block the sign-in: a trusted network over HTTP is a legitimate use, and the browser already flags the page.

Connection errors appear above the form in a `border-destructive/40 bg-destructive/5` box with an alert icon, saying what failed and what to do. The two cases are wrong credentials and the CardDAV server not answering behind the proxy.

## Contact page: a reading view and a form

Clicking a contact opens its page **to read**. "Modifier" switches the same route to **the form**. The two are laid out separately, each for its job: the reading view shows only what the card has, in compact rows; the form shows every field the card can take, labelled. Switching keeps the section the user was looking at in place (see Switching), not every pixel.

Why read first: people mostly look up, call and copy. Numbers must stay `tel:` links, and a keyboard must not pop up on mobile just to read. Per-field autosave is ruled out: each save is a full vCard PUT with `If-Match`, so autosave multiplies conflicts and makes "cancel" impossible.

The page root is `<article data-mode="view|edit">` with a visually hidden `<h1>` for the accessible name. The tab title is the card's name, its `FN`, then " · Natel" (the delete dialog names it the same way) ("Nouveau contact · Natel" on a new one), and goes back to "Contacts · Natel" when the page closes. Both states share one column, `max-w-[44rem]`, and `src/components/contact-fields.tsx`: sections, type labels and menus, the row buttons.

### Settings
`/contacts/settings` (ADR 019), a child of the contacts layout like the new contact. Desktop: in the detail pane, in the contact page's column. Mobile: its own screen, with the contact page's top bar (back "Contacts" left, "Paramètres" right). A `font-display` title (`text-title-sm sm:text-title lg:text-person`), then sections opened like the contact page's:
- **Affichage**: "Langue" ("Langue du navigateur", then each language by its own name), "Apparence" (Comme le système, Clair, Sombre) and "Trier par" (Prénom, Nom), each a labelled `<select>` in the form-field recipe (`max-w-sm`). A change applies at once; there is no save button.
- **Compte**: "Session ouverte avec le compte **alice**", and an outline "Se déconnecter" (log-out icon). When the server doesn't confirm the sign-out, the user stays on the page, still signed in, and a toast says "Déconnexion impossible : vérifiez la connexion et réessayez."
- **Raccourcis clavier**, desktop only: an outline button that opens the shortcuts dialog.

Back, or `Esc` on desktop, returns to `/contacts`. The tab title is "Paramètres · Natel".

### App information and help

In settings, an "À propos et aide" section shows a small muted version line
and the available source revision. An internal "Guide utilisateur (anglais)" link
opens `/contacts/settings/help` without reloading or leaving the instance. Setup
Discussions and the bug form remain external, with `noopener noreferrer`.

### Embedded user guide

`/contacts/settings/help` uses the contact page's column, mobile top bar and heading
scale. An internal "Retour aux paramètres" link precedes the heading;
Arrow keys keep their native scrolling behaviour here; contact navigation
shortcuts apply only to the list and contact routes. `Esc` is not a
navigation shortcut on this reading page. The heading takes
focus on arrival so the screen reader announces the new page. The content is English only, marked `lang="en"`, and imported from
`docs/user-guide.md` at build time. Only the surrounding navigation is
translated. The guide renderer supports h1/h2 headings, paragraphs, bold,
inline code and links as React elements; unsupported syntax fails the
checks. Relative links resolve to the public documentation on GitHub.
No external fetch, HTML sink or new dependency is needed. The server
operator's deployment documentation stays in `docs/`.

### New contact
`/contacts/new` is the form on a blank vCard 3.0 card, with no reading view to go back to. The top-right label (mobile top bar, desktop label slot) reads "Nouveau contact", and the avatar shows the initials as they are typed. Save creates the card in the selected book (`If-None-Match: *`) and lands on its page, read; cancel goes back to the list. A 412 on create is an error, not an edit conflict.

### Sections
Both states group values in the same sections, in the same order: Téléphones, E-mails, Adresse, Anniversaire, Groupes, Site web, Surnom (form only; the reading view shows it under the name), Note. A section opens with a light 1px rule, `border-t` (the border token: the rule separates, it doesn't outweigh the values), and a 40px title line (`text-sm font-bold`) led by the section's icon in `text-muted-foreground` (phone, envelope, map pin, cake, people, globe, tag, page); its right slot holds the section's action. Titles follow the number of values: "Téléphone" for one, "Téléphones" for several, and the same for e-mails; "Site web" is singular, the page showing one. Sections are `space-y-4` apart in the reading view.

### Reading view, top to bottom
1. Mobile only: 56px top bar, back ("Contacts") left, "Modifier" pill right.
2. Photo (`size-24 sm:size-28 rounded-xl`), or initials on `bg-avatar`, or the building icon for an organisation's card. Desktop: the primary "Modifier" pill top right (`aria-label` "Modifier (E)").
3. Name, in the text face, `text-3xl sm:text-4xl font-bold leading-tight tracking-tight`, in ink, in the order the list sorts by. It is the page's identity: no part of it is muted. A card with no name shows "Contact sans nom" in italic, muted.
4. Under it, muted: "Fonction · Organisation" (the organisation is left out on an organisation's own card), then the nickname in « ».
5. Actions: Appeler (primary), SMS and E-mail (outline), each with its icon, for the first number and the first e-mail; absent when the card has neither.
6. The sections the card has, and only those. The title line's action is a pencil ("Modifier les téléphones"…) that opens the form on that section. On devices that hover, it shows while the section is hovered or the pencil focused; on touch it always shows.
7. Rows: type | value | action on one line, the action right after the value so it reads as its own. The type (`text-sm text-muted-foreground`, regular weight: it qualifies the value) is 7.5rem wide from `sm`, 5.5rem on phones, where a value too long to sit beside it goes on the line below. Types read "Mobile", "Travail", "Domicile" or "Autre". The action is a copy button, absent on a phone's touch screen: a long press on a link already offers to copy.
   - Phones and e-mails are `tel:` and `mailto:` links. The primary number (first `TYPE=cell`, else the first number) is `text-lg font-bold sm:text-xl`.
   - The address is one block, as on an envelope: PO box, extended address, street, postal code and locality, region, country, each line only when the card has it; copying gives them joined by commas.
   - Birthday and website have no type. A website is a link only for `http(s)`: another scheme could open a local application.
   - Groups are chips (`h-8 rounded-full bg-secondary px-3 text-sm font-bold`), with no action.
   - The note keeps its line breaks.

Dotted leaders are used in the list only, not on the contact page: they need right-aligned values.

### Form, top to bottom
1. Mobile only: the top bar, back left, "Modification" (or "Nouveau contact") right.
2. Photo, with "Changer la photo" (image icon) and "Retirer la photo" (trash icon), outline `sm`, stacked to its right; desktop: the label top right.
3. Labelled fields, two by two on every screen so the top of the form stays short: Prénom and Nom, in the order the list sorts by, then Organisation and Fonction; `h-11`, `gap-3`, labels `space-y-1` above. A card needs one of Nom, Prénom or Organisation: with none, the three take `aria-invalid` and one message under the name row says "Indiquez un nom, un prénom ou une organisation." An organisation's card is named after it: when an edit changes its organisation or clears the person's name, `FN` follows `ORG` (unless it was a name of its own).
4. Téléphones and E-mails always, with "Ajouter un téléphone" / "Ajouter un e-mail" under their last row, in the bottom pills' style (dashed) at full width: the new row appears right above it and takes the focus; Adresse and Anniversaire when the card has them; Groupes on an existing card; Site web, Surnom and Note when the card has them or the user opened them.
5. Rows: type menu (regular weight, 6.5rem on phones, 7.5rem from `sm`) | field | remove button (trash, `hover:text-destructive`) on one line, as long as the field keeps 10rem; narrower, the field and the button wrap under the menu. An address always takes its own line under its menu on phones. A row without a remove button keeps its room, so fields line up. The type menu offers Mobile, Travail, Domicile and Autre for a number, Domicile, Travail and Autre for an e-mail or an address; a type the menu doesn't offer still shows as it is. Picking one rewrites only the card's `cell`/`work`/`home` types and keeps the others (`INTERNET`, `PREF`, `VOICE`…).
   - Address: its type, then Rue, Code postal (`minmax(0,9rem)`) and Localité on one line, Pays; placeholders name them.
   - Birthday: Jour / Mois / Année.
   - Groups: chips with a × ("Retirer de « Famille »") and an "Ajouter un groupe" field (`h-8 rounded-full`) suggesting the book's other group names through a `datalist`; Enter or leaving the field adds the name. Groups are read from the book's group cards and the contact's `CATEGORIES`, and written as group cards (ADR 022); group cards never show in the list.
6. Below the sections, so nothing above shifts: one dashed pill per empty optional section ("Ajouter une adresse", "un anniversaire", "un site web", "un surnom", "une note"), which opens it and focuses its first field; "1 autre information non affichée" (see States); "Déplacer vers un autre carnet"; "Supprimer le contact".
7. A sticky bottom bar, in the form's column, at the foot of the screen even when the form is shorter (the page fills the pane in edit mode): on the left, "2 champs à corriger" (`role="status"`, `text-destructive`) after a save that found errors; Annuler / Enregistrer on the right. Conflicts and errors show **inside this bar**, above the buttons, so they never push the form.

Fields follow the form-field recipe; mobile inputs stay at 16px.

### Grouped contact labels (`X-ABLABEL`)

For a phone, e-mail, the first address and the first website, a non-empty
`X-ABLABEL` in the same vCard group replaces the row's type. Apple built-in
labels are translated; unknown built-ins show without their wrapper. Custom
labels show as stored and wrap like other labels.

The row's type menu offers its label first, selected, then the usual types.
A website has Domicile, Travail and Autre. Choosing a type removes the
group's `X-ABLABEL` on save, even when that type matches the underlying
`TYPE`. Reselecting the label cancels that change. Editing a value keeps
the label. Natel does not create custom labels. Displayed label properties
are excluded from the information-not-shown dialog; labels for other
properties stay there.

### Switching
- Enter: "Modifier", the `E` key, a section's pencil, or `?edit` in the URL. Same route on mobile (`/contacts/:id` and `/contacts/:id?edit`).
- A pencil opens the form with that section where its title was on screen, and focuses its first field. Otherwise the top of the page stays in place.
- Leave: Enregistrer (spinner "Enregistrement…", then back to the reading view with the toast "Enregistré"), Annuler or `Esc` (dialog "Abandonner les modifications ?" if anything changed, else straight back), back arrow on mobile (same rule).

### States
- **Field error**: `aria-invalid="true"` + message under the field (`text-destructive`, `aria-describedby`). Validate on blur and on save, not on each keystroke. A save that finds errors sends nothing, counts them in the bottom bar, scrolls the first one to the middle of the screen and focuses it.
- **ETag conflict (412)**: warning box in the bottom bar, "Ce contact a été modifié ailleurs.", actions Recharger (primary) / Écraser avec ma version (outline). Never overwrite silently.
- **Dialogs** (`src/components/dialog.tsx`): `font-display` title, `rounded-xl shadow-overlay`, a bottom sheet on phones, centred from `sm`. Tab stays inside; `Esc` or a click outside closes, except while something runs. The discard dialog: "Abandonner les modifications ?", "Continuer l’édition" / "Abandonner" (destructive).
- **Move** (ADR 021): an outline button "Déplacer vers un autre carnet" (arrow icon) right above "Supprimer le contact", absent on a new contact and when the account has a single book. Disabled while the draft has unsaved changes, with the hint "Enregistrez ou annulez vos modifications d’abord." below it. Its dialog, "Déplacer ce contact ?", lists the other books as native radio buttons in a `fieldset`, the only one chosen when there is just one, none otherwise; "Annuler" / "Déplacer" (primary, disabled until a book is chosen). While the move runs, "Déplacer" shows a spinner and "Déplacement…" and nothing in the dialog responds. Success lands on the contact's page in the target book, now selected, with the toast "Déplacé vers « Travail »". A failure keeps the form with the message in the bottom bar; a card changed or gone elsewhere shows the conflict box with "Recharger" only.
- **Delete**: "Supprimer le contact" (destructive, trash icon) is the last element of the form, absent on a new contact. Its dialog: "Supprimer Ada Lovelace ?", "Le contact sera supprimé du serveur, et donc de tous vos appareils synchronisés.", "Annuler" / "Supprimer" (destructive, trash icon). A 412 shows the conflict box in the bottom bar with "Recharger" only: there is no version of the user's to push, and deleting a card changed elsewhere unseen is exactly what the ETag prevents.
- **Photo** (ADR 023): "Changer la photo" opens the file picker (`accept="image/*"`), then the "Recadrer la photo" dialog. A square frame, `rounded-xl` like the result, up to 20rem wide, over the image dimmed outside it; the image fills the frame at first, centred. The frame is focusable and has the initial focus, a translated `aria-label` ("Cadre de la photo"), its instructions below it in `text-caption text-muted-foreground`, linked with `aria-describedby`, and the focus ring. It takes the drag, pinch and wheel, and while focused the arrow keys to move and `+` / `-` to zoom; a labelled range "Zoom" goes from 1× to 4×. Errors (an image that doesn't decode, a canvas that fails) show in a `role="alert"` message in the dialog. Actions "Annuler" (outline) and "Utiliser la photo" (primary). `Esc` closes the dialog only. The new photo shows in the form before it is saved. "Retirer la photo" shows only while a photo is displayed. On a vCard 2.1 card, or one without a version, only "Retirer la photo" is offered.
- **Information not shown**: what the card holds that Natel doesn't show (`X-` properties, `IMPP`, `RELATED`…) is never edited and survives every save (invariant 4). Under the form, a link "1 autre information non affichée" ("3 autres informations non affichées"), absent at 0, opens a dialog "Informations non affichées" that says they stay as they are and lists them as the card writes them, in a `<pre>`, so someone who knows vCard can inspect them.
- **Group write failed**: the bottom bar says "Le contact est enregistré, mais ces groupes n’ont pas été mis à jour :", each name with its reason, and for one changed elsewhere offers "Recharger" and "Écraser avec ma version".

## Brand assets

The mark, wordmark, favicon, app icons, manifest, social and README images
live in `docs/brand/`, with their rules in `docs/brand/README.md`; the files
the app serves are copied from there into `public/`. `docs/brand/alternatives/`
holds earlier candidates, for reference only.

- The mark: white tile, red band on the left edge, a red N centred and three
  grey dots to its right. Pick the file by rendered size (≥ 48 px
  `icon/natel-mark.svg`, smaller `icon/natel-mark-small.svg` or `favicon/`).
  Never a white N on a red tile.
- In the app, the header wordmark stays live text (`font-display`), not an
  image.
- `theme-color` is the brand red `#D8261D`, matching the band, and
  `#121316` (the dark background) in dark mode, the system's or the one
  chosen in the settings. The app serves no `og:`
  tags: an instance is private.

## Dark mode

Natel follows the system setting (`prefers-color-scheme`) unless the
settings choose "Clair" or "Sombre" (ADR 026). The dark palette is the brand
kit's: `src/index.css` defines every colour token on `:root` (light) and
again on `:root[data-theme="dark"]`, each with its `color-scheme`, so native
controls and scrollbars follow. `data-theme` is always on `<html>`:
`public/theme.js` sets it before the first paint, from the stored choice or
the system's, so nothing flashes, and `src/lib/theme.ts` follows the system
when it changes while nothing is chosen. Components never name a dark
colour; the tokens carry it, and the `dark:` variant, for the few exceptions
below, matches `data-theme="dark"`.

- Very dark greys, never pure black: `background` #121316 (list, page),
  `muted` #1B1C20, `card` #222328 (fields, a notch lighter than the surface
  they sit on).
- Ink and white swap: the primary pill turns light with dark text.
- `brand` turns lighter (#F04A40) for letters and small marks. Large red
  areas use `brand-surface` (`bg-brand-surface
  text-brand-surface-foreground`), which turns darker (#A11F18) so the
  sign-in panel doesn't glare; in light mode both are the same red.
- Shadows become a 1px light keyline (in the elevation tokens).
- Photos are never dimmed or filtered.
- `tests/lib/contrast.test.ts` checks the audited pairs (text at 4.5:1; the
  A–Z letters, field borders and focus ring at 3:1) in both modes, from the
  hex each token carries in its comment, in both blocks: keep them true,
  and add a pair when a component puts text on a new surface.
- Dialog overlays dim more in dark (`bg-black/40 dark:bg-black/60`).
- The PWA manifest's `background_color` stays white: a manifest can't vary
  by scheme, so an installed Natel shows a white splash in dark mode.

## Demo

Only in the demo build (ADR 025), so a visitor always knows nothing is saved. It has two books, "Runeterra" and "Expédition 33" (ADR 027), so the book switcher and moving a contact have something to show.
- Sign-in: under the form, one line on `bg-secondary` (`rounded-lg px-3.5 py-2.5 text-sm text-foreground`): "Démo : n'importe quel nom d'utilisateur et mot de passe fonctionnent. Rien n'est enregistré."
- Signed in: a "Démo" mark next to the wordmark (`rounded-full bg-secondary px-2 py-0.5 text-caption font-bold text-foreground`, the reminder in its `title`), and under the header bar one centred line in `text-caption text-muted-foreground`, bordered below like the bar, led by an info icon in `text-foreground` to draw the eye: "Démo : rien n'est enregistré, modifiez tout ce que vous voulez."
- On phones, where a contact, a new contact or the settings replace the header, the mark sits in the top bar after "Contacts".

## Still not designed

Offline state.

## Drawn but without a vCard mapping

These elements appear in the references, but which vCard property they read and write is not decided. Don't build them until it is recorded in `docs/DECISIONS.md`.

- **Favourite** (top-right of the contact page): no standard vCard property.
- **"Autre date"** pill: `ANNIVERSARY` is vCard 4.0 only, and cards are created as 3.0 (ADR 008).

## Keyboard shortcuts
Single keys never fire while typing in a field, in a menu, behind a dialog, or with a modifier they don't expect (Shift and AltGr are left to the layout, since some need them for `/` or `?`).

| Key | Where | Does |
|---|---|---|
| `/` | desktop | Focuses the search |
| `↑` / `↓` | desktop | Opens the previous / next contact in the list as shown; with none open, `↓` the first and `↑` the last. A focused row hands its focus on. They don't scroll the page on desktop, except past the list's ends. |
| `N` | everywhere | Opens a new contact, when there is an address book |
| `E` | contact page | Enters edit mode |
| `⌘` / `Ctrl` + `Entrée` | edit mode | Saves, from a field too (`⌘S` belongs to the browser) |
| `Esc` | everywhere | Cancels the edit, closes the dialog, clears the search; closes the settings on desktop |
| `?` | everywhere | Opens "Raccourcis clavier" |

The "Raccourcis clavier" dialog is built like the import dialog once finished: the list as a `<dl>`, keys in the search's `kbd` style (`↑` and `↓` with their names for screen readers, `⌘` on Apple devices, `Ctrl` elsewhere), and one primary "Fermer", which takes the focus. `Esc` or a click outside closes it and gives the focus back. On phones it lists only the keys that work there.

## Motion
- Search filters instantly, no list animation. A–Z jumps are instant.
- Hover/press: colour only, 120ms. Panels, menus, sheets: 200ms fade + 8px slide from where the action came from, `ease-out` from the theme (`cubic-bezier(0.2,0.7,0.2,1)`); exits a third faster with `ease-in`.
- The selection bar slides between rows (150ms) — the only "brand" motion.
- Save: sync icon spins during the request, then turns into a green check.
- `prefers-reduced-motion`: handled globally by the tokens file; don't add motion that bypasses it.

## Copy and i18n
- FR and EN from day one; FR is ~30% longer. No fixed-width buttons. Every icon-only button has a translated `aria-label`.
- Only list-row names and trailing values truncate (full name in `title`, and in full in the detail pane), plus the header's book name on phones (see Header). UI labels wrap.
- French typography: `’` apostrophe, « » with non-breaking spaces, "Aucun résultat" for zero.
- The mobile phone type is labelled "Mobile" in both languages: "Natel", the Swiss word for it, would read as the app's name.
- "E-mail" keeps its hyphen on one line: the strings put a word joiner (U+2060) on each side of it, since Work Sans has no non-breaking hyphen.
- Questions and colons take a non-breaking space before them in French ("Supprimer Ada Lovelace ?").
- Swiss numbers are displayed in local format (`079 000 00 01`), foreign numbers in international format. Store numbers as they are in the vCard; formatting is display only (libphonenumber-js is fine — propose before adding).
- Search is accent-insensitive (NFD + strip marks, plus ł→l, ø→o, đ→d), matches name, org, email and phone digits, and highlights matches with `<mark>`.
- The language defaults to the first of `navigator.languages` Natel has, French when none; an explicit choice is stored in `localStorage` (`natel.preferences`, ADR 019). Languages are listed by their own names ("Français", "English").

## Accessibility checklist
- Text contrast ≥ 4.5:1 and input borders ≥ 3:1, in light and dark (checked by `tests/lib/contrast.test.ts`).
- Every screen and dialog passes axe (WCAG 2.1 A and AA, plus best practices) in light and dark, on desktop and phone (`tests/e2e/a11y.spec.ts`); the states it can't reach against a test server, no address book and an import in progress or failing, are not checked. The "Natel" wordmark of the empty detail pane is a logotype, which WCAG 1.4.3 exempts from contrast: it carries `data-logotype` and the check skips it.
- The `hidden` attribute always wins over display utilities (base layer rule): use it instead of toggling classes.
- List = `<nav aria-label>` + `<ul role="list">`; the current contact has `aria-current="true"`.
- The result count is announced (`aria-live="polite"`).
- `<html lang>` follows the language in use.
- The toasts' live region (`role="status"`) is always in the page, so a toast's text is read when it appears.
