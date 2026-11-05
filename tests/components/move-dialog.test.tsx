/**
 * Tests for src/components/move-dialog.tsx — which book is chosen when it
 * opens.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MoveDialog } from "@/components/move-dialog";
import { I18nProvider } from "@/i18n/react";
import type { DavAddressBook } from "@/queries";

const WORK: DavAddressBook = {
  href: "https://dav.example.org/books/work/",
  displayName: "Travail",
};
const CLUB: DavAddressBook = { href: "https://dav.example.org/books/club/", displayName: "Club" };

function renderDialog(books: DavAddressBook[]) {
  const onMove = vi.fn();
  render(
    <I18nProvider>
      <MoveDialog books={books} running={false} spinner={null} onCancel={vi.fn()} onMove={onMove} />
    </I18nProvider>,
  );
  return onMove;
}

afterEach(cleanup);

describe("MoveDialog", () => {
  it("explains group membership before confirming the move, including to assistive technology", () => {
    renderDialog([WORK]);
    expect(screen.getByRole("dialog")).toHaveAccessibleDescription(
      "After moving, this contact may no longer appear in some groups. Check its groups in the destination address book.",
    );
  });

  it("chooses the only other book, so Move works at once", () => {
    const onMove = renderDialog([WORK]);
    expect((screen.getByRole("radio", { name: "Travail" }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Move" }));
    expect(onMove).toHaveBeenCalledWith(WORK);
  });

  it("chooses nothing among several books", () => {
    const onMove = renderDialog([WORK, CLUB]);
    for (const radio of screen.getAllByRole("radio")) {
      expect((radio as HTMLInputElement).checked).toBe(false);
    }
    const move = screen.getByRole("button", { name: "Move" }) as HTMLButtonElement;
    expect(move.disabled).toBe(true);
    fireEvent.click(move);
    expect(onMove).not.toHaveBeenCalled();
  });
});
