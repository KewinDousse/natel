/**
 * A contact's photo in its avatar square (ADR 023, DESIGN.md rule 7), or the
 * fallback (initials, building icon) when there is none or it doesn't load.
 * Decorative: the name is always next to it.
 */

import { type ReactNode, useMemo, useState } from "react";
import type { Contact } from "@/model/contact";
import { photoOf } from "@/vcard";

export function PhotoAvatar({
  contact,
  className,
  lazy = false,
  fallback,
}: {
  contact: Contact;
  className: string;
  /** For the list, where a book's photos can weigh several MB. */
  lazy?: boolean;
  fallback: ReactNode;
}) {
  const src = useMemo(() => {
    const photo = photoOf(contact);
    return photo ? `data:${photo.mediaType};base64,${photo.base64}` : null;
  }, [contact]);
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
