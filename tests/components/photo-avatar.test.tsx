/**
 * Tests for PhotoAvatar: the photo, or the fallback when there is none or it
 * doesn't load, tried again for another photo.
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { BuildingAvatar, InitialsAvatar, PhotoAvatar, tintOf } from "@/components/photo-avatar";
import { usePreferences } from "@/store/preferences";
import { parse } from "@/vcard";
import bytes from "../vcard/photo-bytes.json";

const withPhoto = (base64: string) =>
  parse(
    ["BEGIN:VCARD", "VERSION:3.0", "FN:A", `PHOTO;ENCODING=b;TYPE=PNG:${base64}`, "END:VCARD"].join(
      "\r\n",
    ),
  );
const fallback = <span>AB</span>;

afterEach(() => {
  cleanup();
  usePreferences.setState({ avatarShape: "round" });
  localStorage.clear();
});

describe("contact image shape", () => {
  it.each([
    [
      "photo",
      <PhotoAvatar
        key="photo"
        contact={withPhoto(bytes.png)}
        className="size-10 rounded-lg"
        fallback={fallback}
      />,
    ],
    [
      "initials",
      <InitialsAvatar
        key="initials"
        family="B"
        given="A"
        seed="ab"
        className="size-10 rounded-lg text-lg"
      />,
    ],
    ["organisation", <BuildingAvatar key="organisation" className="size-10 rounded-lg" />],
  ])("updates the %s shape immediately", (_name, avatar) => {
    const { container } = render(avatar);
    expect(container.firstElementChild?.classList.contains("rounded-full")).toBe(true);
    expect(container.firstElementChild?.classList.contains("rounded-lg")).toBe(false);
    act(() => usePreferences.getState().setAvatarShape("square"));
    expect(container.firstElementChild?.classList.contains("rounded-lg")).toBe(true);
    expect(container.firstElementChild?.classList.contains("rounded-full")).toBe(false);
    act(() => usePreferences.getState().setAvatarShape("round"));
    expect(container.firstElementChild?.classList.contains("rounded-full")).toBe(true);
  });
});

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

describe("tintOf", () => {
  it("draws one of the six tints, always the same for a card", () => {
    const tints = ["full", "ada", "4f1c2e8a-0b7d-4c55-9e1f-2a3b4c5d6e7f", ""].map(tintOf);
    for (const tint of tints) expect(tint).toBeGreaterThanOrEqual(1);
    for (const tint of tints) expect(tint).toBeLessThanOrEqual(6);
    expect(tintOf("ada")).toBe(tintOf("ada"));
  });
});
