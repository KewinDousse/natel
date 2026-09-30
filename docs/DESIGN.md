# Natel — Design system ("Annuaire" direction)

This document is the source of truth for Natel's UI. The reference HTML files in
`natel-design/` are **visual references**, not code to copy; that folder is a local
untracked handoff and is never committed. When the two disagree, this document wins.

## Files

| File | Role |
|---|---|
| `src/index.css` (from the handoff `natel-annuaire-tokens.css`) | Tailwind v4 + shadcn tokens, fonts via Fontsource, base layer, `leader` utility |
| `natel-design/natel-annuaire-identite.html` | Design-system reference: palette with contrast ratios, type scale, shapes, motion |
| `natel-design/natel-annuaire-login.html` | Visual reference: sign-in screen |
| `natel-design/natel-annuaire-contacts.html` | Visual reference: list, search, and the contact page in both states (view ⇄ edit). `?fiche` opens it directly, `?edit` opens edit mode |

The reference HTML files were compiled with Tailwind 3 and embed fonts as base64.
**Do not copy their `<style>` block, their inline scripts, the SVG placeholder
portraits, or the dashed "Prototype" panel.** Copy only the class names on
elements; they were chosen to mean the same thing in Tailwind v4.

Dependencies (already in `package.json`): `@fontsource-variable/work-sans`,
`@fontsource-variable/big-shoulders`, `tw-animate-css`. No CDN, no Google Fonts
URL, no remote images — ever.

## Core rules

1. **Directory grammar.** A contact row reads like a Swiss phone directory entry: **Family** Given, dotted leader, primary phone number right-aligned. Default sort is by family name.
2. **Red (`brand`) marks position, never action.** Allowed: wordmark, A–Z group letters, the 3px selection bar, the sign-in panel, the 6px top band. Forbidden: buttons, links, error states, icons meaning "delete".
3. **Primary action = ink pill** (`bg-primary text-primary-foreground rounded-full`). Destructive actions use `destructive`, always with an icon and a text label.
4. **Two typefaces, strict roles.** `font-display` (Big Shoulders 700) only at ≥ 32px: wordmark, group letters, the contact's name and primary number in the detail pane, screen titles. Everything else is `font-sans` (Work Sans 400/700). Never Big Shoulders below 32px, except initials in avatars.
5. **Numbers are tabular.** Phone numbers, dates, counts: `tabular` class (or inside `a[href^="tel:"]` / `<time>`, handled by the base layer).
6. **Nothing that sits on the page has a shadow.** Only floating layers: `shadow-float` (menus, popovers, toasts), `shadow-overlay` (dialogs, mobile sheets).
7. **Photos are rounded squares, not circles.** List: `size-10 rounded-lg`. Detail: `size-28 rounded-xl`. No photo → initials in `font-display` on `bg-avatar`. Organisation-only card → building icon on `bg-avatar`.

## Layout

**Desktop (`lg`, ≥ 1024px):** full-height grid. Header 6px `bg-brand` band + 64px bar. Below: list pane `minmax(26rem,34rem)` (own scroll, `border-r`) + detail pane `1fr` on `bg-muted` (own scroll). Detail content max width `44rem`.

**Mobile (< 1024px):** page scroll. Sticky header = band + 56px row (wordmark, address-book switcher, settings, round "+" button, sign out) + search row, on one row down to 320px. No detail pane: opening a contact is a separate route.

Sticky offsets: use `--header-h` (exposed on the header) with `top-[var(--header-h)]`; do not hardcode pixel offsets.

## Components

Recipes below are the exact class sets from the references. Build them as React components; use shadcn primitives (Button, Input, DropdownMenu, Dialog, Sheet…) and restyle them with these classes rather than keeping shadcn's defaults.

