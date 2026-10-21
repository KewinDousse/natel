/**
 * ContactView — the contact page in reading mode (DESIGN.md "Contact page").
 * Laid out for reading, separately from the edit form: only what the card
 * has, compact rows, each address as one block. "Modifier", `E` or a section's
 * pencil switch to the form.
 */

import type { ReactNode } from "react";
import { useI18n } from "@/i18n/react";
import { isWebUrl, valueHref } from "@/lib/contact-edit";
import {
  isOrgCard,
  isUnnamed,
  namePartsOf,
  orderedNameOf,
  primaryNumberOf,
} from "@/lib/contact-list";
import { birthdayCopyText, birthdayDateTime, formatBirthday } from "@/lib/format-birthday";
import { formatPhone } from "@/lib/format-phone";
import { cn } from "@/lib/utils";
import type { Contact } from "@/model/contact";
import { usePreferences } from "@/store/preferences";
import {
  addressesOf,
  birthdayOf,
  jobTitleOf,
  noteOf,
  orgOf,
  typeValuesOf,
  type VCardAddress,
} from "@/vcard";
import { CopyButton, Section, SectionEditButton, TypeLabel } from "./contact-fields";
import { BuildingAvatar, InitialsAvatar, PhotoAvatar } from "./photo-avatar";
import { buttonClass } from "./ui/button";
import {
  CakeIcon,
  GlobeIcon,
  MailIcon,
  MapPinIcon,
  MessageIcon,
  NoteIcon,
  PhoneIcon,
  UsersIcon,
} from "./ui/icons";

