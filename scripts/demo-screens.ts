/**
 * Screens of the demo build (ADR 025) for the README, the social images and
 * the website: the production bundle, signed in, without the demo's
 * reminders, which only make sense to someone using the demo.
 */

/// <reference types="node" />

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Browser, Page } from "@playwright/test";
import { build, type PreviewServer, preview } from "vite";

export type Screen = {
  width: number;
  height: number;
  scale: number;
  dark: boolean;
  /** The contact whose page is open; the list alone when absent. */
  contact?: string;
  /** On top of that: the contact's form, or the list's group menu open. */
  gesture?: "edit" | "groups";
  /** The part of the viewport kept, in CSS pixels; all of it when absent. */
  clip?: { x: number; y: number; width: number; height: number };
};

export type DemoServer = {
  url: string;
  /** The app's English strings, which locate its controls and reminders. */
  messages: Record<string, string>;
  close: () => Promise<void>;
};

async function readMessages(root: string): Promise<Record<string, string>> {
  const parsed: unknown = JSON.parse(await readFile(join(root, "src/i18n/en.json"), "utf8"));
  if (typeof parsed !== "object" || parsed === null) throw new Error("src/i18n/en.json");
  return Object.fromEntries(
    Object.entries(parsed).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

export async function startDemo(root: string): Promise<DemoServer> {
  const messages = await readMessages(root);
  const outDir = await mkdtemp(join(tmpdir(), "natel-demo-"));
  let server: PreviewServer | undefined;
  try {
    // vite.config.ts reads the switch from the environment, never a .env file.
    process.env.VITE_DEMO = "1";
    await build({ root, logLevel: "warn", build: { outDir, emptyOutDir: true } });
    // Vite moves to the next free port when this one is taken.
    server = await preview({
      root,
      logLevel: "warn",
      build: { outDir },
      preview: { host: "127.0.0.1", port: 4180 },
    });
    const url = server.resolvedUrls?.local[0];
    if (!url) throw new Error("The demo preview server has no address");
    const running = server;
    return {
      url,
      messages,
      close: async () => {
        await running.close();
        await rm(outDir, { recursive: true, force: true });
      },
    };
  } catch (error) {
    await server?.close().catch(() => {});
    await rm(outDir, { recursive: true, force: true });
    throw error;
  }
}

function message(all: Record<string, string>, key: string): string {
  const text = all[key];
  if (!text) throw new Error(`src/i18n/en.json has no ${key}`);
  return text;
}

/**
 * A clip is fixed in pixels: a layout change would otherwise crop the group
 * menu, or let the list, the header or the Save bar into the form's shot,
 * unnoticed.
 */
async function checkClip(page: Page, screen: Screen) {
  const clip = screen.clip;
  if (!clip) return;
  const fail = (what: string) => {
    throw new Error(`The ${screen.gesture ?? "screen"} clip ${what}`);
  };
  if (screen.gesture === "groups") {
    const [list, menu] = await Promise.all([
      page.locator("main > div").first().boundingBox(),
      page.getByRole("menu").boundingBox(),
    ]);
    if (!list || list.width < clip.width) fail("shows the list beside another pane");
    if (
      !menu ||
      menu.x < clip.x ||
      menu.y < clip.y ||
      menu.x + menu.width > clip.x + clip.width ||
      menu.y + menu.height > clip.y + clip.height
    ) {
      fail("cuts the group menu");
    }
  }
  if (screen.gesture === "edit") {
    // The list's grid cell, with its border and the alphabet rail.
    const [list, header, bar] = await Promise.all([
      page.locator("main > div").first().boundingBox(),
      page.locator("#app-header").boundingBox(),
      page.locator("[data-contact-edit-bar]").boundingBox(),
    ]);
    if (!list || list.x + list.width > clip.x) fail("takes in the list");
    if (!header || header.y + header.height > clip.y) fail("takes in the header");
    if (!bar || bar.y < clip.y + clip.height) fail("takes in the Save bar");
  }
}

export async function capture(browser: Browser, demo: DemoServer, screen: Screen): Promise<Buffer> {
  const t = demo.messages;
  const phone = screen.width < 600;
  const page = await browser.newPage({
    viewport: { width: screen.width, height: screen.height },
    deviceScaleFactor: screen.scale,
    isMobile: phone,
    hasTouch: phone,
    colorScheme: screen.dark ? "dark" : "light",
    locale: "en-US",
  });
  try {
    await page.goto(demo.url);
    await page.getByLabel(message(t, "user")).fill("visitor");
    await page.getByLabel(message(t, "pass"), { exact: true }).fill("anything");
    await page.getByRole("button", { name: message(t, "submit") }).click();
    const notice = page.getByText(message(t, "demo_notice"), { exact: true });
    await notice.waitFor();
    // Credentials live in memory: a contact opens by link, not by URL.
    if (screen.contact) {
      await page.getByRole("link").filter({ hasText: screen.contact }).first().click();
      await page.getByRole("heading", { name: screen.contact }).waitFor();
    }
    if (screen.gesture === "edit") {
      await page.getByRole("button", { name: message(t, "edit_kbd") }).click();
      await page.getByRole("button", { name: message(t, "save") }).waitFor();
    }
    await page.locator("[data-demo-reminder]").evaluateAll((nodes) => {
      for (const node of nodes) if (node instanceof HTMLElement) node.style.display = "none";
    });
    const reminders = ["demo_mark", "demo_notice"].map((key) => [key, message(t, key)] as const);
    // A reminder that lost its attribute would show up unnoticed.
    for (const [key, text] of reminders) {
      if ((await page.getByText(text).filter({ visible: true }).count()) > 0) {
        throw new Error(`The demo reminder ${key} is still visible`);
      }
    }
    // Hiding the notice moves the list under the pointer left by the click.
    await page.mouse.move(0, 0);
    if (screen.gesture === "groups") {
      const trigger = message(t, "group_filter_label").replace("{name}", message(t, "group_all"));
      await page.getByRole("button", { name: trigger, exact: true }).click();
      await page.getByRole("menu").waitFor();
    }
    await page.evaluate(() => document.fonts.ready);
    if (screen.clip) await checkClip(page, screen);
    return await page.screenshot({ animations: "disabled", clip: screen.clip });
  } finally {
    await page.close();
  }
}