### Header
- Band: `h-1.5 bg-brand`.
- Wordmark: `font-display text-[2rem] font-bold leading-none` — plain text "Natel", ink colour in the app header (red only on the sign-in panel and the identity page).
- Address-book switcher: `rounded-full px-2.5 h-8 text-sm font-bold text-muted-foreground hover:bg-muted` + chevron. On phones it takes the room the actions leave and truncates the book name, which the menu shows in full; the menu spans the header's width, 1rem from each edge.
- Book menu, below the books and a separator (ADR 020): "Exporter « Contacts »" (download icon) saves the selected book as `<name>.vcf`, disabled (`aria-disabled`, muted, still focusable) while the book shows no contact; "Importer un fichier .vcf…" (upload icon) opens the file picker (`.vcf`, `text/vcard`). An export that fails says so in a toast.
- Import dialog: built like the discard dialog, titled "Importer dans « Contacts »". While cards are sent it shows "12 / 40" (`tabular`, `aria-live="polite"`) and can't be dismissed; then the counts (imported, already in the book, failed, the last in `text-destructive` when not zero), the failed cards by name (or "Carte 3") with their reason in `text-muted-foreground`, and a primary "Fermer", which takes the focus. `Esc` closes it once finished. The list behind shows each contact as it is created; closing leaves the user on the list, nothing selected.
- Search: `h-11 lg:h-10 rounded-full border border-input bg-background pl-10 pr-11 text-base lg:text-[0.9375rem]`, search icon left, `/` kbd hint on desktop when empty, clear button when not empty. `/` focuses it, `Esc` clears it.
- Sync status (xl only): check icon in `text-success` + "Synchronisé il y a 2 min".
- Settings: ghost icon link (gear, `size-10 rounded-full text-muted-foreground hover:bg-muted`), accessible name and tooltip "Paramètres", on phones and desktop. Opens `/contacts/settings`; being a link, an unsaved edit gets the discard dialog first.
- New contact: round ink "+" link (`size-10 rounded-full bg-primary text-primary-foreground`) after the settings link, shown once the server has an address book. Opens `/contacts/new`.
- Sign out: ghost icon button (log-out icon) last, always present, even with no address book. Accessible name and tooltip "Se déconnecter". It navigates to `/logout`, so an unsaved edit gets the discard dialog first.

### Group (letter section)
```html
<section class="grid grid-cols-[2.75rem_1fr] sm:grid-cols-[4rem_1fr] lg:grid-cols-[4.25rem_1fr] border-t first:border-t-0 py-2">
  <h2 class="sticky top-[var(--header-h)] lg:top-2 self-start pl-2 pt-2 font-display text-[2.25rem] sm:text-[2.75rem] lg:text-index font-bold leading-[0.8] text-brand">B</h2>
  <ul role="list">…rows…</ul>
</section>
```

### Contact row
- Link: `group relative flex items-center gap-3 rounded-lg px-2 min-h-[3.5rem] py-1.5 sm:min-h-[3.25rem] sm:py-0 hover:bg-muted aria-[current=true]:bg-selection`.
- Selection bar: `absolute inset-y-2.5 left-0 w-[3px] rounded-full bg-brand opacity-0 group-aria-[current=true]:opacity-100`.
- Content wrapper: `min-w-0 flex-1 sm:flex sm:items-center sm:gap-3`.
  - Name: `block min-w-0 truncate text-base sm:text-[0.9375rem]` → the part the list is sorted by comes first, in bold: `<b class="font-bold">Family</b> Given` by last name, `<b class="font-bold">Given</b> Family` by first name. Full name, in the same order, in `title`.
  - Leader: `<span class="leader hidden sm:block" aria-hidden="true">`.
  - Trailing value: primary phone (`tabular`, ink on ≥ sm) or, if none, email/org (`text-sm text-muted-foreground`, truncated, `sm:max-w-[42%]`).
- **Mobile (< 640px):** trailing value drops under the name, leader hidden. This is deliberate: single-line rows truncate names too much on phones.

Trailing value priority: first `TEL` with `TYPE=cell` → first `TEL` → first `EMAIL` → `ORG`.

### A–Z rail
Right edge. All 26 letters in `font-display text-[0.8125rem] font-bold`, present letters `text-foreground`, absent `text-leader` + `aria-hidden` + `tabindex=-1`. Anchors jump to `#g-X` without smooth scrolling. Hidden while a search query is active.
- Touch: sliding a finger along the rail follows the letter under it, as native contact apps do; an absent letter lands on the next present one (or the last one before it). The rail takes `touch-none` so the page doesn't scroll meanwhile.
- From `lg`, the list scrolls in its own pane and the rail sits outside it (`lg:mr-8` on the list), so the whole scrollbar stays clickable.

