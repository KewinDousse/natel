/**
 * Renders the brand images that carry text (README banners, social images)
 * into docs/brand, from the mark, the wordmark and the app's fonts, and the
 * README's screenshots into docs/screenshots and the manifest's into
 * public/screenshots, from the demo build. Text is
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

/** Headline per language. */
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

function escapeHtml(text: string): string {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;");
}

type Assets = { font: string; favicon: string; wordmark: string; screen: string };

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
 * On one margin all round, also between the columns: the headline at the top
 * left, the wordmark at the bottom left, and a whole browser window on the
 * app's list and a contact's page on the right. No thumb-index tabs: they
 * would leave the window too little room. A desktop rather than a phone: Natel
 * is the editor a CardDAV server lacks in the browser, and a phone alone reads
 * as a rival to the phone's own contacts app. No subline: shared previews are
 * shown a third of their size or less, where it can't be read.
 */
function social(assets: Assets, headline: string) {
  const margin = 64;
  const wordmark = { width: 420, height: 176.97 };
  return page(
    assets,
    RED,
    `<h1 class="abs trim boxed" style="left:${margin}px;top:${margin}px;width:${wordmark.width}px;bottom:${margin + wordmark.height + 40}px;font-size:46px;line-height:54px;text-wrap:balance">${escapeHtml(headline)}</h1>
<img class="abs" src="${assets.wordmark}" style="left:${margin}px;bottom:${margin}px;width:${wordmark.width}px;height:${wordmark.height}px">
<div class="abs" style="left:${2 * margin + wordmark.width}px;right:${margin}px;top:${margin}px;bottom:${margin}px;display:flex;flex-direction:column;border-radius:14px;overflow:hidden;background:#fff;box-shadow:0 24px 60px rgb(0 0 0 / 30%)">
  <div style="flex:none;height:34px;display:flex;align-items:center;gap:7px;padding:0 14px;background:#E9E9EC">
    <i style="width:11px;height:11px;border-radius:50%;background:#C6C6CC"></i><i style="width:11px;height:11px;border-radius:50%;background:#C6C6CC"></i><i style="width:11px;height:11px;border-radius:50%;background:#C6C6CC"></i>
    <span style="margin-left:16px;width:300px;height:22px;border-radius:11px;background:#fff;color:#55575E;font-size:12px;display:flex;align-items:center;gap:7px;padding:0 10px"><img src="${assets.favicon}" width="16" height="16" style="border-radius:4px;box-shadow:0 0 0 1px #D4D4DA">contacts.example.org</span>
  </div>
  <img src="${assets.screen}" style="display:block;flex:1;min-height:0;width:100%;object-fit:cover;object-position:top"></div>`,
  );
}

/**
 * README banner: wordmark on the left, headline over two lines beside it,
 * centred on the wordmark. No subline: on a phone the banner shrinks to a
 * third of its size or less, where it can't be read.
 */
function banner(assets: Assets, headline: string, red: string) {
  return page(
    assets,
    red,
    `${tabs(red, 17, 1)}
<img class="abs" src="${assets.wordmark}" style="left:80px;top:90px;width:336px;height:141.58px">
<div class="abs" style="left:464px;top:90px;width:640px;height:141.58px;display:flex;align-items:center">
  <h1 class="trim" style="font-size:44px;line-height:54px;text-wrap:balance">${escapeHtml(headline)}</h1></div>`,
  );
}

/** The contact whose page the screenshots open. */
const CAITLYN = "Caitlyn Kiramman";
/** The contact whose form the website's edit gesture shows. */
const LUXANNA = "Luxanna Crownguard";

/** The README's screenshots, in docs/screenshots. */
const README_SCREENS: Record<string, Screen> = {
  "desktop.png": { width: 1280, height: 900, scale: 1, dark: false, contact: CAITLYN },
  "mobile.png": { width: 390, height: 806, scale: 3, dark: false, contact: CAITLYN },
};

