/**
 * ContactPage — the contact detail page in VIEW mode, per DESIGN.md
 * "Contact page: one skeleton, two states".
 *
 * Renders inside the detail pane's Outlet. Edit mode is the next task; this
 * page ships only the view layer, with every value wrapped in the stacked
 * EditableCell so nothing shifts when edit lands. Deferred on purpose (no
 * dead controls): pencil icons, favourite, "Modifié le", delete button,
 * add-field pills, sticky bottom bar, and the edit-mode field layers.
 */

import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useI18n } from "@/i18n/react";
import type { TranslationKey } from "@/i18n/setup";
import { contactById, namePartsOf, primaryNumberOf } from "@/lib/contact-list";
import { birthdayDateTime, formatBirthday } from "@/lib/format-birthday";
import { formatPhone } from "@/lib/format-phone";
import { cn } from "@/lib/utils";
import type { Contact, ContactField } from "@/model/contact";
import {
  addressOf,
  birthdayOf,
  groupsOf,
  jobTitleOf,
  noteOf,
  orgOf,
  typeValuesOf,
  type VCardAddress,
} from "@/vcard";
import { EditableCell } from "./editable-cell";

type ContactPageProps = {
  /** Contacts of the selected book; undefined while the book is loading. */
  contacts: Contact[] | undefined;
  /** The /contacts/$id route parameter. */
  id: string;
};

/**
 * The page for one contact. While the book is loading it renders nothing —
 * the same quiet blank the list pane shows. Once loaded, an id outside the
 * book gets an honest not-found state.
 */
export function ContactPage({ contacts, id }: ContactPageProps) {
  if (contacts === undefined) return null;
  const contact = contactById(contacts, id);
  return contact === undefined ? <NotFoundView /> : <ContactFiche contact={contact} />;
}

// ---------------------------------------------------------------------------
// Mobile top bar (56px) — the page's own, replacing the old pane-level hack.
// ---------------------------------------------------------------------------

function MobileTopBar() {
  const { t } = useI18n();
  return (
    <div className="sticky top-0 z-20 flex h-14 items-center border-b bg-muted/95 px-2 backdrop-blur lg:hidden">
      <Link
        to="/contacts"
        activeOptions={{ exact: true }}
        aria-label={t("back_to_list")}
        className="inline-flex h-10 items-center gap-1.5 rounded-full pl-2 pr-3 text-sm font-bold hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-muted"
      >
        <ChevronLeftIcon />
        <span>{t("list_label")}</span>
      </Link>
    </div>
  );
}

