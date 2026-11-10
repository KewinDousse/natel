import { type KeyboardEvent, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "@/i18n/react";
import type { TranslationKey } from "@/i18n/setup";
import { buttonClass } from "./ui/button";
import { ChevronDownIcon, PlusIcon } from "./ui/icons";

type InformationOption = { label: TranslationKey; onClick: () => void };

const isOutside = (node: EventTarget | null, ...parts: (Element | null)[]) =>
  node instanceof Node && !parts.some((part) => part?.contains(node));

export function ContactEditorAdditions({ options }: { options: InformationOption[] }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const menu = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{
    left: number;
    top: number;
    width: number;
    maxHeight: number;
  } | null>(null);

  useLayoutEffect(() => {
    if (!open) return;
    const button = trigger.current;
    const panel = menu.current;
    if (!button || !panel) return;
    const bar = button.closest("article")?.querySelector("[data-contact-edit-bar]");
    const viewport = window.visualViewport;
    const place = () => {
      const bounds = button.getBoundingClientRect();
      const left = (viewport?.offsetLeft ?? 0) + 8;
      const top = (viewport?.offsetTop ?? 0) + 8;
      const right = left + (viewport?.width ?? window.innerWidth) - 16;
      const bottom =
        Math.min(
          (viewport?.offsetTop ?? 0) + (viewport?.height ?? window.innerHeight),
          bar?.getBoundingClientRect().top ?? window.innerHeight,
        ) - 8;
      const maxHeight = Math.max(0, bottom - top);
      const height = Math.min(panel.scrollHeight, maxHeight);
      const width = Math.min(bounds.width, right - left);
      setPosition({
        left: Math.max(left, Math.min(bounds.left, right - width)),
        top: Math.max(top, Math.min(bounds.top - 8 - height, bottom - height)),
        width,
        maxHeight,
      });
    };
    place();
    // The menu scrolls internally; focusing it must not move the form.
    panel.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus({ preventScroll: true });
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    viewport?.addEventListener("resize", place);
    viewport?.addEventListener("scroll", place);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(place);
    if (bar) observer?.observe(bar);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      viewport?.removeEventListener("resize", place);
      viewport?.removeEventListener("scroll", place);
      observer?.disconnect();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (isOutside(event.target, root.current, menu.current)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const items = Array.from(
      menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [],
    );
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      trigger.current?.focus();
    } else if (event.key === "Tab") {
      setOpen(false);
      trigger.current?.focus();
    } else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const next =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? items.length - 1
            : (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
      items[next]?.focus();
    }
  }

  if (options.length === 0) return null;
  return (
    <div ref={root} className="relative w-fit max-w-full">
      <button
        ref={trigger}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        // Blur validation can move this control before its click.
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          if (open) trigger.current?.focus();
          setOpen((value) => !value);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
          }
        }}
        className={buttonClass(
          { variant: "ghost" },
          "-ml-3.5 h-11 justify-start rounded-md pl-3.5",
        )}
      >
        <PlusIcon />
        {t("add_information")}
        <ChevronDownIcon className="size-4" />
      </button>
      {open &&
        createPortal(
          <div
            ref={menu}
            style={position ?? { left: 0, top: 0 }}
            id={menuId}
            role="menu"
            aria-label={t("add_information")}
            onKeyDown={onKeyDown}
            // Closes when a dialog takes the focus. A press in the menu on
            // Safari moves it nowhere, which must not close it before the
            // item's click.
            onBlur={(event) => {
              if (isOutside(event.relatedTarget, root.current, menu.current)) setOpen(false);
            }}
            className="fixed z-40 overflow-y-auto rounded-lg bg-popover p-1 shadow-float"
          >
            {options.map((option) => (
              <button
                key={option.label}
                type="button"
                role="menuitem"
                tabIndex={-1}
                onClick={() => {
                  setOpen(false);
                  option.onClick();
                }}
                className="flex min-h-11 w-full items-center rounded-sm px-3 py-2 text-left text-sm font-bold hover:bg-muted focus:bg-muted focus:outline-none"
              >
                {t(option.label)}
              </button>
            ))}
          </div>,
          root.current?.closest("article") ?? document.body,
        )}
    </div>
  );
}
