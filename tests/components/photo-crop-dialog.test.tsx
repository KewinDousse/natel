/**
 * Tests for src/components/photo-crop-dialog.tsx outside the canvas, which
 * runs in Chromium (tests/e2e/photo-edit.spec.ts).
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PhotoCropDialog } from "@/components/photo-crop-dialog";
import { I18nProvider } from "@/i18n/react";

const prepared = { mediaType: "image/png" as const, base64: "iVBO" };
vi.mock("@/lib/photo-prepare", async (actual) => ({
  ...(await actual<typeof import("@/lib/photo-prepare")>()),
  preparePhoto: vi.fn(async () => prepared),
}));

beforeEach(() => {
  // jsdom has no ResizeObserver; the frame's width only scales the drag.
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
});

afterEach(() => vi.unstubAllGlobals());

describe("PhotoCropDialog", () => {
  it("hands the photo over under StrictMode's double effects", async () => {
    const onUse = vi.fn();
    render(
      <StrictMode>
        <I18nProvider>
          <PhotoCropDialog
            chosen={{
              bytes: new Uint8Array(),
              bitmap: { width: 8, height: 6 } as ImageBitmap,
              url: "blob:photo",
            }}
            returnFocusTo={{ current: null }}
            onCancel={vi.fn()}
            onUse={onUse}
          />
        </I18nProvider>
      </StrictMode>,
    );
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: /Utiliser la photo|Use photo/ }));
    await waitFor(() => expect(onUse).toHaveBeenCalledWith(prepared));
  });
});
