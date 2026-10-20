/**
 * Screens of the demo build (ADR 025) for the README, the social images and
 * the website: the production bundle, signed in, without the demo's
 * reminders, which only make sense to someone using the demo.
 */

/// <reference types="node" />

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Browser } from "@playwright/test";
import { build, type PreviewServer, preview } from "vite";

export type Screen = {
  width: number;
  height: number;
  scale: number;
  dark: boolean;
  /** The contact whose page is open; the list alone when absent. */
  contact?: string;
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
    const reminders = ["demo_mark", "demo_notice"].map((key) => [key, message(t, key)] as const);
    for (const [, text] of reminders) {
      await page.getByText(text, { exact: true }).evaluateAll((nodes) => {
        for (const node of nodes) if (node instanceof HTMLElement) node.style.display = "none";
      });
    }
    // A reminder that no longer matches its string would show up unnoticed.
    for (const [key, text] of reminders) {
      if ((await page.getByText(text).filter({ visible: true }).count()) > 0) {
        throw new Error(`The demo reminder ${key} is still visible`);
      }
    }
    // Hiding the notice moves the list under the pointer left by the click.
    await page.mouse.move(0, 0);
    await page.evaluate(() => document.fonts.ready);
    return await page.screenshot({ animations: "disabled" });
  } finally {
    await page.close();
  }
}
