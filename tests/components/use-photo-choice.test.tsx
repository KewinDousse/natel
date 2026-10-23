import { Blob as MemoryBlob, File as MemoryFile } from "node:buffer";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePhotoChoice } from "@/hooks/use-photo-choice";

const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);

function bitmap(): ImageBitmap {
  return { width: 2, height: 2, close: vi.fn() };
}

beforeEach(() => {
  vi.stubGlobal("Blob", MemoryBlob);
  vi.stubGlobal("File", MemoryFile);
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:photo");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("usePhotoChoice", () => {
  it("keeps the selected photo usable when its temporary file cannot be read again", async () => {
    const file = new File([bytes], "camera.jpg", { type: "image/jpeg" });
    const read = vi
      .spyOn(file, "arrayBuffer")
      .mockResolvedValueOnce(bytes.buffer)
      .mockRejectedValue(new DOMException("Temporary file is unavailable", "NotReadableError"));
    const image = bitmap();
    vi.stubGlobal("createImageBitmap", async (blob: Blob) => {
      expect(new Uint8Array(await blob.arrayBuffer())).toEqual(bytes);
      return image;
    });
    const { result, unmount } = renderHook(() => usePhotoChoice({ current: 0 }));

    await act(async () => {
      await result.current[2](file);
    });

    expect(result.current[0]).toMatchObject({ bitmap: image, bytes, url: "blob:photo" });
    expect(read).toHaveBeenCalledTimes(1);
    unmount();
    expect(image.close).toHaveBeenCalledOnce();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:photo");
  });

  it("reports a file that cannot be read instead of offering a blank photo", async () => {
    const file = new File([bytes], "camera.jpg", { type: "image/jpeg" });
    vi.spyOn(file, "arrayBuffer").mockRejectedValue(
      new DOMException("Unreadable", "NotReadableError"),
    );
    const decode = vi.fn();
    vi.stubGlobal("createImageBitmap", decode);
    const { result } = renderHook(() => usePhotoChoice({ current: 0 }));

    await act(async () => {
      await result.current[2](file);
    });

    expect(result.current[0]).toMatchObject({ error: { code: "UNDECODABLE" } });
    expect(decode).not.toHaveBeenCalled();
  });

  it("drops a photo decoded after editing has ended", async () => {
    const file = new File([bytes], "camera.jpg", { type: "image/jpeg" });
    const image = bitmap();
    let resolve: ((image: ImageBitmap) => void) | undefined;
    const decoded = new Promise<ImageBitmap>((done) => {
      resolve = done;
    });
    vi.stubGlobal("createImageBitmap", () => decoded);
    const session = { current: 0 };
    const { result } = renderHook(() => usePhotoChoice(session));

    await act(async () => {
      const chosen = result.current[2](file);
      session.current++;
      resolve?.(image);
      await chosen;
    });

    expect(result.current[0]).toBeNull();
    expect(image.close).toHaveBeenCalledOnce();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
});
