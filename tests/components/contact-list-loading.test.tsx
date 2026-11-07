import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { ContactList } from "@/components/contact-list";
import { I18nProvider } from "@/i18n/react";
import type { Contact } from "@/model/contact";

vi.mock("@/hooks/use-arrow-navigation", () => ({ useArrowNavigation: vi.fn() }));

afterEach(cleanup);

it("offers sorting while contacts load and keeps the alphabet non-interactive", async () => {
  const onSortBy = vi.fn();
  const { container, rerender } = render(view(""));
  expect(screen.getByText("Loading contacts…").closest("[aria-live]")).toBeTruthy();
  expect(container.querySelector("#list")?.getAttribute("aria-busy")).toBe("true");
  expect(container.querySelectorAll("#rail span")).toHaveLength(27);
  expect(container.querySelectorAll("#rail a")).toHaveLength(0);
  expect(container.querySelector("#rail")?.getAttribute("aria-hidden")).toBe("true");
  expect(container.querySelector('ul[aria-hidden="true"]')).toBeTruthy();
  const buttons = screen.getAllByRole("button");
  expect(buttons[0]?.getAttribute("aria-pressed")).toBe("true");
  await userEvent.click(buttons[1] as HTMLButtonElement);
  expect(onSortBy).toHaveBeenCalledWith("family");
  const focused = document.activeElement;
  rerender(view("Ada"));
  expect(container.querySelector("#rail")?.hasAttribute("hidden")).toBe(true);
  rerender(view("Ada", []));
  expect(document.activeElement).toBe(focused);

  function view(query: string, contacts?: Contact[]) {
    return (
      <I18nProvider>
        <ContactList
          contacts={contacts}
          noBooks={false}
          load={{ kind: "loading" }}
          onRetry={vi.fn()}
          query={query}
          sortBy="given"
          onSortBy={onSortBy}
          groupCards={[]}
          groupFilter={null}
          onGroupFilter={vi.fn()}
        />
      </I18nProvider>
    );
  }
});
