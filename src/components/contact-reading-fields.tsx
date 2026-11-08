import { Children, createContext, type ReactNode, useContext } from "react";
import { cn } from "@/lib/utils";
import { usePreferences } from "@/store/preferences";

const SectionAction = createContext<ReactNode>(undefined);

export function ReadingSection({
  id,
  title,
  heading: Heading = "h2",
  action,
  children,
}: {
  id?: string;
  title: string;
  heading?: "h2" | "h3";
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className="group/section relative border-t pt-1 xl:grid xl:grid-cols-[7.5rem_minmax(0,1fr)] xl:items-baseline xl:gap-x-3 xl:border-0 xl:pt-0"
    >
      <div className="flex min-h-8 items-center justify-between gap-2">
        <Heading className="text-sm font-bold">{title}</Heading>
      </div>
      <div className="min-w-0">
        {Children.map(children, (child, index) => (
          <SectionAction value={index === 0 ? action : undefined}>{child}</SectionAction>
        ))}
      </div>
    </section>
  );
}

export function ReadingRow({
  label,
  action,
  children,
}: {
  label?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  const editAction = useContext(SectionAction);
  const position = usePreferences((state) => state.labelPosition);
  return (
    <div className="flex min-h-11 items-center gap-x-2 py-1.5">
      <div
        className={cn(
          "flex min-w-0 flex-1 gap-x-3 gap-y-0.5",
          position === "auto"
            ? "flex-col xl:flex-row xl:items-baseline"
            : position === "above"
              ? "flex-col"
              : "flex-row items-baseline",
        )}
      >
        {label !== undefined && (
          <div
            data-contact-label
            className={cn(
              "shrink-0 break-words text-sm text-muted-foreground",
              position === "auto"
                ? "xl:w-[5.5rem]"
                : position === "left"
                  ? "w-[5.5rem]"
                  : undefined,
            )}
          >
            {label}
          </div>
        )}
        <div data-contact-value className="min-w-0 max-w-full flex-1">
          {children}
        </div>
      </div>
      {action !== undefined && (
        <div className="shrink-0 max-sm:[@media(hover:none)]:hidden">{action}</div>
      )}
      {editAction !== undefined && (
        <div className="absolute right-0 top-0 shrink-0 xl:static">{editAction}</div>
      )}
    </div>
  );
}