### List toolbar
Count (`text-caption text-muted-foreground`, `aria-live="polite"`) on the left; sort toggle "Nom / Prénom" on the right (small pills, `aria-pressed`).

### Buttons
| Kind | Classes |
|---|---|
| Primary | `inline-flex h-10 items-center gap-2 rounded-full bg-primary px-4 text-sm font-bold text-primary-foreground hover:bg-primary/85` |
| Outline | `… rounded-full border border-input bg-background px-4 text-sm font-bold hover:bg-accent` |
| Ghost icon | `inline-flex size-10 items-center justify-center rounded-full text-muted-foreground hover:bg-background hover:text-foreground` + translated `aria-label` |
| Destructive | same as Primary with `bg-destructive text-destructive-foreground`, always icon + label |

Touch targets are ≥ 40px (44–48px on mobile forms). Every interactive element has `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`.

### Form fields
`h-12 lg:h-11 rounded-md border border-input bg-card px-3.5 text-base lg:text-[0.9375rem]`. Labels above, `text-sm font-bold`. Hint below in `text-caption text-muted-foreground`, linked with `aria-describedby`. Invalid: `aria-invalid="true"` → `border-destructive`. Mobile inputs stay at 16px (prevents iOS zoom).

### Sign-in screen
Desktop: `grid-cols-[5fr_6fr]`. Left: full-height `bg-brand` panel, directory excerpt (4 rows with leaders, white) at the top, tagline + giant wordmark (`font-display`, `clamp(8rem,13vw,13rem)`, `leading-[0.78]`) at the bottom. Right: a compact language select top-right ("Langue" label, `h-9 px-2.5 text-sm` select), form centred, `max-w-[24rem]`. Mobile: red block on top (language select, wordmark 6.5rem, tagline), form below. On the red panel, restyle the select by overriding CSS variables locally (see the reference file) rather than adding new colours. The select writes the same preference as the settings page (ADR 019).

The form has two fields, username and password. There is no server field: the CardDAV server is set by the operator (ADR 014).

Connection errors appear above the form in a `border-destructive/40 bg-destructive/5` box with an alert icon, saying what failed and what to do. The two cases are wrong credentials and the CardDAV server not answering behind the proxy.

## Contact page: one skeleton, two states

Clicking a contact opens its page **in view mode**. "Modifier" switches the *same page* to edit mode. There is no separate form screen, and **no text moves when switching**: the prototype measures identical positions (±0px) for the name and the address in both states, desktop and mobile. Keep it that way.

Why view first: people mostly look up, call and copy. Numbers must stay `tel:` links, and a keyboard must not pop up on mobile just to read. Per-field autosave is ruled out: each save is a full vCard PUT with `If-Match`, so autosave multiplies conflicts and makes "cancel" impossible.

### Settings
`/contacts/settings` (ADR 019), a child of the contacts layout like the new contact. Desktop: in the detail pane, in the contact page's `max-w-[44rem]` column. Mobile: its own screen, with the contact page's top bar (back "Contacts" left, "Paramètres" right). A `font-display` title at the contact name's size, then one labelled `<select>` per preference in the form-field recipe (`max-w-sm`). The language select lists "Langue du navigateur" then each language by its own name. A change applies at once; there is no save button. Back, or `Esc` on desktop, returns to `/contacts`.

### New contact
`/contacts/new` is the same page on a blank vCard 3.0 card, in edit mode only: no view state to switch back to. The top-right label (mobile top bar, desktop "Modification" slot) reads "Nouveau contact", the avatar shows the initials as they are typed, and empty name/job/org fields show their label as placeholder. Save creates the card in the selected book (`If-None-Match: *`) and lands on its page in view mode; cancel goes back to the list. A 412 on create is an error, not an edit conflict.

### The trick: stacked cells with identical boxes
Every editable value is a **cell** that stacks its view element and its field in the same grid area:

