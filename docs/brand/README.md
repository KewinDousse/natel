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
- On a **red background**, surround the tile with a thin white keyline (≈ 3.5 % of the tile width) so the band doesn't merge with the background — as in `social/`.
- The three dots are content, not a menu: keep them large, grey and spread over the N's height; never shrink them into a "⋮".
- Pick the file by rendered size (table above).
- Clear space around the mark: ¼ of its width.

## Wordmark and lockups
| File | Use |
|---|---|
| `logo/natel-wordmark-ink.svg` | Text-like contexts on light backgrounds (docs, README body) |
| `logo/natel-wordmark-red.svg` | Hero use on white (landing, README banner) |
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
| `social/og-image-en.png` / `-fr.png` | 1200×630 | `og:image` of the project page / demo |
| `social/avatar-500.png` | 500×500 | Org / project avatar (full bleed; the platform crops it). Tiny avatars (< 48 px) are rendered by the platform — acceptable, but `icon/natel-mark-small.svg` exists if a site lets you upload a separate small one |
| `readme/banner-{light,dark}-{en,fr}.png` | 1280×320 | Top of the README |

README header that follows GitHub's light/dark theme:

```html
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/brand/readme/banner-dark-en.png">
  <img alt="Natel — a directory for your contacts, on your own server." src="docs/brand/readme/banner-light-en.png">
</picture>
```

The contact names and numbers shown in these images are fictional.

## Regenerating
The PNGs are rendered from the SVGs in this folder. To change a colour or a line of text, edit the SVG and re-export at the same pixel size.
