/** The list's letter sections and their rows, with search matches marked. */

import { Link } from "@tanstack/react-router";
import { useI18n } from "@/i18n/react";
import {
  type ContactGroup,
  contactIdOf,
  type HighlightSegment,
  isOrgCard,
  isUnnamed,
  namePartsOf,
  orderedNameOf,
  type SortBy,
  splitByQuery,
  trailingValueOf,
} from "@/lib/contact-list";
import { formatPhone } from "@/lib/format-phone";
import type { Contact } from "@/model/contact";
import { BuildingAvatar, InitialsAvatar, PhotoAvatar } from "./photo-avatar";

export function GroupSection({
  group,
  query,
  sortBy,
}: {
  group: ContactGroup;
  query: string;
  sortBy: SortBy;
}) {
  return (
    <section
      id={`g-${group.letter}`}
      className="grid scroll-mt-[calc(var(--header-h)+0.125rem)] grid-cols-[2.75rem_1fr] border-t py-2 first:border-t-0 sm:grid-cols-[3rem_1fr] lg:scroll-mt-0"
    >
      <h2 className="sticky top-[var(--header-h)] self-start pl-2 pt-4 font-display text-title-sm font-bold leading-[0.8] text-brand sm:pt-3.5 lg:top-2">
        {group.letter}
      </h2>
      {/* biome-ignore lint/a11y/noRedundantRoles: DESIGN.md mandates <ul role="list"> */}
      <ul role="list" className="min-w-0">
        {group.contacts.map((contact) => (
          <ContactRow key={contact.href} contact={contact} query={query} sortBy={sortBy} />
        ))}
      </ul>
    </section>
  );
}

function ContactRow({
  contact,
  query,
  sortBy,
}: {
  contact: Contact;
  query: string;
  sortBy: SortBy;
}) {
  const { family, given } = namePartsOf(contact);
  const { lead, rest, display } = orderedNameOf(contact, sortBy);
  const trailing = trailingValueOf(contact);
  const id = contactIdOf(contact);
  const orgCard = isOrgCard(contact);
  const unnamed = isUnnamed(contact);
  const { t } = useI18n();

  const nameValue = unnamed ? (
    <span className="italic text-muted-foreground">{t("contact_unnamed")}</span>
  ) : (
    <>
      <b className="font-bold">
        <Marked value={lead} query={query} />
      </b>
      {rest && (
        <>
          {" "}
          <span className="font-medium">
            <Marked value={rest} query={query} />
          </span>
        </>
      )}
    </>
  );

  return (
    <li>
      {/*
        The router's Link marks the active row with aria-current="page" and
        data-status="active"; the selection styles key on data-status, which
        only the active row carries.
      */}
      <Link
        to="/contacts/$id"
        params={{ id }}
        data-contact-id={id}
        className="group relative flex min-h-[3.5rem] items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted data-[status=active]:bg-selection data-[status=active]:text-selection-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:min-h-[3.25rem] sm:py-0"
      >
        <span
          aria-hidden="true"
          className="absolute inset-y-2.5 left-0 w-[3px] rounded-full bg-brand opacity-0 transition-opacity group-data-[status=active]:opacity-100"
        />
        <PhotoAvatar
          contact={contact}
          lazy
          className="size-10 rounded-lg"
          fallback={
            orgCard ? (
              <BuildingAvatar className="size-10 rounded-lg" />
            ) : (
              <InitialsAvatar
                family={family}
                given={given}
                seed={contact.uid || contact.href}
                className="size-10 rounded-lg text-lg"
              />
            )
          }
        />
        <span className="min-w-0 flex-1 sm:flex sm:items-center sm:gap-3">
          <span
            className="block min-w-0 truncate text-name"
            title={unnamed ? t("contact_unnamed") : display}
          >
            {nameValue}
          </span>
          {trailing && <span className="leader hidden sm:block" aria-hidden="true" />}
          {trailing &&
            (trailing.kind === "tel" ? (
              <span className="block truncate text-sm tabular text-muted-foreground sm:shrink-0 sm:text-foreground">
                <TelMarked value={trailing.value} query={query} />
              </span>
            ) : (
              <span className="block truncate text-sm text-muted-foreground sm:max-w-[42%] sm:shrink-0">
                <Marked value={trailing.value} query={query} />
              </span>
            ))}
        </span>
      </Link>
    </li>
  );
}

/** <mark> around every fold-insensitive match inside `value`. */
function Marked({ value, query }: { value: string; query: string }) {
  const segments: HighlightSegment[] = splitByQuery(value, query);
  if (segments.length === 1 && !(segments[0]?.hit ?? false)) return <>{value}</>;
  return <MarkedSegments segments={segments} />;
}

/**
 * Like Marked but for phone numbers: also matches digit-only queries against
 * the digit form of the displayed value. When a digit query matches the
 * digits-only form, the entire formatted value is marked.
 */
function TelMarked({ value, query }: { value: string; query: string }) {
  const formatted = formatPhone(value);
  const segments = splitByQuery(formatted, query);
  if (segments.length > 1 || (segments[0]?.hit ?? false)) {
    return <MarkedSegments segments={segments} />;
  }
  const qDigits = query.replace(/[\s.+-]/g, "");
  if (qDigits.length >= 3) {
    const formattedDigits = formatted.replace(/[\s.+-]/g, "");
    const digitSegments = splitByQuery(formattedDigits, qDigits);
    if (digitSegments.length > 1 || (digitSegments[0]?.hit ?? false)) {
      return <mark>{formatted}</mark>;
    }
  }
  return <>{formatted}</>;
}

function MarkedSegments({ segments }: { segments: HighlightSegment[] }) {
  return (
    <>
      {segments.map((segment, index) =>
        segment.hit ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: static display segments
          <mark key={index}>{segment.text}</mark>
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: same as above
          <span key={index}>{segment.text}</span>
        ),
      )}
    </>
  );
}
