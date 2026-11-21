/**
 * The demo's static pages (ADR 025): every link a visitor can share, to a
 * route of the app and the seed's books and contacts, has a page of its own.
 */
import { createRouter } from "@tanstack/react-router";
import { beforeEach, expect, it, vi } from "vitest";
import * as demo from "@/dav/demo";
import { bookParam } from "@/lib/book-param";
import { contactIdOf } from "@/lib/contact-list";
import { loadFullBook } from "@/queries";
import { routeTree } from "@/routeTree.gen";
import { demoPages } from "../vite.config";

// The demo build's alias (vite.config.ts), so the books load as the app loads them.
vi.mock("@/dav", () => import("@/dav/demo"));

const AUTH = { username: "anyone" };

beforeEach(() => demo.resetDemoBooks());

it("ships a page for every route, book and contact of the demo", async () => {
  const books = await Promise.all(
    (await demo.discoverAddressBooks(AUTH)).map(async (book) => ({
      param: bookParam(book),
      ids: (await loadFullBook(AUTH, book.href)).contacts.map(contactIdOf),
    })),
  );
  // The root is index.html; the router links to /contacts, without the slash.
  const routes = Object.values(createRouter({ routeTree }).routesById)
    .map((route) => route.fullPath.replace(/^\/|\/$/g, ""))
    .filter((path) => path.length > 0);
  const links = routes.flatMap((path) => {
    if (!path.includes("$book")) return [path];
    return books.flatMap(({ param, ids }) => {
      const page = path.replace("$book", param);
      return page.includes("$id") ? ids.map((id) => page.replace("$id", id)) : [page];
    });
  });
  expect(links.length).toBeGreaterThan(routes.length);
  expect(demoPages().sort()).toEqual(links.sort());
});
