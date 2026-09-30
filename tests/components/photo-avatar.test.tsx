/**
 * Tests for PhotoAvatar: the photo, or the fallback when there is none or it
 * doesn't load, tried again for another photo.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PhotoAvatar } from "@/components/photo-avatar";
import { parse } from "@/vcard";
import bytes from "../vcard/photo-bytes.json";

const withPhoto = (base64: string) =>
  parse(
    ["BEGIN:VCARD", "VERSION:3.0", "FN:A", `PHOTO;ENCODING=b;TYPE=PNG:${base64}`, "END:VCARD"].join(
      "\r\n",
    ),
  );
const fallback = <span>AB</span>;

afterEach(cleanup);

describe("PhotoAvatar", () => {
  it("shows the photo as a decorative image", () => {
    const { container } = render(
      <PhotoAvatar contact={withPhoto(bytes.png)} className="size-10" fallback={fallback} />,
    );
    const img = container.querySelector("img");
    expect(img?.getAttribute("src")).toBe(`data:image/png;base64,${bytes.png}`);
    expect(img?.getAttribute("alt")).toBe("");
    expect(screen.queryByText("AB")).toBeNull();
  });

  it("shows the fallback without a photo", () => {
    render(
      <PhotoAvatar
        contact={parse("BEGIN:VCARD\r\nVERSION:3.0\r\nFN:A\r\nEND:VCARD")}
        className="size-10"
        fallback={fallback}
      />,
    );
    expect(screen.getByText("AB")).toBeTruthy();
  });

  it("falls back when the image fails, and tries another photo again", () => {
    const { container, rerender } = render(
      <PhotoAvatar contact={withPhoto(bytes.png)} className="size-10" fallback={fallback} />,
    );
    const img = container.querySelector("img");
    if (img) fireEvent.error(img);
    expect(screen.getByText("AB")).toBeTruthy();
    expect(container.querySelector("img")).toBeNull();

    rerender(
      <PhotoAvatar contact={withPhoto(bytes.webp)} className="size-10" fallback={fallback} />,
    );
    expect(container.querySelector("img")?.getAttribute("src")).toContain("image/png;base64,UklGR");
  });
});
