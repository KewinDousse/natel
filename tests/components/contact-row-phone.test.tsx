import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ContactRow } from "@/components/contact-row";
import { I18nProvider } from "@/i18n/react";
import type { PhoneFormat } from "@/lib/format-phone";
import { usePreferences } from "@/store/preferences";
import { parse } from "@/vcard";

afterEach(() => {
  cleanup();
  usePreferences.setState({ phoneFormat: "local" });
});

const contact = parse(
  "BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Ada Lovelace\r\nN:Lovelace;Ada;;;\r\nTEL;TYPE=CELL:+41 79 000 00 01\r\nEND:VCARD\r\n",
  "https://dav.example.org/books/a/ada.vcf",
  '"e"',
);

async function renderRow(phoneFormat: PhoneFormat, query: string) {
  usePreferences.setState({ phoneFormat });
  const rootRoute = createRootRoute({
    component: () => <ContactRow book="a" contact={contact} query={query} sortBy="given" />,
  });
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  render(
    <I18nProvider>
      <RouterProvider router={router} />
    </I18nProvider>,
  );
  return screen.findByText(phoneFormat === "local" ? "079 000 00 01" : "+41 79 000 00 01");
}

describe("phone highlight across formats", () => {
  it("marks an international display found by its local digits", async () => {
    const shown = await renderRow("international", "0790000001");
    expect(shown.tagName).toBe("MARK");
  });

  it("marks a local display found by its international digits", async () => {
    const shown = await renderRow("local", "0041790000001");
    expect(shown.tagName).toBe("MARK");
  });

  it("leaves a number unmarked when its digits do not match", async () => {
    const shown = await renderRow("international", "0790000002");
    expect(shown.tagName).not.toBe("MARK");
  });
});
