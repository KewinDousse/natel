# Natel — brand kit

Everything is generated from the tokens of the "Annuaire" direction: red `#D8261D`, ink `#17181C`, white. Wordmark: Big Shoulders Bold, **converted to outlines** — the SVGs need no font.

## The mark
A white tile with a **red band on its left edge** — the spine / index tabs of an address book. A red **N**, centred on the tile — the group letter of the A–Z list. To its right, **three grey dots** stacked vertically: the entries of that section.

Reference geometry (1024 px tile): band 133 px wide; N cap height 614 px, centred horizontally and vertically on the tile (the dots are *not* included in the centring); dots Ø 88 px, centres at x 825 and y 336 / 512 / 687, i.e. 88 px of white between the N and the dots.

The same drawing everywhere, in three weights chosen by rendered size:

| Rendered size | File | Adjustments |
|---|---|---|
| **≥ 48 px** | `icon/natel-mark.svg` | reference geometry, dots `#9C9EA5` |
| **24–40 px** | `icon/natel-mark-small.svg`, `favicon/favicon.svg` | bigger N and dots, dots `#8A8C92` |
| **16 px** | `favicon/favicon-16.svg` | thinner band, bigger N; the dots merge into a grey stroke, which is expected |

Other variants:

| File | Use |
|---|---|
| `icon/natel-mark-ink.svg` | Ink tile (dots `#6B6E75`), for mid-tone or busy backgrounds |
| `icon/natel-mark-mono.svg` | Single colour (`currentColor`: outlined tile, solid band, N and dots): docs, stamps, CSS masks |
| `alternatives/` | Earlier candidates (top band, bars, N only…). **Reference only — don't use.** |

Rules:
- The band is always on the **left** edge, always red. Never a white N on a red tile.
- On a **red background**, surround the tile with a thin white keyline (≈ 3.5 % of the tile width) so the band doesn't merge with the background — as on natel.app.
- The three dots are content, not a menu: keep them large, grey and spread over the N's height; never shrink them into a "⋮".
- Pick the file by rendered size (table above).
- Clear space around the mark: ¼ of its width.

## Wordmark and lockups
| File | Use |
|---|---|
| `logo/natel-wordmark-ink.svg` | Text-like contexts on light backgrounds (docs, README body) |
| `logo/natel-wordmark-red.svg` | Hero use on white (landing) |
| `logo/natel-wordmark-white.svg` | On red or ink |
| `logo/natel-lockup-light.svg` / `-dark.svg` | Mark + wordmark, for places that need both (about dialog, docs header). Use when the mark renders ≥ 48 px; smaller, place `icon/natel-mark-small.svg` next to the wordmark yourself |

In the app itself the header keeps **live text** "Natel" in `font-display` (it's the same font), so it stays crisp and translatable-free. Use the SVG only outside the app.

Don't stretch, don't add letter-spacing, don't set it in another font, don't put the red wordmark on the red background.

## Favicon & app icons
Copy to the app's `public/`:

```
public/
  favicon.ico            ← favicon/favicon.ico (16, 32, 48)
  favicon.svg            ← favicon/favicon.svg (small drawing)
  manifest.webmanifest   ← manifest.webmanifest
  icons/
    apple-touch-icon.png ← app-icons/apple-touch-icon.png (180, full bleed, iOS rounds it)
    icon-192.png         ← app-icons/icon-192.png
    icon-512.png         ← app-icons/icon-512.png
    icon-maskable-512.png← app-icons/icon-maskable-512.png (content inside the 80 % safe zone)
```

Then paste `head-snippet.html` into `index.html`. PWA icons are full-bleed squares on purpose: the OS applies its own mask. `*-master.svg` are the 1024 px sources.

## Social & README
| File | Size | Use |
|---|---|---|
| `social/github-social-preview.png` | 1280×640 | GitHub → Settings → Social preview |
| `social/og-image-en.png` | 1200×630 | `og:image` of the project page / demo |
| `social/avatar-500.png` | 500×500 | Org / project avatar (full bleed; the platform crops it). Tiny avatars (< 48 px) are rendered by the platform — acceptable, but `icon/natel-mark-small.svg` exists if a site lets you upload a separate small one |
| `readme/banner-{light,dark}-en.png` | 1280×320 | Top of the README |

README header that follows GitHub's light/dark theme:

```html
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/brand/readme/banner-dark-en.png">
  <img alt="Natel: the contact editor your CardDAV server is missing." src="docs/brand/readme/banner-light-en.png">
</picture>
```

The social images and the README banners take up the sign-in panel: the red, the headline and the giant wordmark. The README banners also carry its thumb-index tabs on the right edge (N–P stands out); the social images leave them out, since they would leave the browser window too little room to show whole. The dark banners use the dark-mode red (`#A11F18`), as the sign-in panel does, so they don't glare.

The social images leave the subline out: a shared preview is often shown at a third of its size or less, where it can't be read. They sit on a single 64 px margin, at the edges and between the columns: on the left the headline at the top and the wordmark at the bottom, on the right a whole browser window on the demo's contact list and a contact's page. The window says what Natel is, where the wordmark can't, and the 16 px favicon in its address bar stands in for the mark. A desktop rather than a phone, since Natel is the editor a CardDAV server lacks in the browser: a phone alone reads as a rival to the phone's own contacts app. The README banners show no contact.

## Tagline
| | |
|---|---|
| Headline | The contact editor your CardDAV server is missing. |
| Subline | A directory for your contacts, on your own server. |

The headline says what Natel is and who it is for, people who already run a CardDAV server. The subline is the app's own `tagline` (`src/i18n/`), so the README banners and the sign-in panel say the same thing; the app shows only that line, since whoever reads it already uses Natel. Headline in Work Sans Bold, subline in Work Sans Regular at 85 % white.

## Regenerating
The README banners and the social images (not the avatar) are rendered by `pnpm brand:images` (`scripts/brand-images.ts`), with Playwright: the text is set live in Work Sans, the favicon and the wordmark come from `favicon/` and `logo/`. The headline is in that script and the subline is read from `src/i18n/`, so new wording needs no redrawing. A language given a headline there gets its own banners and `og:image`; GitHub's social preview stays in English, like the README.

The other PNGs are rendered from the SVGs in this folder: after editing an SVG, re-export it at the same pixel size.

## Screenshots
The README's screenshots (`docs/screenshots/`), the window on the social images and the website's screenshots come from the demo build, signed in, with its reminders hidden: they show the app as someone using it sees it. `pnpm brand:images` builds the demo and renders them with the images above (`scripts/demo-screens.ts`). With `--site <dir>`, it also writes the website's set (`desktop-*` with Caitlyn Kiramman's page, `mobile-*` on the list; light and dark, 1x and 2x) and its `og:image` into `<dir>`, the natel.app repository's `assets/img`; a relative path starts at the repository root. The phone on the social images shows the app in English, whatever the image's language.
