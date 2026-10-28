/**
 * Tests for src/components/import-dialog.tsx — the keyboard contract: nothing
 * reaches the page behind it, Esc closes it only once finished, and the focus
 * lands on Close.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ImportDialog } from "@/components/import-dialog";
import { I18nProvider } from "@/i18n/react";

function renderDialog(
  state: Parameters<typeof ImportDialog>[0]["state"],
  onClose = vi.fn(),
  onConfirm = vi.fn(),
  onCancel = vi.fn(),
) {
  render(
    <I18nProvider>
      <ImportDialog
        bookName="Contacts"
        state={state}
        onConfirm={onConfirm}
        onCancel={onCancel}
        onClose={onClose}
      />
    </I18nProvider>,
  );
  return onClose;
}

const DONE = {
  phase: "done" as const,
  result: { imported: 1, existing: 0, failed: [] },
  skipped: 0,
};

function planned(position: number, name: string) {
  return { position, name, uid: name.toLowerCase(), text: "", contact: null };
}

const PREVIEW = {
  phase: "preview" as const,
  plan: {
    create: [planned(1, "Ada"), planned(2, "Bob"), planned(3, "Cy")],
    existing: 2,
    failed: [{ name: "Broken", position: 4, reason: "unreadable" as const }],
  },
  similar: [{ card: planned(2, "Bob"), match: "Bob Martin" }],
};

afterEach(() => vi.restoreAllMocks());

describe("ImportDialog", () => {
  it("keeps keys from the page's shortcuts", () => {
    const onWindowKey = vi.fn();
    window.addEventListener("keydown", onWindowKey);
    renderDialog({ phase: "running", done: 1, total: 3 });
    for (const key of ["e", "/", "Escape"]) fireEvent.keyDown(screen.getByRole("dialog"), { key });
    window.removeEventListener("keydown", onWindowKey);
    expect(onWindowKey).not.toHaveBeenCalled();
  });

  it("can't be dismissed while cards are sent", () => {
    const onClose = renderDialog({ phase: "running", done: 1, total: 3 });
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("says what the import will do before it starts", () => {
    renderDialog(PREVIEW);
    expect(screen.getByText("To import: 3")).toBeTruthy();
    expect(screen.getByText("Already in the book: 2")).toBeTruthy();
    expect(screen.getByText("Can’t be imported: 1")).toBeTruthy();
    expect(screen.getByText("Broken")).toBeTruthy();
    expect(screen.getByText("Look like contacts already in the book")).toBeTruthy();
    expect(screen.getByText("· like “Bob Martin”", { exact: false })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Import 3 contacts" }));
  });

  it("imports with or without the look-alikes, as the box says", () => {
    const onConfirm = vi.fn();
    renderDialog(PREVIEW, vi.fn(), onConfirm);
    fireEvent.click(screen.getByRole("checkbox", { name: "Don’t import this contact" }));
    fireEvent.click(screen.getByRole("button", { name: "Import 2 contacts" }));
    expect(onConfirm).toHaveBeenCalledWith(true);
  });

  it("keeps the focus in the dialog once the cards are being sent", () => {
    const { rerender } = render(
      <I18nProvider>
        <ImportDialog
          bookName="Contacts"
          state={PREVIEW}
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
          onClose={vi.fn()}
        />
      </I18nProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Import 3 contacts" }));
    rerender(
      <I18nProvider>
        <ImportDialog
          bookName="Contacts"
          state={{ phase: "running", done: 0, total: 3 }}
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
          onClose={vi.fn()}
        />
      </I18nProvider>,
    );
    expect(screen.getByRole("dialog").contains(document.activeElement)).toBe(true);
  });

  it("cancels the preview on Esc without closing the import", () => {
    const onClose = vi.fn();
    const onCancel = vi.fn();
    renderDialog(PREVIEW, onClose, vi.fn(), onCancel);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("only offers to close when there is nothing to import", () => {
    const onCancel = vi.fn();
    renderDialog(
      { ...PREVIEW, plan: { ...PREVIEW.plan, create: [] }, similar: [] },
      vi.fn(),
      vi.fn(),
      onCancel,
    );
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onCancel).toHaveBeenCalledOnce();
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("counts the look-alikes left out", () => {
    renderDialog({ ...DONE, skipped: 2 });
    expect(screen.getByText("Left out as look-alikes: 2")).toBeTruthy();
  });

  it("focuses Close once finished, and closes on Esc", () => {
    const onClose = renderDialog(DONE);
    expect(document.activeElement).toBe(screen.getByRole("button"));
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });
});
