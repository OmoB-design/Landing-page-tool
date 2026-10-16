"use client";

import { type ReactNode, useId, useState } from "react";

import { CardChevronIcon } from "@/components/ui/lp-icons";
import { cn } from "@/lib/utils";

/**
 * A folding section of the build page's right panel (Figma Build: Details, Copy changes): 10 px
 * inside 0.5 px Surface/Stroke lines above and below, a 12 px medium title and an 18 px chevron.
 * Open, the title is Heading-02 and the chevron points down in Icon-Nav-Active, with the content
 * 10 px below; folded, the title is Heading-05 and the chevron turns to point right in
 * Icon-System. Opens without a height animation (toggled often); only the chevron turns.
 */
export function CollapsibleSection({
  title,
  defaultOpen = false,
  className,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const contentId = useId();
  return (
    <section
      className={cn("flex flex-col gap-2.5 py-2.5 divider-y-half", className)}
    >
      <h3 className="flex">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={contentId}
          onClick={() => setOpen((value) => !value)}
          className="group flex h-4.5 flex-1 items-center justify-between rounded-xsm text-left text-type-caption-1 font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span
            className={cn(
              "transition-colors duration-150 ease-out",
              open
                ? "text-heading-02"
                : "text-heading-05 group-hover:text-heading-02",
            )}
          >
            {title}
          </span>
          <span
            aria-hidden
            className={cn(
              "flex size-4.5 items-center justify-center transition-transform duration-200 ease-out motion-reduce:transition-none",
              open ? "text-icon-nav-active" : "-rotate-90 text-icon-system",
            )}
          >
            <CardChevronIcon />
          </span>
        </button>
      </h3>
      <div id={contentId} hidden={!open}>
        {children}
      </div>
    </section>
  );
}

/**
 * A fixed section of the right panel (Figma Build: Claim check, Reminders): 10 px above and below
 * (a 0.5 px Surface/Stroke line under it when `divided`), the 12 px medium Heading-02 title with
 * an optional count chip (11 px Heading-01 on Foreground-01, 10 px corners), the content 10 px
 * below.
 */
export function PanelSection({
  title,
  count,
  divided = false,
  className,
  children,
}: {
  title: string;
  count?: number;
  divided?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        "flex flex-col gap-2.5 py-2.5",
        divided && "divider-b-half",
        className,
      )}
    >
      <h3 className="flex h-4.5 items-center gap-1 text-type-caption-1 font-medium text-heading-02">
        {title}
        {count !== undefined ? (
          <span className="rounded-lg bg-foreground-01 px-1.5 text-type-caption-2 font-medium text-heading-01 tabular-nums">
            {count}
          </span>
        ) : null}
      </h3>
      {children}
    </section>
  );
}
