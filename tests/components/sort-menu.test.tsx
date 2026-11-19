/**
 * Component tests for the list toolbar's sort menu (DESIGN.md "List toolbar").
 */

import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { afterEach, expect, it, vi } from "vitest";
import { ContactList } from "@/components/contact-list";
import { I18nProvider } from "@/i18n/react";
import type { ListSort } from "@/lib/contact-list";

vi.mock("@/hooks/use-arrow-navigation", () => ({ useArrowNavigation: vi.fn() }));
vi.mock("@/hooks/use-open-row-in-view", () => ({ useOpenRowInView: vi.fn() }));

afterEach(cleanup);

function renderList(sort: ListSort, onSortBy = vi.fn()) {
  render(
    <I18nProvider>
      <ContactList
        contacts={[]}
        noBooks={false}
        load={{ kind: "loading" }}
        onRetry={vi.fn()}
        query=""
        sortBy={sort === "edited" ? "family" : sort}
        byRevision={sort === "edited"}
        onSortBy={onSortBy}
        groupCards={[]}
        groupFilter={null}
        onGroupFilter={vi.fn()}
      />
    </I18nProvider>,
  );
  return { onSortBy, user: userEvent.setup() };
}

it("names the current sort and checks it in the menu", async () => {
  const { user } = renderList("edited");
  const trigger = screen.getByRole("button", { name: "Sort: Recently modified" });
  expect(trigger).toHaveAttribute("aria-expanded", "false");

  await user.click(trigger);
  const menu = screen.getByRole("menu", { name: "Sort by" });
  expect(trigger).toHaveAttribute("aria-expanded", "true");
  const items = within(menu).getAllByRole("menuitemradio");
  expect(items.map((item) => item.textContent)).toEqual([
    "First name",
    "Last name",
    "Recently modified",
  ]);
  expect(items.map((item) => item.getAttribute("aria-checked"))).toEqual([
    "false",
    "false",
    "true",
  ]);
  expect(items[2]?.querySelector("svg")).toBeTruthy();
  expect(items[0]?.querySelector("svg")).toBeNull();
  expect(items[2]).toHaveFocus();
});

it("changes the sort and closes on a choice", async () => {
  const { user, onSortBy } = renderList("given");
  await user.click(screen.getByRole("button", { name: "Sort: First name" }));
  await user.click(screen.getByRole("menuitemradio", { name: "Recently modified" }));
  expect(onSortBy).toHaveBeenCalledWith("edited");
  expect(screen.queryByRole("menu")).toBeNull();
  expect(screen.getByRole("button", { name: "Sort: First name" })).toHaveFocus();
});

it("reads « Tri » in French", () => {
  Object.defineProperty(window.navigator, "languages", {
    get: () => ["fr-FR"],
    configurable: true,
  });
  try {
    renderList("edited");
    expect(screen.getByRole("button", { name: "Tri : Modifiés récemment" })).toBeTruthy();
  } finally {
    Object.defineProperty(window.navigator, "languages", {
      get: () => ["en-US"],
      configurable: true,
    });
  }
});
