/**
 * The group format question (DESIGN.md "Group format question", ADR 052
 * rule 4): asked when a group added in the form gets no format from rules
 * 1 to 3.
 */
import { useEffect, useId, useRef, useState } from "react";
import { useI18n } from "@/i18n/react";
import { type FormatQuestion, GROUP_FORMATS, type GroupFormat } from "@/lib/group-format";
import { buttonClass } from "./ui/button";
import { Dialog, DialogActions, DialogTitle } from "./ui/dialog";

/** A contact: head and shoulders. */
function Person({ x, y }: { x: number; y: number }) {
  return (
    <g className="fill-muted-foreground">
      <circle cx={x} cy={y - 1.8} r="2" />
      <path d={`M${x - 3.4} ${y + 4}a3.4 2.8 0 0 1 6.8 0z`} />
    </g>
  );
}

/**
 * Where the group lives, in ink: the header of one card listing three
 * contacts, or a tag on each of three contacts.
 */
function StorageDrawing({ format, name }: { format: GroupFormat; name: string }) {
  const label = (x: number, y: number) => (
    <text
      x={x}
      y={y}
      textAnchor="middle"
      className="fill-background"
      fontSize="6.4"
      fontWeight="700"
    >
      {name}
    </text>
  );
  return (
    <span className="flex h-20 w-24 shrink-0 items-center justify-center rounded-md bg-muted sm:h-24 sm:w-36">
      <svg viewBox="0 0 72 48" className="h-16 w-24 sm:h-20 sm:w-[7.5rem]" aria-hidden="true">
        {format === "cards" ? (
          <>
            <rect
              x="14"
              y="1"
              width="44"
              height="46"
              rx="5"
              className="fill-background stroke-muted-foreground"
              strokeWidth="1.5"
            />
            <path d="M14 13V6a5 5 0 0 1 5-5h34a5 5 0 0 1 5 5v7z" className="fill-foreground" />
            {label(36, 9.4)}
            {[21, 30, 39].map((y) => (
              <g key={y}>
                <Person x={22} y={y} />
                <line
                  x1="29"
                  y1={y}
                  x2="50"
                  y2={y}
                  className="stroke-muted-foreground"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              </g>
            ))}
          </>
        ) : (
          [1, 17, 33].map((y) => (
            <g key={y}>
              <rect
                x="2"
                y={y}
                width="68"
                height="14"
                rx="3.5"
                className="fill-background stroke-muted-foreground"
                strokeWidth="1.5"
              />
              <Person x={10} y={y + 7} />
              <line
                x1="17"
                y1={y + 7}
                x2="34"
                y2={y + 7}
                className="stroke-muted-foreground"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
              <rect x="44" y={y + 3} width="22" height="8" rx="4" className="fill-foreground" />
              {label(55, y + 9.3)}
            </g>
          ))
        )}
      </svg>
    </span>
  );
}

export function GroupFormatDialog({
  book,
  group,
  question,
  onCancel,
  onConfirm,
}: {
  /** The book's display name. */
  book: string;
  group: string;
  question: FormatQuestion;
  onCancel: () => void;
  onConfirm: (format: GroupFormat) => void;
}) {
  const { t } = useI18n();
  const titleId = useId();
  const introId = useId();
  const [chosen, setChosen] = useState<GroupFormat>(question.preselected);
  const checkedRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => checkedRef.current?.focus(), []);

  return (
    <Dialog
      titleId={titleId}
      describedBy={introId}
      panelRef={panelRef}
      onDismiss={onCancel}
      className="sm:max-w-xl"
    >
      <DialogTitle id={titleId}>{t("group_format_title", { book })}</DialogTitle>
      <p id={introId} className="mt-3 text-sm">
        {t("group_format_intro", { group })} {t(`group_format_found_${question.finding}`)}
      </p>
      <fieldset className="mt-4 grid gap-3 border-0 p-0">
        <legend className="sr-only">{t("group_format_legend")}</legend>
        {GROUP_FORMATS.map((value) => (
          <label
            key={value}
            className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${
              chosen === value ? "border-foreground ring-1 ring-foreground" : "hover:bg-muted/50"
            }`}
          >
            <input
              ref={value === question.preselected ? checkedRef : undefined}
              type="radio"
              name="group-format"
              value={value}
              checked={chosen === value}
              onChange={() => setChosen(value)}
              className="mt-0.5 size-4 shrink-0 accent-primary"
            />
            <span className="min-w-0 grow">
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-bold">
                {t(`group_format_${value}`)}
                {question.recommended && value === question.preselected && (
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-caption font-bold text-secondary-foreground">
                    {t("group_format_recommended")}
                  </span>
                )}
              </span>
              <span className="mt-0.5 block text-sm text-muted-foreground">
                {t(`group_format_${value}_hint`)}
              </span>
            </span>
            <StorageDrawing format={value} name={t("group_format_example")} />
          </label>
        ))}
      </fieldset>
      <p className="mt-4 text-sm text-muted-foreground">{t("group_format_kept")}</p>
      <DialogActions>
        <button type="button" onClick={onCancel} className={buttonClass({ variant: "outline" })}>
          {t("cancel")}
        </button>
        <button type="button" onClick={() => onConfirm(chosen)} className={buttonClass()}>
          {t("group_format_confirm")}
        </button>
      </DialogActions>
    </Dialog>
  );
}