/**
 * The manifest's screenshots, which Chrome shows in its install dialog: the
 * desktop with a contact's page open, and the phone on the list. Scaled
 * down from the README's, since every instance serves them.
 */
const MANIFEST_SCREENS: Record<string, Screen> = {
  "desktop.png": { width: 1280, height: 800, scale: 1, dark: false, contact: CAITLYN },
  "mobile.png": { width: 390, height: 844, scale: 2, dark: false },
};

/**
 * The website's screenshots, light and dark, at 1x and 2x: the desktop with
 * Caitlyn Kiramman's page open for the hero, and two gestures for "What it
 * does", both cropped to 736 × 520 so they show at their own size: the list's
 * group menu, on a window 736 wide where the list takes the whole width, and
 * Luxanna Crownguard's form. The form's clip starts past the list
 * (`minmax(26rem,34rem)`, 34rem at 1280 wide) and the header (`lg:h-16`), and
 * leaves out the Save bar: the form's own "Editing" mark says what the shot is.
 */
function siteScreens(): Record<string, Screen> {
  const screens: Record<string, Screen> = {};
  for (const [name, shot] of [
    ["desktop", { width: 1280, height: 900, contact: CAITLYN }],
    [
      "groups",
      { width: 736, height: 800, gesture: "groups", clip: { x: 0, y: 0, width: 736, height: 520 } },
    ],
    [
      "edit",
      {
        width: 1280,
        height: 800,
        contact: LUXANNA,
        gesture: "edit",
        clip: { x: 544, y: 64, width: 736, height: 520 },
      },
    ],
  ] as const) {
    for (const dark of [false, true]) {
      for (const scale of [1, 2]) {
        const file = `${name}-${dark ? "dark" : "light"}${scale === 2 ? "@2x" : ""}.png`;
        screens[file] = { ...shot, scale, dark };
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
    let screen: Buffer;
    try {
      screen = await capture(browser, demo, {
        width: 1280,
        // Taller than every social window's ratio, so filling one trims only the bottom.
        height: 1040,
        scale: 2,
        dark: false,
        contact: CAITLYN,
      });
      for (const [file, screen] of Object.entries(README_SCREENS)) {
        await writeFile(
          resolve(root, "docs/screenshots", file),
          await capture(browser, demo, screen),
        );
        console.log(`screenshots/${file}`);
      }
      for (const [file, screen] of Object.entries(MANIFEST_SCREENS)) {
        await writeFile(
          resolve(root, "public/screenshots", file),
          await capture(browser, demo, screen),
        );
        console.log(`public/screenshots/${file}`);
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
    await render(browser, `data:image/png;base64,${screen.toString("base64")}`);
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

async function render(browser: Browser, screen: string) {
  const assets: Assets = {
    font: await dataUrl(
      resolve(
        root,
        "node_modules/@fontsource-variable/work-sans/files/work-sans-latin-wght-normal.woff2",
      ),
      "font/woff2",
    ),
    favicon: await dataUrl(resolve(brand, "favicon/favicon-16.svg"), "image/svg+xml"),
    wordmark: await dataUrl(resolve(brand, "logo/natel-wordmark-white.svg"), "image/svg+xml"),
    screen,
  };
  const shots: { file: string; width: number; height: number; html: string }[] = [];
  for (const [code, headline] of Object.entries(HEADLINES)) {
    shots.push(
      {
        file: `readme/banner-light-${code}.png`,
        width: 1280,
        height: 320,
        html: banner(assets, headline, RED),
      },
      {
        file: `readme/banner-dark-${code}.png`,
        width: 1280,
        height: 320,
        html: banner(assets, headline, RED_DARK),
      },
      {
        file: `social/og-image-${code}.png`,
        width: 1200,
        height: 630,
        html: social(assets, headline),
      },
    );
    // GitHub takes a single social preview, in the README's language.
    if (code === "en") {
      shots.push({
        file: "social/github-social-preview.png",
        width: 1280,
        height: 640,
        html: social(assets, headline),
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
        [...document.querySelectorAll("h1")].some(
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
