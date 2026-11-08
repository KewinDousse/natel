/** The list's letter sections and their rows, with search matches marked. */

import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { memo, useLayoutEffect, useRef, useState } from "react";
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
import { useBookParam } from "@/store/session";
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
  // The list only has contacts once a book is selected.
  const book = useBookParam();
  if (book === undefined) return null;
  return (
    <SectionFrame letter={group.letter}>
      {/* biome-ignore lint/a11y/noRedundantRoles: DESIGN.md mandates <ul role="list"> */}
      <ul role="list" className="min-w-0">
        {group.contacts.map((contact) => (
          <li key={contact.href}>
            <ContactRow book={book} contact={contact} query={query} sortBy={sortBy} />
          </li>
        ))}
      </ul>
    </SectionFrame>
  );
}

/** A letter section around its list of rows. */
export function SectionFrame({ letter, children }: { letter: string; children: ReactNode }) {
  return (
    <section
      id={`g-${letter}`}
      className="grid scroll-mt-[calc(var(--header-h)+0.125rem)] grid-cols-[2.75rem_1fr] border-t py-2 sm:grid-cols-[3rem_1fr] lg:scroll-mt-0"
    >
      <h2 className="sticky top-[var(--header-h)] self-start pl-2 pt-4 font-display text-title-sm font-bold leading-[0.8] text-brand sm:pt-3.5 lg:top-2">
        {letter}
      </h2>
      {children}
    </section>
  );
}

/** A contact's row, inside the `<li>` its list gives it. */
export const ContactRow = memo(ContactRowContent);

function ContactRowContent({
  book,
  contact,
  query,
  sortBy,
}: {
  book: string;
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
  const fullName = unnamed ? t("contact_unnamed") : display;
  const contentRef = useRef<HTMLSpanElement>(null);
  const nameRef = useRef<HTMLSpanElement>(null);
  const valueRef = useRef<HTMLSpanElement>(null);
  const leaderRef = useRef<HTMLSpanElement>(null);
  const [showLeader, setShowLeader] = useState(true);

  useLayoutEffect(() => {
    const content = contentRef.current;
    const name = nameRef.current;
    const value = valueRef.current;
    const leader = leaderRef.current;
    if (!content || !name || !value || !leader || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const gap = Number.parseFloat(getComputedStyle(content).columnGap) || 0;
      const minimum = Number.parseFloat(getComputedStyle(leader).minWidth) || 0;
      // The name keeps its space before the leader gets its minimum width and gaps.
      setShowLeader(
        name.scrollWidth + value.getBoundingClientRect().width + minimum + 2 * gap <=
          content.clientWidth,
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(content);
    observer.observe(name);
    observer.observe(value);
    return () => observer.disconnect();
  });

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
    <>
      {/*
        The router's Link marks the active row with aria-current="page" and
        data-status="active"; the selection styles key on data-status, which
        only the active row carries.
      */}
      <Link
        to="/contacts/$book/$id"
        params={{ book, id }}
        data-contact-id={id}
        className="group relative flex min-h-[3.5rem] items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted data-[status=active]:bg-selection data-[status=active]:text-selection-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:min-h-[3.25rem] sm:py-0"
      >
        <span
          aria-hidden="true"
          className="absolute top-1/2 left-0 h-5 w-[3px] -translate-y-1/2 rounded-full bg-brand opacity-0 transition-opacity group-data-[status=active]:opacity-100"
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
        <span ref={contentRef} className="min-w-0 flex-1 sm:flex sm:items-center sm:gap-3">
          <span ref={nameRef} className="block min-w-0 truncate text-name" title={fullName}>
            {nameValue}
          </span>
          {trailing && (
            <span
              ref={leaderRef}
              hidden={!showLeader}
              className="leader hidden sm:block"
              aria-hidden="true"
            />
          )}
          {trailing &&
            (trailing.kind === "tel" ? (
              <span
                ref={valueRef}
                className="block truncate text-sm tabular text-muted-foreground sm:shrink-0 sm:text-foreground"
              >
                <TelMarked value={trailing.value} query={query} />
              </span>
            ) : (
              <span
                ref={valueRef}
                className="block truncate text-sm text-muted-foreground sm:max-w-[42%] sm:shrink-0"
              >
                <Marked value={trailing.value} query={query} />
              </span>
            ))}
        </span>
      </Link>
    </>
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
  let offset = 0;
  return (
    <>
      {segments.map((segment) => {
        const start = offset;
        offset += segment.text.length;
        return segment.hit ? (
          <mark key={start}>{segment.text}</mark>
        ) : (
          <span key={start}>{segment.text}</span>
        );
      })}
    </>
  );
}
