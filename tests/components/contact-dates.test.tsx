import { cleanup, render } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ContactView } from "@/components/contact-view";
import { I18nProvider } from "@/i18n/react";
import { parse } from "@/vcard";

function card(...lines: string[]): string {
  return ["BEGIN:VCARD", "VERSION:3.0", "FN:Lina Moret", ...lines, "END:VCARD"].join("\r\n");
}

function datesOf(text: string, locale: "en" | "fr"): HTMLElement | null {
  localStorage.setItem("natel.preferences", JSON.stringify({ locale }));
  const { container } = render(
    <I18nProvider>
      <ContactView
        contact={parse(text)}
        groups={[]}
        onEdit={vi.fn()}
        onCopy={vi.fn()}
        onGroup={vi.fn()}
      />
    </I18nProvider>,
  );
  return container.querySelector("[data-card-dates]");
}

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("contact page dates", () => {
  const BOTH = card("X-CREATED:20210418", "REV:2026-11-12T12:30:00Z");

  it("shows when the card was created and last modified, in English", () => {
    const dates = datesOf(BOTH, "en");
    expect(dates).toHaveTextContent("Created April 18, 2021 · Modified November 12, 2026");
    const times = [...(dates?.querySelectorAll("time") ?? [])].map((t) => t.dateTime);
    expect(times).toEqual(["2021-04-18", "2026-11-12T12:30:00.000Z"]);
  });

  it("shows them in French", () => {
    expect(datesOf(BOTH, "fr")).toHaveTextContent(
      "Créé le 18 avril 2021 · Modifié le 12 novembre 2026",
    );
  });

  it("shows only the date the card has", () => {
    expect(datesOf(card("REV:20261112T123000Z"), "en")).toHaveTextContent(
      /^Modified November 12, 2026$/,
    );
  });

  it("shows nothing for a card without readable dates", () => {
    expect(datesOf(card(), "en")).toBeNull();
    expect(datesOf(card("REV:garbage", "X-CREATED:someday"), "en")).toBeNull();
  });
});
