import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useVcfDrop } from "@/hooks/use-vcf-drop";

type Drag = "dragstart" | "dragend" | "dragenter" | "dragover" | "dragleave" | "drop";

/** jsdom has no DragEvent: a cancelable event carrying a DataTransfer-like object. */
function fire(type: Drag, files: File[] = []): Event {
  const event = new Event(type, { cancelable: true });
  Object.defineProperty(event, "dataTransfer", {
    value: { types: files.length > 0 ? ["Files"] : [], files, dropEffect: "none" },
  });
  act(() => {
    window.dispatchEvent(event);
  });
  return event;
}

const VCF = new File(["BEGIN:VCARD\r\nEND:VCARD\r\n"], "ada.vcf", { type: "text/vcard" });
const TXT = new File(["hello"], "notes.txt", { type: "text/plain" });

afterEach(() => {
  document.body.innerHTML = "";
});

describe("useVcfDrop", () => {
  it("shows the drop target while files are over the window, through nested elements", () => {
    const { result } = renderHook(() => useVcfDrop(vi.fn(), vi.fn()));
    fire("dragenter", [VCF]);
    fire("dragenter", [VCF]);
    fire("dragleave", [VCF]);
    expect(result.current).toBe(true);
    fire("dragleave", [VCF]);
    expect(result.current).toBe(false);
  });

  it("hands one dropped .vcf file on, and keeps it from the browser", () => {
    const onFile = vi.fn();
    const onRefused = vi.fn();
    const { result } = renderHook(() => useVcfDrop(onFile, onRefused));
    fire("dragenter", [VCF]);
    const drop = fire("drop", [VCF]);
    expect(drop.defaultPrevented).toBe(true);
    expect(onFile).toHaveBeenCalledWith(VCF);
    expect(onRefused).not.toHaveBeenCalled();
    expect(result.current).toBe(false);
  });

  it.each([
    ["another kind of file", [TXT]],
    ["two files", [VCF, VCF]],
  ])("refuses %s", (_, files) => {
    const onFile = vi.fn();
    const onRefused = vi.fn();
    renderHook(() => useVcfDrop(onFile, onRefused));
    expect(fire("drop", files).defaultPrevented).toBe(true);
    expect(onFile).not.toHaveBeenCalled();
    expect(onRefused).toHaveBeenCalledOnce();
  });

  it("takes nothing while it can't import, nor while a dialog is open", () => {
    const onRefused = vi.fn();
    const { result, rerender } = renderHook(
      ({ onFile }: { onFile?: (file: File) => void }) => useVcfDrop(onFile, onRefused),
      { initialProps: {} },
    );
    fire("dragenter", [VCF]);
    expect(result.current).toBe(false);
    expect(fire("drop", [VCF]).defaultPrevented).toBe(true);

    const onFile = vi.fn();
    rerender({ onFile });
    document.body.innerHTML = '<div role="dialog" aria-modal="true"></div>';
    fire("dragenter", [VCF]);
    expect(result.current).toBe(false);
    fire("drop", [VCF]);
    expect(onFile).not.toHaveBeenCalled();
    expect(onRefused).not.toHaveBeenCalled();
  });

  it("leaves alone a drag that started in the page", () => {
    const onFile = vi.fn();
    const { result } = renderHook(() => useVcfDrop(onFile, vi.fn()));
    fire("dragstart");
    fire("dragenter", [VCF]);
    expect(result.current).toBe(false);
    expect(fire("drop", [VCF]).defaultPrevented).toBe(false);
    fire("dragend");
    expect(onFile).not.toHaveBeenCalled();
  });

  it("ignores drags without files", () => {
    const { result } = renderHook(() => useVcfDrop(vi.fn(), vi.fn()));
    fire("dragenter");
    expect(result.current).toBe(false);
    expect(fire("drop").defaultPrevented).toBe(false);
  });
});
