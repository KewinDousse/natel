/**
 * A contact's photo in its avatar square (ADR 023, DESIGN.md rule 7), or the
 * fallback (initials, building icon) when there is none or it doesn't load.
 * Decorative: the name is always next to it.
 */

import { type ReactNode, useMemo, useState } from "react";
import type { Contact, PhotoEdit } from "@/model/contact";
import { photoOf } from "@/vcard";

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
      className={`shrink-0 object-cover ${className}`}
    />
  );
}
