/**
 * Renders the brand images that carry text (README banners, social images)
 * into docs/brand, from the mark, the wordmark and the app's fonts. Text is
 * set live here rather than outlined in SVG, so new wording or a new language
 * is one entry below, not a redrawing.
 *
 * Usage: pnpm brand:images
 */

/// <reference types="node" />

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";

const root = resolve(import.meta.dirname, "..");
const brand = resolve(root, "docs/brand");

/** Headline per language; the subline is the app's own `tagline`. */
const HEADLINES: Record<string, string> = {
  en: "The contact editor your CardDAV server is missing.",
};

const RED = "#D8261D";
// brand-surface in dark mode, as on the sign-in panel
const RED_DARK = "#A11F18";
const TABS = ["A–B", "C–D", "E–G", "H–K", "L–M", "N–P", "Q–S", "T–V", "W–Z"];
const CURRENT_TAB = "N–P";

async function dataUrl(path: string, type: string): Promise<string> {
  return `data:${type};base64,${(await readFile(path)).toString("base64")}`;
}

async function subline(lang: string): Promise<string> {
  const messages: unknown = JSON.parse(
    await readFile(resolve(root, `src/i18n/${lang}.json`), "utf8"),
  );
  const tagline =
    typeof messages === "object" && messages !== null && "tagline" in messages
      ? messages.tagline
      : undefined;
  if (typeof tagline !== "string" || tagline === "") {
    throw new Error(`src/i18n/${lang}.json has no tagline`);
  }
  return tagline;
}

function escapeHtml(text: string): string {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;");
}

type Assets = { font: string; mark: string; wordmark: string };

function tabs(red: string, label: number, line: number): string {
  const items = TABS.map(
    (tab) => `<li style="${tab === CURRENT_TAB ? `background:#fff;color:${red}` : ""}">${tab}</li>`,
  ).join("");
  return `<ul class="tabs" style="--label:${label}px;--line:${line}px">${items}</ul>`;
}

function page(assets: Assets, red: string, body: string): string {
  return `<!doctype html><html><head><style>
@font-face{font-family:"Work Sans";src:url(${assets.font}) format("woff2");font-weight:100 900}
*{box-sizing:border-box;margin:0;padding:0}
body{background:${red};color:#fff;font-family:"Work Sans";position:relative;overflow:hidden;width:100vw;height:100vh}
.abs{position:absolute}
.trim{text-box:trim-both cap alphabetic}
.tabs{position:absolute;top:0;right:0;bottom:0;width:84px;list-style:none;display:flex;flex-direction:column;
  border-left:var(--line) solid rgb(255 255 255 / 35%)}
.tabs li{flex:1;display:grid;place-items:center;font-weight:700;font-size:var(--label);
  border-bottom:var(--line) solid rgb(255 255 255 / 35%)}
</style></head><body>${body}</body></html>`;
}

/** Sign-in panel at full size: mark and subline, headline, giant wordmark. */
function social(assets: Assets, lang: { headline: string; subline: string }, height: number) {
  // The headline and wordmark sit 10 px lower on the taller GitHub preview.
  const shift = height - 630;
  return page(
    assets,
    RED,
    `${tabs(RED, 20, 1.5)}
<div class="abs" style="left:80px;top:80px;width:111.2px;height:111.2px;border-radius:24.9px;background:#fff;padding:3.6px">
  <img src="${assets.mark}" width="104" height="104"></div>
<p class="abs trim" style="left:219.2px;bottom:${height - 144.24}px;font-size:24px;opacity:.85;white-space:nowrap">${escapeHtml(lang.subline)}</p>
<p class="abs trim" style="left:80px;bottom:${height - 291.52 - shift}px;font-size:34px;font-weight:700;white-space:nowrap">${escapeHtml(lang.headline)}</p>
<img class="abs" src="${assets.wordmark}" style="left:80px;top:${327.52 + shift}px;width:528px;height:222.48px">`,
  );
}

/** README banner: wordmark on the left, headline over two lines and subline beside it. */
function banner(assets: Assets, lang: { headline: string; subline: string }, red: string) {
  return page(
    assets,
    red,
    `${tabs(red, 17, 1)}
<img class="abs" src="${assets.wordmark}" style="left:80px;top:90px;width:336px;height:141.58px">
<h1 class="abs trim" style="left:464px;top:90px;width:600px;font-size:34px;line-height:44px;text-wrap:balance">${escapeHtml(lang.headline)}</h1>
<p class="abs trim" style="left:464px;bottom:90px;font-size:24px;opacity:.85;white-space:nowrap">${escapeHtml(lang.subline)}</p>`,
  );
}

async function main() {
  const assets: Assets = {
    font: await dataUrl(
      resolve(
        root,
        "node_modules/@fontsource-variable/work-sans/files/work-sans-latin-wght-normal.woff2",
      ),
      "font/woff2",
    ),
    mark: await dataUrl(resolve(brand, "icon/natel-mark.svg"), "image/svg+xml"),
    wordmark: await dataUrl(resolve(brand, "logo/natel-wordmark-white.svg"), "image/svg+xml"),
  };
  const shots: { file: string; width: number; height: number; html: string }[] = [];
  for (const [code, headline] of Object.entries(HEADLINES)) {
    const lang = { headline, subline: await subline(code) };
    shots.push(
      {
        file: `readme/banner-light-${code}.png`,
        width: 1280,
        height: 320,
        html: banner(assets, lang, RED),
      },
      {
        file: `readme/banner-dark-${code}.png`,
        width: 1280,
        height: 320,
        html: banner(assets, lang, RED_DARK),
      },
      {
        file: `social/og-image-${code}.png`,
        width: 1200,
        height: 630,
        html: social(assets, lang, 630),
      },
    );
    // GitHub takes a single social preview, in the README's language.
    if (code === "en") {
      shots.push({
        file: "social/github-social-preview.png",
        width: 1280,
        height: 640,
        html: social(assets, lang, 640),
      });
    }
  }

  // Same browser as the e2e configs, which the web sandbox points elsewhere.
  const browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
  });
  try {
    for (const shot of shots) {
      const tab = await browser.newPage({ viewport: { width: shot.width, height: shot.height } });
      await tab.setContent(shot.html);
      await tab.evaluate(() => document.fonts.ready);
      // A longer wording would run under the tabs rather than wrap.
      const overflow = await tab.evaluate(() => {
        const tabs = document.querySelector(".tabs")?.getBoundingClientRect().left ?? Infinity;
        return [...document.querySelectorAll("p, h1")].some(
          (text) => text.getBoundingClientRect().right > tabs,
        );
      });
      if (overflow) throw new Error(`${shot.file}: text runs under the tabs`);
      await tab.screenshot({ path: resolve(brand, shot.file) });
      await tab.close();
      console.log(shot.file);
    }
  } finally {
    await browser.close();
  }
}

await main();