```html
<div class="grid min-w-0 [&>*]:[grid-area:1/1]">
  <!-- view: same box as the input, transparent border -->
  <div class="flex h-11 items-center rounded-md border border-transparent px-3.5 … group-data-[mode=edit]/fiche:invisible group-data-[mode=edit]/fiche:opacity-0 transition-opacity">…</div>
  <!-- edit: the real field -->
  <input class="h-11 rounded-md border border-input bg-card px-3.5 … invisible opacity-0 group-data-[mode=edit]/fiche:visible group-data-[mode=edit]/fiche:opacity-100 transition-opacity">
</div>
```

The page root is `<article class="group/fiche" data-mode="view|edit">`. The view element uses **exactly** the input's height, border width, radius and padding, so the text sits on the same pixel; switching only fades the frame and background in (200ms). `invisible` (not just `opacity-0`) keeps hidden fields out of the tab order. Build this as one `<EditableCell view={…} edit={…}>` component and use it everywhere.

Section bodies use `-mx-3.5` so view text aligns with the section title while field frames bleed into the margin.

### Rows
One grid per value, same in both states:
- `sm+`: `grid-cols-[8.5rem_1fr_auto]` → **type** | **value** | **action**.
- `< 640px`: type and action share line 1 (`h-9`), value on line 2, rows `space-y-3`.

| Column | View | Edit |
|---|---|---|
| Type | "Natel", "Travail"… (`text-sm font-bold text-muted-foreground`) | `<select>` (same box) |
| Value | `tel:`/`mailto:` link or text | `<input>` |
| Action | copy button | remove button (trash, `hover:text-destructive`) |

The primary number (first `TYPE=cell`, else first TEL) is `text-xl font-bold` **in both states**, so it stays prominent without a separate "hero" block. Points de conduite (dotted leaders) are used in the list only, not on the contact page: they require right-aligned values, which fields cannot have.

Address: one row, the value column holds street / NPA + Localité (`grid-cols-[5.5rem_1fr]`) / Pays, each an editable cell. Birthday, groups and note: the value spans the type column (no type), plus an action column.

### Page, top to bottom (both states)
1. Mobile only: 56px top bar — back ("Contacts") left; right: "Modifier" pill in view, "Modification" label in edit (stacked, no reflow).
2. Photo (`size-24 sm:size-28 rounded-xl`) + top-right: favourite, and on desktop "Modifier" (with `E` kbd hint) ⇄ "Modification" label.
3. Name: family then given (muted), each an editable cell in `font-display` at `text-[2.25rem] sm:text-[2.75rem] lg:text-person`, fixed heights `h-12 sm:h-14 lg:h-15`. In edit, a small label ("Nom", "Prénom") sits inside the field on the right (≥ sm). Use a visually hidden `<h1>` for the accessible name.
4. Job title | Organisation: two editable cells side by side (`sm:grid-cols-2`), muted.
5. Action row, stacked: view = Appeler (primary), SMS, Écrire; edit = Changer la photo, Retirer la photo. Same height, no reflow.
6. Sections Téléphones, E-mails, Adresse, Anniversaire, Groupes, Note — **same order in both states**, each opened by `border-t-2 border-foreground` and a 44px title line. The title line's right slot is stacked: view = pencil icon (shown on hover on devices that hover, always on touch) that enters edit mode **focused on that section**; edit = "+ Ajouter".
7. Only below the content, so nothing above shifts: view = "Modifié le … sur <host>"; edit = "Ajouter : Site web, Surnom, Autre date" pills (empty sections are added here, never inserted in the middle), the preserved-fields notice (hide when 0), and "Supprimer le contact".
8. Edit only: sticky bottom bar — dirty indicator, Annuler / Enregistrer. The ETag conflict banner appears **inside this bar**, above the buttons, so it never pushes the content.

### Switching
- Enter: "Modifier", the `E` key, a section pencil (focuses the first field of that section), or `?edit` in the URL. Same route on mobile (`/contacts/:id` and `/contacts/:id?edit`).
- Before toggling, record the `getBoundingClientRect().top` of an anchor (the section being edited, the focused section, or the first visible one); after toggling, `scrollBy` the difference. The skeleton makes this a no-op in practice; it is the safety net for empty sections and validation messages.
- Leave: Enregistrer (spinner "Enregistrement…", then back to view with the view text synced from the fields, toast "Enregistré"), Annuler or `Esc` (dialog "Abandonner les modifications ?" if dirty, else straight back, restoring the original values), back arrow on mobile (same rule).

