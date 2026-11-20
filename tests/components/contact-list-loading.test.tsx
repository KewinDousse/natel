import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { ContactList } from "@/components/contact-list";
import { I18nProvider } from "@/i18n/react";
import type { Contact } from "@/model/contact";

vi.mock("@/hooks/use-arrow-navigation", () => ({ useArrowNavigation: vi.fn() }));
vi.mock("@/hooks/use-open-row-in-view", () => ({ useOpenRowInView: vi.fn() }));

afterEach(cleanup);

it("offers sorting while contacts load and keeps the alphabet non-interactive", async () => {
  const onListSort = vi.fn();
  const { container, rerender } = render(view(""));
  expect(screen.getByText("Loading contacts…").closest("[aria-live]")).toBeTruthy();
  expect(container.querySelector("#list")?.getAttribute("aria-busy")).toBe("true");
  expect(container.querySelectorAll("#rail span")).toHaveLength(27);
  expect(container.querySelectorAll("#rail a")).toHaveLength(0);
  expect(container.querySelector("#rail")?.getAttribute("aria-hidden")).toBe("true");
  // The skeleton rows sit beside an empty letter column, like loaded rows.
  expect(container.querySelector('ul[aria-hidden="true"]')?.parentElement?.className).toContain(
    "grid-cols-",
  );
  await userEvent.click(screen.getByRole("button", { name: "Sort: First name" }));
  await userEvent.click(screen.getByRole("menuitemradio", { name: "Last name" }));
  expect(onListSort).toHaveBeenCalledWith("family");
  const focused = document.activeElement;
  rerender(view("Ada"));
  expect(container.querySelector("#rail")?.hasAttribute("hidden")).toBe(true);
  rerender(view("Ada", []));
  expect(document.activeElement).toBe(focused);

  // Sorted by last modification, loaded rows have no letter column, so neither do the skeletons.
  rerender(view("", undefined, true));
  expect(container.querySelector("#rail")).toBeNull();
  expect(container.querySelector('ul[aria-hidden="true"]')?.parentElement?.className).not.toContain(
    "grid-cols-",
  );

  function view(query: string, contacts?: Contact[], byRevision = false) {
    return (
      <I18nProvider>
        <ContactList
          contacts={contacts}
          noBooks={false}
          load={{ kind: "loading" }}
          onRetry={vi.fn()}
          query={query}
          sortBy="given"
          byRevision={byRevision}
          onListSort={onListSort}
          groupCards={[]}
          groupFilter={null}
          onGroupFilter={vi.fn()}
        />
      </I18nProvider>
    );
  }
});
