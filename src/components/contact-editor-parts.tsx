/**
 * The edit form's building blocks: a labelled field, a value row with its
 * type menu and remove button, an error line, and the groups editor.
 */

import { type ReactNode, useId, useRef, useState } from "react";
import { useI18n } from "@/i18n/react";
import { cn } from "@/lib/utils";
import { fieldClass } from "./ui/button";
import { XSmallIcon } from "./ui/icons";

export function Field({ label, children }: { label: string; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div className="min-w-0 space-y-1">
      <label htmlFor={id} className="block text-sm font-bold">
        {label}
      </label>
      {children(id)}
    </div>
  );
}

/**
 * A value with its type menu and its remove button, on one line when the
 * field keeps 10rem; on a narrow phone the field and the button wrap under
 * the menu. An address, `wide`, always takes its own line on phones.
 */
export function EditRow({
  type,
  remove,
  error,
  wide = false,
  children,
}: {
  type: ReactNode;
  remove?: ReactNode;
  error?: ReactNode;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start gap-x-2 gap-y-1.5">
      <div className="w-[6.5rem] shrink-0 sm:w-[7.5rem]">{type}</div>
      <div className={cn("min-w-40 flex-1", wide && "max-sm:basis-full")}>
        {children}
        {error}
      </div>
      {/* Without a button, the same room keeps the fields aligned with the others. */}
      {remove ? (
        <div className="shrink-0">{remove}</div>
      ) : (
        <div aria-hidden="true" className="hidden w-10 shrink-0 sm:block" />
      )}
    </div>
  );
}

export function ErrorText({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={id} className="mt-1 text-sm text-destructive">
      {children}
    </p>
  );
}

/**
 * Groups in edit mode (DESIGN.md): the chips gain a ×, and an "Ajouter un
 * groupe" input ends the line, suggesting the book's other group names.
 */
export function GroupsEditor({
  names,
  suggestions,
  onChange,
}: {
  names: string[];
  suggestions: string[];
  onChange: (names: string[]) => void;
}) {
  const { t } = useI18n();
  const [value, setValue] = useState("");
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  function add() {
    const name = value.trim();
    if (name.length > 0 && !names.includes(name)) onChange([...names, name]);
    setValue("");
  }

  return (
    <ul className="flex flex-wrap items-center gap-2 py-1.5">
      {names.map((name) => (
        <li
          key={name}
          className="inline-flex h-8 items-center gap-1 rounded-full bg-secondary pl-3 pr-1 text-sm font-bold text-secondary-foreground"
        >
          {name}
          <button
            type="button"
            aria-label={t("remove_group", { name })}
            onClick={() => {
              onChange(names.filter((other) => other !== name));
              // The chip and its button go: the focus moves to the input.
              inputRef.current?.focus();
            }}
            className="relative inline-flex size-6 items-center justify-center rounded-full text-muted-foreground after:absolute after:-inset-2 after:content-[''] hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <XSmallIcon />
          </button>
        </li>
      ))}
      <li className="min-w-0 grow sm:grow-0">
        <input
          ref={inputRef}
          type="text"
          value={value}
          list={listId}
          aria-label={t("add_group")}
          placeholder={t("add_group")}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            // ⌘/Ctrl + Enter is the save shortcut, which commits the name itself.
            if (event.key === "Enter" && !event.metaKey && !event.ctrlKey) {
              event.preventDefault();
              add();
            }
          }}
          onBlur={add}
          data-commit-on-blur
          className={fieldClass(
            "h-8 w-full min-w-44 rounded-full px-3 sm:w-56 sm:text-sm lg:text-sm",
          )}
        />
        <datalist id={listId}>
          {suggestions
            .filter((name) => !names.includes(name))
            .map((name) => (
              <option key={name} value={name} />
            ))}
        </datalist>
      </li>
    </ul>
  );
}
