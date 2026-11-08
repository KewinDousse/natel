import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Contact } from "@/model/contact";

const navigate = vi.fn();
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => navigate }));
vi.mock("@/lib/demo", () => ({
  IS_DEMO: true,
  DEMO_ARRIVAL_CONTACT: new Map([
    ["runeterra", "p03"],
    ["expedition-33", "e08"],
  ]),
}));
vi.mock("@/lib/shortcuts", () => ({ isDesktop: () => true }));
vi.mock("@/lib/contact-list", () => ({ contactById: () => ({}) }));

const LIST = "/_directory/contacts/$book";
const contacts: Contact[] = [];

type Props = { leaf: string; book: string; contacts: Contact[] | undefined };

// The hook keeps its state per page load, that is per module instance.
async function arrival(initialProps: Props) {
  vi.resetModules();
  const { useDemoArrival } = await import("@/hooks/use-demo-arrival");
  return renderHook((props: Props) => useDemoArrival(props.leaf, props.book, props.contacts), {
    initialProps,
  });
}

beforeEach(() => {
  navigate.mockClear();
});

describe("useDemoArrival", () => {
  it("opens the book's arrival contact once its contacts load", async () => {
    const { rerender } = await arrival({ leaf: LIST, book: "runeterra", contacts: undefined });
    expect(navigate).not.toHaveBeenCalled();
    rerender({ leaf: LIST, book: "runeterra", contacts });
    expect(navigate).toHaveBeenCalledWith({
      to: "/contacts/$book/$id",
      params: { book: "runeterra", id: "p03" },
      replace: true,
    });
  });

  it("opens nothing after a switch to another book before the contacts load", async () => {
    const { rerender } = await arrival({ leaf: LIST, book: "runeterra", contacts: undefined });
    rerender({ leaf: LIST, book: "expedition-33", contacts: undefined });
    rerender({ leaf: LIST, book: "expedition-33", contacts });
    expect(navigate).not.toHaveBeenCalled();
  });

  it("opens nothing when the page load starts elsewhere in the directory", async () => {
    const { rerender } = await arrival({
      leaf: "/_directory/settings",
      book: "runeterra",
      contacts,
    });
    rerender({ leaf: LIST, book: "runeterra", contacts });
    expect(navigate).not.toHaveBeenCalled();
  });
});