function ChevronLeftIcon() {
  return (
    <svg
      className="size-5 shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Not-found state
// ---------------------------------------------------------------------------

function NotFoundView() {
  const { t } = useI18n();
  return (
    <>
      <MobileTopBar />
      <div className="mx-auto w-full max-w-[44rem] px-5 pb-10 pt-6 sm:px-8 lg:px-10 lg:pt-10 xl:px-14">
        <div className="px-4 py-14 text-center">
          <p className="font-display text-3xl font-bold leading-tight">{t("contact_not_found")}</p>
          <p className="mt-2 text-sm leading-snug text-muted-foreground">
            {t("contact_not_found_body")}
          </p>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// The fiche — view mode only
// ---------------------------------------------------------------------------

/** Shared box sizing for value cells (matches the mockup's input text). */
const TEXT = "text-base lg:text-[0.9375rem]";

/** Name cells: larger fixed heights per DESIGN.md, display typeface. */
const NAME_FRAME =
  "h-12 font-display text-[2.25rem] font-bold leading-none tracking-[-0.005em] sm:h-14 sm:text-[2.75rem] lg:h-15 lg:text-person";

function ContactFiche({ contact }: { contact: Contact }) {
  const { t, locale } = useI18n();
  const parts = namePartsOf(contact);
  const orgOnly = parts.display.length === 0;
  const jobTitle = jobTitleOf(contact);
  const org = orgOf(contact);
  const primary = primaryNumberOf(contact);
  const firstEmail = contact.fields.email[0];
  const address = addressOf(contact);
  const addressHasContent =
    address !== null &&
    [
      address.poBox,
      address.extended,
      address.street,
      address.locality,
      address.region,
      address.postalCode,
      address.country,
    ].some((part) => part.length > 0);
  const birthday = birthdayOf(contact);
  const note = noteOf(contact);
  const groups = groupsOf(contact);

  return (
    <article className="group/fiche" data-mode="view" aria-labelledby="fiche-title">
      <MobileTopBar />
      <div className="mx-auto w-full max-w-[44rem] px-5 pb-10 pt-6 sm:px-8 lg:px-10 lg:pt-10 xl:px-14">
        {/* Visually-hidden heading: the visible name is two display cells. */}
        <h1 id="fiche-title" className="sr-only">
          {parts.display}
        </h1>

        <div className="flex items-start justify-between gap-6">
          {orgOnly ? (
            <BuildingAvatar />
          ) : (
            <InitialsAvatar family={parts.family} given={parts.given} />
          )}
          {/* Favourite + "Modifier" arrive with the edit task. */}
        </div>

        <div className="-mx-3 mt-5 space-y-1">
          <EditableCell
            frameClassName={NAME_FRAME}
            view={<span className="truncate">{parts.family}</span>}
          />
          {parts.given.length > 0 && (
            <EditableCell
              frameClassName={cn(NAME_FRAME, "text-muted-foreground")}
              view={<span className="truncate">{parts.given}</span>}
            />
          )}
        </div>

        {(jobTitle.length > 0 || org.length > 0) && (
          <div className="-mx-3.5 mt-1 grid gap-1 sm:grid-cols-2">
            {jobTitle.length > 0 && (
              <EditableCell
                frameClassName={cn(TEXT, "text-muted-foreground")}
                view={<span className="truncate">{jobTitle}</span>}
              />
            )}
            {org.length > 0 && (
              <EditableCell
                frameClassName={cn(TEXT, "text-muted-foreground")}
                view={<span className="truncate">{org}</span>}
              />
            )}
          </div>
        )}

        {(primary || firstEmail) && (
          <div className="mt-5">
            <EditableCell
              unboxed
              view={
                <div className="flex flex-wrap gap-2">
                  {primary && (
                    <a href={`tel:${primary.value}`} className={PRIMARY_PILL}>
                      <PhoneIcon />
                      {t("call")}
                    </a>
                  )}
                  {primary && (
                    <a href={`sms:${primary.value}`} className={OUTLINE_PILL}>
                      {t("sms")}
                    </a>
                  )}
                  {firstEmail && (
                    <a href={`mailto:${firstEmail.value}`} className={OUTLINE_PILL}>
                      <MailIcon />
                      {t("write")}
                    </a>
                  )}
                </div>
              }
            />
          </div>
        )}

        <div className="mt-8 space-y-7">
          {contact.fields.tel.length > 0 && (
            <Section title={t("s_phones")}>
              {contact.fields.tel.map((field) => (
                <ValueRow
                  key={fieldRowKey(field)}
                  type={<TypeCell field={field} />}
                  value={
                    <EditableCell
                      frameClassName={cn(TEXT, field === primary && "text-xl font-bold tabular")}
                      view={
                        <a
                          href={`tel:${field.value}`}
                          className="block min-w-0 truncate hover:underline"
                        >
                          {formatPhone(field.value)}
                        </a>
                      }
                    />
                  }
                  action={<CopyButton label={t("copy_tel")} value={field.value} />}
                />
              ))}
            </Section>
          )}

          {contact.fields.email.length > 0 && (
            <Section title={t("s_emails")}>
              {contact.fields.email.map((field) => (
                <ValueRow
                  key={fieldRowKey(field)}
                  type={<TypeCell field={field} />}
                  value={
                    <EditableCell
                      frameClassName={TEXT}
                      view={
                        <a
                          href={`mailto:${field.value}`}
                          className="block min-w-0 truncate hover:underline"
                        >
                          {field.value}
                        </a>
                      }
                    />
                  }
                  action={<CopyButton label={t("copy_email")} value={field.value} />}
                />
              ))}
            </Section>
          )}

          {address !== null && addressHasContent && (
            <Section title={t("s_address")}>
              <ValueRow
                type={<AddressTypeCell address={address} />}
                value={<AddressValue address={address} />}
                action={<CopyButton label={t("copy_adr")} value={addressCopyText(address)} />}
              />
            </Section>
          )}

          {birthday !== null && birthday.source.length > 0 && (
            <Section title={t("s_bday")}>
              <ValueRow
                value={
                  <EditableCell
                    frameClassName={TEXT}
                    view={
                      <time dateTime={birthdayDateTime(birthday)}>
                        {formatBirthday(birthday, locale)}
                      </time>
                    }
                  />
                }
                action={<CopyButton label={t("copy_bday")} value={birthday.source} />}
              />
            </Section>
          )}

          {groups.length > 0 && (
            <Section title={t("s_groups")}>
              <div className="px-3.5 py-1.5">
                <ul className="flex min-h-8 flex-wrap items-center gap-2">
                  {groups.map((group) => (
                    <li
                      key={group}
                      className="inline-flex h-8 items-center rounded-full bg-background px-3 text-sm font-bold"
                    >
                      {group}
                    </li>
                  ))}
                </ul>
              </div>
            </Section>
          )}

          {note.length > 0 && (
            <Section title={t("s_note")}>
              <EditableCell
                frameClassName={cn(
                  "h-auto min-h-[6rem] items-start py-2.5 text-base leading-relaxed whitespace-pre-wrap lg:text-[0.9375rem]",
                )}
                view={<span>{note}</span>}
              />
            </Section>
          )}
        </div>
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Sections and rows
// ---------------------------------------------------------------------------

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t-2 border-foreground pt-1.5">
      <h2 className="flex h-11 items-center text-sm font-bold">{title}</h2>
      <div className="-mx-3.5 space-y-3 sm:space-y-1">{children}</div>
    </section>
  );
}

/**
 * Stable display key for a value row: the field's own data. Rows are
 * display-only (never reordered between renders), so value + params is
 * enough — while noArrayIndexKey stays silent.
 */
function fieldRowKey(field: ContactField): string {
  return `${field.value}\u0000${field.params ? JSON.stringify(field.params) : ""}`;
}

/**
 * One value row: type | value | action on sm+, type and action sharing line 1
 * (and value wrapping to line 2) below sm. Birthday/note rows have no type
 * column — the value spans the full width (DESIGN.md "Rows").
 */
function ValueRow({
  type,
  value,
  action,
}: {
  type?: ReactNode;
  value: ReactNode;
  action?: ReactNode;
}) {
  if (type === undefined) {
    return (
      <div className="grid grid-cols-[1fr_auto] gap-x-2">
        <div className="min-w-0">{value}</div>
        {action !== undefined && <div>{action}</div>}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-[1fr_auto] gap-x-2 sm:grid-cols-[8.5rem_1fr_auto]">
      <div className="col-start-1 row-start-1">{type}</div>
      {action !== undefined && (
        <div className="col-start-2 row-start-1 sm:col-start-3">{action}</div>
      )}
      <div className="col-span-2 min-w-0 sm:col-span-1 sm:col-start-2 sm:row-start-1">{value}</div>
    </div>
  );
}

/**
 * The type label ("Natel" / "Travail" …) of a TEL or EMAIL field. Reads the
 * TYPE parameter, falling back to "Autre" when absent or unrecognised.
 */
function TypeCell({ field }: { field: ContactField }) {
  return <TypeLabel types={typeValuesOf(field)} />;
}

function AddressTypeCell({ address }: { address: VCardAddress }) {
  return <TypeLabel types={address.type} />;
}

function TypeLabel({ types }: { types: string[] }) {
  const { t } = useI18n();
  const key: TranslationKey = types.includes("cell")
    ? "t_cell"
    : types.includes("work")
      ? "t_work"
      : types.includes("home")
        ? "t_home"
        : "t_other";
  return (
    <EditableCell
      frameClassName="h-9 text-sm font-bold text-muted-foreground sm:h-11"
      view={<span>{t(key)}</span>}
    />
  );
}

/** The address value block: street / NPA + localité / pays, each a cell. */
function AddressValue({ address }: { address: VCardAddress }) {
  return (
    <div className="space-y-1">
      {address.street.length > 0 && (
        <EditableCell
          frameClassName={TEXT}
          view={<span className="truncate">{address.street}</span>}
        />
      )}
      {(address.postalCode.length > 0 || address.locality.length > 0) && (
        <div className="grid grid-cols-[5.5rem_1fr] gap-1">
          {address.postalCode.length > 0 && (
            <EditableCell
              frameClassName={TEXT}
              view={<span className="truncate">{address.postalCode}</span>}
            />
          )}
          {address.locality.length > 0 && (
            <EditableCell
              frameClassName={TEXT}
              view={<span className="truncate">{address.locality}</span>}
            />
          )}
        </div>
      )}
      {address.country.length > 0 && (
        <EditableCell
          frameClassName={cn(TEXT, "text-muted-foreground")}
          view={<span className="truncate">{address.country}</span>}
        />
      )}
    </div>
  );
}

/**
 * What the address copy button puts on the clipboard: the raw stored parts
 * joined the way the row displays them (there is no single raw ADR string —
 * the property is 7 structured parts).
 */
function addressCopyText(address: VCardAddress): string {
  const lines = [
    address.street,
    [address.postalCode, address.locality].filter((part) => part.length > 0).join(" "),
    address.country,
  ].filter((part) => part.length > 0);
  return lines.join(", ");
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

function CopyButton({ label, value }: { label: string; value: string }) {
  return (
    <EditableCell
      unboxed
      cellClassName="justify-items-end"
      view={
        <button
          type="button"
          aria-label={label}
          onClick={() => {
            const promise = navigator.clipboard?.writeText(value);
            if (promise !== undefined) promise.catch(() => {});
          }}
          className="inline-flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-background hover:text-foreground sm:size-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-muted"
        >
          <CopyIcon />
        </button>
      }
    />
  );
}

// ---------------------------------------------------------------------------
// Avatars and icons
// ---------------------------------------------------------------------------

/** Initials avatar per DESIGN.md rule 7 (no photo → initials on bg-avatar). */
function InitialsAvatar({ family, given }: { family: string; given: string }) {
  const letters = `${family.charAt(0)}${given.charAt(0)}`.toUpperCase();
  return (
    <span
      aria-hidden="true"
      className="grid size-24 shrink-0 place-items-center rounded-xl bg-avatar font-display text-5xl font-bold text-avatar-foreground sm:size-28"
    >
      {letters || "?"}
    </span>
  );
}

/** Organisation-only cards get a building icon instead of initials. */
function BuildingAvatar() {
  return (
    <span
      aria-hidden="true"
      className="grid size-24 shrink-0 place-items-center rounded-xl bg-avatar text-avatar-foreground sm:size-28"
    >
      <svg
        className="size-12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <rect x="4" y="2" width="16" height="20" rx="2" />
        <path d="M9 22v-4h6v4M8 6h.01M16 6h.01M12 6h.01M12 10h.01M12 14h.01M16 10h.01M16 14h.01M8 10h.01M8 14h.01" />
      </svg>
    </span>
  );
}

function PhoneIcon() {
  return (
    <svg
      className="size-4 shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg
      className="size-4 shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 7-10 6L2 7" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg
      className="size-[1.125rem] shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Pill recipes (DESIGN.md "Buttons")
// ---------------------------------------------------------------------------

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

const PRIMARY_PILL = cn(
  "inline-flex h-10 items-center justify-center gap-2 rounded-full bg-primary px-4 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/85",
  FOCUS_RING,
);

const OUTLINE_PILL = cn(
  "inline-flex h-10 items-center justify-center gap-2 rounded-full border border-input bg-background px-4 text-sm font-bold transition-colors hover:bg-accent",
  FOCUS_RING,
);
