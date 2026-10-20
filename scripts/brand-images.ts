/**
 * Renders the brand images that carry text (README banners, social images)
 * into docs/brand, from the mark, the wordmark and the app's fonts, and the
 * README's screenshots into docs/screenshots, from the demo build. Text is
 * set live here rather than outlined in SVG, so new wording or a new language
 * is one entry below, not a redrawing.
 *
 * Usage: pnpm brand:images [--site <dir>]
 * With --site, also writes the website's screenshots and og:image into <dir>,
 * the natel.app repository's assets/img.
 */

/// <reference types="node" />

import { access, copyFile, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { type Browser, chromium } from "@playwright/test";
import { capture, type Screen, startDemo } from "./demo-screens.ts";

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

type Assets = { font: string; mark: string; wordmark: string; phone: string };

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

/**
 * Mark with the headline balanced beside it, giant wordmark, and the contact
 * list on a phone, which says what Natel is where the wordmark can't. No
 * subline: shared previews are shown a third of their size or less, where it
 * can't be read.
 */
function social(assets: Assets, headline: string, height: number) {
  // The wordmark and the phone sit 10 px lower on the taller GitHub preview.
  const shift = height - 630;
  return page(
    assets,
    RED,
    `${tabs(RED, 20, 1.5)}
<div class="abs" style="left:80px;top:80px;width:111.2px;height:111.2px;border-radius:24.9px;background:#fff;padding:3.6px">
  <img src="${assets.mark}" width="104" height="104"></div>
<h1 class="abs boxed" style="left:227px;top:55.6px;width:540px;height:160px;display:flex;align-items:center;font-size:42px;line-height:50px;text-wrap:balance">${escapeHtml(headline)}</h1>
<img class="abs" src="${assets.wordmark}" style="left:80px;top:${300 + shift}px;width:600px;height:252.81px">
<div class="abs" style="right:122px;top:${80 + shift}px;width:286px;border-radius:44px;background:#111;padding:10px;box-shadow:0 24px 60px rgb(0 0 0 / 30%)">
  <img src="${assets.phone}" style="display:block;width:266px;border-radius:34px"></div>`,
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

/** The contact whose page the screenshots open. */
const CAITLYN = "Caitlyn Kiramman";

/** The README's screenshots, in docs/screenshots. */
const README_SCREENS: Record<string, Screen> = {
  "desktop.png": { width: 1280, height: 900, scale: 1, dark: false, contact: CAITLYN },
  "mobile.png": { width: 390, height: 806, scale: 3, dark: false, contact: CAITLYN },
};

/**
 * The website's screenshots, light and dark, at 1x and 2x: the desktop with
 * Caitlyn Kiramman's page open, and the phone on the list and on her page, so
 * a width that shows only phones still shows the directory.
 */
function siteScreens(): Record<string, Screen> {
  const screens: Record<string, Screen> = {};
  for (const [name, width, height, contact] of [
    ["desktop", 1280, 900, CAITLYN],
    ["mobile", 390, 806, undefined],
    ["mobile-contact", 390, 806, CAITLYN],
  ] as const) {
    for (const dark of [false, true]) {
      for (const scale of [1, 2]) {
        const file = `${name}-${dark ? "dark" : "light"}${scale === 2 ? "@2x" : ""}.png`;
        screens[file] = { width, height, scale, dark, contact };
      }
    }
  }
  return screens;
}

async function main() {
  const { values } = parseArgs({ options: { site: { type: "string" } } });
  // Fails before the build; pnpm runs from the repository root, where a relative path starts.
  if (values.site) await access(values.site);
  // Same browser as the e2e configs, which the web sandbox points elsewhere.
  const browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
  });
  try {
    const demo = await startDemo(root);
    let phone: Buffer;
    try {
      phone = await capture(browser, demo, {
        width: 390,
        height: 900,
        scale: 3,
        dark: false,
      });
      for (const [file, screen] of Object.entries(README_SCREENS)) {
        await writeFile(
          resolve(root, "docs/screenshots", file),
          await capture(browser, demo, screen),
        );
        console.log(`screenshots/${file}`);
      }
      if (values.site) {
        for (const [file, screen] of Object.entries(siteScreens())) {
          await writeFile(resolve(values.site, file), await capture(browser, demo, screen));
          console.log(`${values.site}/${file}`);
        }
      }
    } finally {
      await demo.close();
    }
    await render(browser, `data:image/png;base64,${phone.toString("base64")}`);
    if (values.site) {
      await copyFile(
        resolve(brand, "social/og-image-en.png"),
        resolve(values.site, "og-image-en.png"),
      );
      console.log(`${values.site}/og-image-en.png`);
    }
  } finally {
    await browser.close();
  }
}

async function render(browser: Browser, phone: string) {
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
    phone,
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
        html: social(assets, headline, 630),
      },
    );
    // GitHub takes a single social preview, in the README's language.
    if (code === "en") {
      shots.push({
        file: "social/github-social-preview.png",
        width: 1280,
        height: 640,
        html: social(assets, headline, 640),
      });
    }
  }

  for (const shot of shots) {
    const tab = await browser.newPage({ viewport: { width: shot.width, height: shot.height } });
    await tab.setContent(shot.html);
    await tab.evaluate(() => document.fonts.ready);
    // A longer wording would run under the tabs, or out of the social headline's box.
    const overflow = await tab.evaluate(() => {
      const tabs = document.querySelector(".tabs")?.getBoundingClientRect().left ?? Infinity;
      return (
        [...document.querySelectorAll("p, h1")].some(
          (text) => text.getBoundingClientRect().right > tabs,
        ) ||
        [...document.querySelectorAll(".boxed")].some(
          (text) => text.scrollHeight > text.clientHeight || text.scrollWidth > text.clientWidth,
        )
      );
    });
    if (overflow) throw new Error(`${shot.file}: text runs out of its room`);
    await tab.screenshot({ path: resolve(brand, shot.file) });
    await tab.close();
    console.log(shot.file);
  }
}

await main();