export function ContactView({
  contact,
  groups,
  onEdit,
  onCopy,
}: {
  contact: Contact;
  /** The contact's groups, from its card and the book's group cards. */
  groups: string[];
  /** Opens the form, on a section when one is named. */
  onEdit: (section?: string) => void;
  onCopy: (value: string) => void;
}) {
  const { t, locale } = useI18n();
  const parts = namePartsOf(contact);
  const orgCard = isOrgCard(contact);
  const jobTitle = jobTitleOf(contact);
  const org = orgOf(contact);
  const primary = primaryNumberOf(contact);
  const firstEmail = contact.fields.email[0];
  const addresses = addressesOf(contact)
    .map((address) => ({ address, lines: addressLinesOf(address) }))
    .filter(({ lines }) => lines.length > 0);
  const birthday = birthdayOf(contact);
  const note = noteOf(contact);
  const nickname = contact.fields.nickname;
  // An organisation's card is already named after it: only its units remain.
  const orgLine = orgCard ? org.slice(contact.fields.org.length).replace(/^,\s*/, "") : org;
  const subtitle = [jobTitle, orgLine].filter((part) => part.length > 0).join(" · ");

  return (
    <div className="mx-auto w-full max-w-[44rem] px-5 pb-16 pt-6 sm:px-8 lg:px-10 lg:pt-10 xl:px-14">
      <div className="flex items-start justify-between gap-6">
        <PhotoAvatar
          contact={contact}
          className="size-24 rounded-xl sm:size-28"
          fallback={
            orgCard ? (
              <BuildingAvatar className="size-24 rounded-xl sm:size-28" />
            ) : (
              <InitialsAvatar
                family={parts.family}
                given={parts.given}
                seed={contact.uid || contact.href}
                className="size-24 rounded-xl text-5xl sm:size-28"
              />
            )
          }
        />
        <button
          type="button"
          onClick={() => onEdit()}
          aria-label={t("edit_kbd")}
          className={buttonClass({}, "hidden lg:inline-flex")}
        >
          {t("edit")}
        </button>
      </div>

      <ContactName contact={contact} unnamed={isUnnamed(contact)} />
      {subtitle && <p className="mt-2 text-base text-muted-foreground lg:text-body">{subtitle}</p>}
      {nickname && (
        <p className="mt-1 text-base text-muted-foreground lg:text-body">
          {t("nickname_quoted", { nickname })}
        </p>
      )}

      {(primary || firstEmail) && (
        <div className="mt-5 flex flex-wrap gap-2">
          {primary && (
            <a href={valueHref("tel", primary.value)} className={buttonClass({}, "pl-3.5")}>
              <PhoneIcon />
              {t("call")}
            </a>
          )}
          {primary && (
            <a
              href={valueHref("sms", primary.value)}
              className={buttonClass({ variant: "outline" }, "pl-3.5")}
            >
              <MessageIcon />
              {t("sms")}
            </a>
          )}
          {firstEmail && (
            <a
              href={valueHref("mailto", firstEmail.value)}
              className={buttonClass({ variant: "outline" }, "pl-3.5")}
            >
              <MailIcon />
              {t("write")}
            </a>
          )}
        </div>
      )}

      <div className="mt-8 space-y-4">
        {contact.fields.tel.length > 0 && (
          <Section
            id="sec-tel"
            icon={<PhoneIcon />}
            title={t(contact.fields.tel.length > 1 ? "s_phones" : "s_phones_1")}
            action={
              <SectionEditButton
                label={t(contact.fields.tel.length > 1 ? "edit_phones" : "edit_phones_1")}
                onClick={() => onEdit("sec-tel")}
              />
            }
          >
            {keyed(contact.fields.tel, fieldKey).map(([key, field]) => (
              <Row
                key={key}
                label={<TypeLabel types={typeValuesOf(field)} label={field.label} />}
                action={<CopyButton label={t("copy_tel")} onCopy={() => onCopy(field.value)} />}
              >
                <a
                  href={valueHref("tel", field.value)}
                  className={cn(
                    "block truncate tabular hover:underline",
                    field === primary ? "text-lg font-bold sm:text-xl" : "lg:text-body",
                  )}
                >
                  {formatPhone(field.value)}
                </a>
              </Row>
            ))}
          </Section>
        )}

        {contact.fields.email.length > 0 && (
          <Section
            id="sec-email"
            icon={<MailIcon />}
            title={t(contact.fields.email.length > 1 ? "s_emails" : "s_emails_1")}
            action={
              <SectionEditButton
                label={t(contact.fields.email.length > 1 ? "edit_emails" : "edit_emails_1")}
                onClick={() => onEdit("sec-email")}
              />
            }
          >
            {keyed(contact.fields.email, fieldKey).map(([key, field]) => (
              <Row
                key={key}
                label={<TypeLabel types={typeValuesOf(field)} label={field.label} />}
                action={<CopyButton label={t("copy_email")} onCopy={() => onCopy(field.value)} />}
              >
                <a
                  href={valueHref("mailto", field.value)}
                  className="block truncate hover:underline lg:text-body"
                >
                  {field.value}
                </a>
              </Row>
            ))}
          </Section>
        )}

        {addresses.length > 0 && (
          <Section
            id="sec-adr"
            icon={<MapPinIcon />}
            title={t(addresses.length > 1 ? "s_addresses" : "s_address")}
            action={
              <SectionEditButton
                label={t(addresses.length > 1 ? "edit_addresses" : "edit_address")}
                onClick={() => onEdit("sec-adr")}
              />
            }
          >
            {keyed(addresses, ({ lines }) => lines.join("\n")).map(([key, { address, lines }]) => (
              <Row
                key={key}
                label={<TypeLabel types={address.type} label={address.label} />}
                action={
                  <CopyButton label={t("copy_adr")} onCopy={() => onCopy(lines.join(", "))} />
                }
              >
                <address className="not-italic leading-snug lg:text-body">
                  {keyed(lines, (line) => line).map(([key, line]) => (
                    <span key={key} className="block break-words">
                      {line}
                    </span>
                  ))}
                </address>
              </Row>
            ))}
          </Section>
        )}

        {birthday && birthday.source.length > 0 && (
          <Section
            id="sec-bday"
            icon={<CakeIcon />}
            title={t("s_bday")}
            action={<SectionEditButton label={t("edit_bday")} onClick={() => onEdit("sec-bday")} />}
          >
            <Row
              action={
                <CopyButton
                  label={t("copy_bday")}
                  onCopy={() => onCopy(birthdayCopyText(birthday))}
                />
              }
            >
              <time dateTime={birthdayDateTime(birthday)} className="lg:text-body">
                {formatBirthday(birthday, locale)}
              </time>
            </Row>
          </Section>
        )}

        {groups.length > 0 && (
          <Section icon={<UsersIcon />} title={t("s_groups")}>
            <ul className="flex flex-wrap gap-2 py-1.5">
              {groups.map((group) => (
                <li
                  key={group}
                  className="inline-flex h-8 items-center rounded-full bg-secondary px-3 text-sm font-bold text-secondary-foreground"
                >
                  {group}
                </li>
              ))}
            </ul>
          </Section>
        )}

        {contact.fields.url.length > 0 && (
          <Section
            id="sec-url"
            icon={<GlobeIcon />}
            title={t("s_url")}
            action={<SectionEditButton label={t("edit_url")} onClick={() => onEdit("sec-url")} />}
          >
            <Row
              label={
                contact.fields.urlField?.label === undefined ? undefined : (
                  <TypeLabel
                    types={typeValuesOf(contact.fields.urlField)}
                    label={contact.fields.urlField.label}
                  />
                )
              }
            >
              {/* Another scheme could open a local application. */}
              {isWebUrl(contact.fields.url) ? (
                <a
                  href={contact.fields.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block truncate hover:underline lg:text-body"
                >
                  {contact.fields.url}
                </a>
              ) : (
                <span className="block truncate lg:text-body">{contact.fields.url}</span>
              )}
            </Row>
          </Section>
        )}

        {note.length > 0 && (
          <Section
            id="sec-note"
            icon={<NoteIcon />}
            title={t("s_note")}
            action={<SectionEditButton label={t("edit_note")} onClick={() => onEdit("sec-note")} />}
          >
            <p className="whitespace-pre-wrap break-words py-1.5 leading-relaxed lg:text-body">
              {note}
            </p>
          </Section>
        )}
      </div>
    </div>
  );
}

/**
 * One value of a section: type, value and action on one line, the action
 * right after the value. On phones the value goes under its type when they
 * don't fit side by side, and a touch screen has no copy button: a long press
 * on a link already offers to copy.
 */
function Row({
  label,
  action,
  children,
}: {
  label?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-11 items-center gap-x-2 py-1.5">
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5 sm:flex-nowrap">
        {label !== undefined && (
          <div className="w-[5.5rem] shrink-0 text-sm text-muted-foreground sm:w-[7.5rem]">
            {label}
          </div>
        )}
        <div className="min-w-0 max-w-full">{children}</div>
      </div>
      {action !== undefined && (
        <div className="shrink-0 max-sm:[@media(hover:none)]:hidden">{action}</div>
      )}
    </div>
  );
}

/** Each item with a key of its own, even when two items are the same. */
function keyed<T>(items: readonly T[], keyOf: (item: T) => string): [string, T][] {
  const seen = new Map<string, number>();
  return items.map((item) => {
    const base = keyOf(item);
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return [count === 0 ? base : `${base}\u0000${count}`, item];
  });
}

function fieldKey(field: { value: string; params?: unknown }): string {
  return `${field.value}\u0000${JSON.stringify(field.params ?? {})}`;
}

/** An address as it is written on an envelope: what the card has, line by line. */
export function addressLinesOf(address: VCardAddress): string[] {
  return [
    address.poBox,
    address.extended,
    address.street,
    [address.postalCode, address.locality].filter((part) => part.length > 0).join(" "),
    address.region,
    address.country,
  ].filter((line) => line.trim().length > 0);
}

const NAME_CLASS = "mt-5 text-3xl font-bold leading-tight tracking-tight text-balance sm:text-4xl";

/** The contact's name, large, in the text face, in the order the list sorts by. */
function ContactName({ contact, unnamed }: { contact: Contact; unnamed: boolean }) {
  const { t } = useI18n();
  const sortBy = usePreferences((state) => state.sortBy);
  const { family, given, display } = namePartsOf(contact);

  if (unnamed) {
    return (
      <p aria-hidden="true" className={cn(NAME_CLASS, "italic text-muted-foreground")}>
        {t("contact_unnamed")}
      </p>
    );
  }
  return (
    <p aria-hidden="true" className={NAME_CLASS}>
      {family && given ? orderedNameOf(contact, sortBy).display : display || contact.fields.org}
    </p>
  );
}
