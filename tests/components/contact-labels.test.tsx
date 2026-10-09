import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { createRef, useReducer } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContactEditor } from "@/components/contact-editor";
import { appleLabelText } from "@/components/contact-fields";
import { ContactView } from "@/components/contact-view";
import { I18nProvider } from "@/i18n/react";
import { translate } from "@/i18n/setup";
import { buildDraft, dirtyDiff, isDirty } from "@/lib/contact-edit";
import { draftReducer } from "@/lib/draft-reducer";
import { parse } from "@/vcard";

const CARD = [
  "BEGIN:VCARD",
  "VERSION:3.0",
  "FN:Ada",
  "N:;Ada;;;",
  "item1.TEL;TYPE=CELL:111",
  "item1.X-ABLABEL:Chalet",
  "item2.EMAIL:ada@example.com",
  "item2.X-ABLABEL:Cabane",
  "item3.ADR:;;Rue 1;Lausanne;;1000;Suisse",
  "item3.X-ABLABEL:Atelier",
  "item4.URL:https://example.com",
  "item4.X-ABLABEL:_$!<HomePage>!$_",
  "END:VCARD",
].join("\r\n");

function Editor() {
  const contact = parse(CARD);
  const [draft, dispatch] = useReducer(draftReducer, contact, buildDraft);
  return (
    <>
      <ContactEditor
        contact={contact}
        isNew={false}
        draft={draft}
        dispatch={dispatch}
        errors={{}}
        onBlurValidate={vi.fn()}
        groups={null}
        groupSuggestions={[]}
        onGroupsChange={vi.fn()}
        photo={{
          canChange: false,
          shown: false,
          inputRef: createRef(),
          buttonRef: createRef(),
          onFile: vi.fn(),
        }}
        unknownCount={0}
        onShowUnknown={vi.fn()}
        busy={false}
      />
      <output data-testid="dirty">{String(isDirty(dirtyDiff(contact, draft)))}</output>
    </>
  );
}

beforeEach(() => localStorage.setItem("natel.preferences", JSON.stringify({ locale: "en" })));
afterEach(cleanup);

describe("contact labels", () => {
  it("shows labels in the reading view, including the translated website label", () => {
    render(
      <I18nProvider>
        <ContactView contact={parse(CARD)} groups={[]} onEdit={vi.fn()} onCopy={vi.fn()} />
      </I18nProvider>,
    );
    for (const label of ["Chalet", "Cabane", "Atelier", "Home page"]) {
      expect(screen.getByText(label)).toBeVisible();
    }
  });

  it("selects labels first and makes the underlying type an explicit change", async () => {
    const user = userEvent.setup();
    render(
      <I18nProvider>
        <Editor />
      </I18nProvider>,
    );
    for (const select of screen.getAllByRole("combobox")) {
      expect(select).toHaveValue("label");
      expect((select as HTMLSelectElement).options[0]?.value).toBe("label");
    }
    expect(screen.getByRole("textbox", { name: "Phone number (Chalet)" })).toBeVisible();
    await user.selectOptions(screen.getByRole("combobox", { name: "Phone number type" }), "cell");
    expect(screen.getByRole("textbox", { name: "Phone number (Mobile)" })).toBeVisible();
    expect(screen.getByTestId("dirty")).toHaveTextContent("true");
    await user.selectOptions(screen.getByRole("combobox", { name: "Phone number type" }), "label");
    expect(screen.getByTestId("dirty")).toHaveTextContent("false");
  });

  it("translates built-in labels and strips wrappers from unknown ones", () => {
    expect(appleLabelText("_$!<Mother>!$_", (key) => translate("fr", key))).toBe("Mère");
    expect(appleLabelText("_$!<Mother>!$_", (key) => translate("en", key))).toBe("Mother");
    expect(appleLabelText("_$!<Custom>!$_", (key) => translate("fr", key))).toBe("Custom");
    expect(appleLabelText("_$!<__proto__>!$_", (key) => translate("fr", key))).toBe("__proto__");
    expect(appleLabelText("_$!<constructor>!$_", (key) => translate("fr", key))).toBe(
      "constructor",
    );
    expect(appleLabelText("Chalet", (key) => translate("fr", key))).toBe("Chalet");
  });
});
