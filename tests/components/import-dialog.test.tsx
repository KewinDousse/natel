/**
 * Tests for src/components/import-dialog.tsx — the keyboard contract: nothing
 * reaches the page behind it, Esc closes it only once finished, and the focus
 * lands on Close.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ImportDialog } from "@/components/import-dialog";
import { I18nProvider } from "@/i18n/react";

function renderDialog(state: Parameters<typeof ImportDialog>[0]["state"], onClose = vi.fn()) {
  render(
    <I18nProvider>
      <ImportDialog bookName="Contacts" state={state} onClose={onClose} />
    </I18nProvider>,
  );
  return onClose;
}

const DONE = { phase: "done" as const, result: { imported: 1, existing: 0, failed: [] } };

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

  it("focuses Close once finished, and closes on Esc", () => {
    const onClose = renderDialog(DONE);
    expect(document.activeElement).toBe(screen.getByRole("button"));
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });
});