### States
- **Field error**: `aria-invalid="true"` + message under the field (`text-destructive`, `aria-describedby`). Validate on blur and on save, not on each keystroke.
- **ETag conflict (412)**: warning box in the bottom bar, "Ce contact a été modifié ailleurs.", actions Recharger (primary) / Écraser avec ma version (outline). Never overwrite silently.
- **Discard dialog**: `font-display` 2rem title, `rounded-xl shadow-overlay`, bottom sheet on mobile, centred on desktop, actions "Continuer l'édition" / "Abandonner" (destructive).
- **Move** (ADR 021): an outline button "Déplacer vers un autre carnet" (arrow icon) right above "Supprimer le contact", absent on a new contact and when the account has a single book. Disabled while the draft has unsaved changes, with the hint "Enregistrez ou annulez vos modifications d'abord." below it. It opens a dialog built like the delete dialog: "Déplacer ce contact ?", the other books as native radio buttons in a `fieldset` (none chosen at first), "Annuler" / "Déplacer" (primary, disabled until a book is chosen). While the move runs, "Déplacer" shows a spinner and "Déplacement…" and nothing in the dialog responds. Success lands on the contact's page in the target book, now selected, with the toast "Déplacé vers « Travail »". A failure keeps the page in edit mode with the message in the bottom bar; a card changed or gone elsewhere shows the conflict box with "Recharger" only.
- **Delete**: "Supprimer le contact" (destructive, trash icon) is the last element below the content in edit mode, absent on a new contact. It opens a dialog built like the discard dialog: "Supprimer ce contact ?", actions "Annuler" / "Supprimer" (destructive, trash icon). A 412 shows the conflict box in the bottom bar with "Recharger" only: there is no version of the user's to push, and deleting a card changed elsewhere unseen is exactly what the ETag prevents.
- Unknown vCard properties are never displayed or edited and must survive the round trip.

### Known small shifts (accepted)
- Birthday: "14 mars" (view) becomes Jour / Mois / Année fields.
- Groups: chips gain a × and an "Ajouter un groupe" input at the end of the line.
- Validation messages and a newly added row push what's below them (user-triggered, expected).

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
- `theme-color` is the brand red `#D8261D`, matching the band; the kit's
  dark `theme-color` waits for dark mode. The app serves no `og:` tags: an
  instance is private.

## Still not designed

Empty address book (one Big Shoulders line at `text-display` size + one primary action), offline state, dark mode (the `.dark` tokens are a **sketch**: don't ship a theme toggle until it's reviewed).

## Drawn but without a vCard mapping

These elements appear in the references, but which vCard property they read and write is not decided. Don't build them until it is recorded in `docs/DECISIONS.md`.

- **Favourite** (top-right of the contact page): no standard vCard property.
- **Groups** section: shown read-only from `CATEGORIES`. Editing waits for the `CATEGORIES` vs `KIND:group` decision planned for phase 3 (see `ROADMAP.md`).
- **"Autre date"** pill: `ANNIVERSARY` is vCard 4.0 only, and cards are created as 3.0 (ADR 008).

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
- The mobile phone type is labelled **"Natel"** in French, "Mobile" in English.
- Swiss numbers are displayed in local format (`079 318 44 27`), foreign numbers in international format. Store numbers as they are in the vCard; formatting is display only (libphonenumber-js is fine — propose before adding).
- Search is accent-insensitive (NFD + strip marks, plus ł→l, ø→o, đ→d), matches name, org, email and phone digits, and highlights matches with `<mark>`.
- The language defaults to the first of `navigator.languages` Natel has, French when none; an explicit choice is stored in `localStorage` (`natel.preferences`, ADR 019). Languages are listed by their own names ("Français", "English").

## Accessibility checklist
- Text contrast ≥ 4.5:1 and input borders ≥ 3:1 (already true for every token pair — see the identity page).
- The `hidden` attribute always wins over display utilities (base layer rule): use it instead of toggling classes.
- List = `<nav aria-label>` + `<ul role="list">`; the current contact has `aria-current="true"`.
- The result count is announced (`aria-live="polite"`).