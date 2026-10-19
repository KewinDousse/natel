/**
 * A contact's photo in its avatar square (ADR 023, DESIGN.md rule 7), or the
 * fallback (initials, building icon) when there is none or it doesn't load.
 * Decorative: the name is always next to it.
 */

import { type ReactNode, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import type { Contact, PhotoEdit } from "@/model/contact";
import { usePreferences } from "@/store/preferences";
import { photoOf } from "@/vcard";
import { BuildingIcon } from "./ui/icons";

const UNCHANGED: PhotoEdit = { kind: "unchanged" };

export function PhotoAvatar({
  contact,
  className,
  lazy = false,
  fallback,
  edited = UNCHANGED,
}: {
  contact: Contact;
  /** The photo as edited: a new one shows before it is saved, a removed one is gone. */
  edited?: PhotoEdit;
  className: string;
  /** For the list, where a book's photos can weigh several MB. */
  lazy?: boolean;
  fallback: ReactNode;
}) {
  const src = useMemo(() => {
    if (edited.kind === "removed") return null;
    const photo = edited.kind === "replaced" ? edited : photoOf(contact);
    return photo ? `data:${photo.mediaType};base64,${photo.base64}` : null;
  }, [contact, edited]);
  const [failed, setFailed] = useState<string | null>(null);

  if (src === null || failed === src) return <>{fallback}</>;
  return (
    <img
      src={src}
      alt=""
      aria-hidden="true"
      loading={lazy ? "lazy" : undefined}
      decoding={lazy ? "async" : undefined}
      onError={() => setFailed(src)}
      className={cn("shrink-0 object-cover", className)}
    />
  );
}

/**
 * No photo: the initials, in the display face (DESIGN.md rule 7), in the
 * order the list sorts by, on a tint drawn from the card's UID, so it stays
 * while the name is typed or changed.
 */
export function InitialsAvatar({
  family,
  given,
  seed,
  className,
}: {
  family: string;
  given: string;
  /** What picks the tint: the card's UID. */
  seed: string;
  /** Size, radius and type size. */
  className: string;
}) {
  const sortBy = usePreferences((state) => state.sortBy);
  const [first, second] = sortBy === "given" ? [given, family] : [family, given];
  const letters = `${first.charAt(0)}${second.charAt(0)}`.toUpperCase();
  return (
    <span
      aria-hidden="true"
      style={{ backgroundColor: `var(--avatar-tint-${tintOf(seed)})` }}
      className={cn(
        "grid shrink-0 place-items-center font-display font-bold text-avatar-foreground",
        className,
      )}
    >
      {letters || "?"}
    </span>
  );
}

/** One of the six `--avatar-tint-*` tokens, always the same for a seed. */
export function tintOf(seed: string): number {
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0;
  return (hash % 6) + 1;
}

/** An organisation's card: a building instead of initials. */
export function BuildingAvatar({ className }: { className: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("grid shrink-0 place-items-center bg-avatar text-avatar-foreground", className)}
    >
      <BuildingIcon className="size-1/2" />
    </span>
  );
}
