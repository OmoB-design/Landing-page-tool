"use client";

import Link from "next/link";
import { type KeyboardEvent, type ReactNode, useRef } from "react";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { GroupChevronIcon } from "@/components/ui/lp-icons";
import { cn } from "@/lib/utils";

// Status-grouped list (DESIGN.md §2; Figma: All Pages and its Page List component): 36 px
// group bands, 48 px rows with hairline dividers, nested child rows.
// Keyboard: ↑/↓ move between group headers and rows, Home/End jump to the ends, Enter opens a
// row, and Enter/Space on a group header collapses or expands it.

const NAV_ITEM = "[data-list-nav]";

/** Moves focus between the list's headers and rows in response to arrow keys. */
export function GroupedList({
  label,
  children,
}: {
  /** Accessible name, e.g. "Pages by status". */
  label: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.defaultPrevented || !ref.current) return;
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const items = Array.from(
      ref.current.querySelectorAll<HTMLElement>(NAV_ITEM),
    );
    // Only when focus is on a header or row: menus opened from a row also bubble keys here.
    const index = items.indexOf(event.target as HTMLElement);
    if (index === -1) return;

    const last = items.length - 1;
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? last
          : event.key === "ArrowDown"
            ? Math.min(index + 1, last)
            : Math.max(index - 1, 0);
    event.preventDefault();
    items[next]?.focus();
  }

  return (
    <div
      ref={ref}
      role="group"
      aria-label={label}
      onKeyDown={handleKeyDown}
      // Figma (All Pages/states): groups sit 16 px apart.
      className="flex flex-col gap-4"
    >
      {children}
    </div>
  );
}

type ListGroupProps = {
  label: string;
  count: number;
  /** Status glyph shown before the label. */
  glyph?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
};

/**
 * A collapsible group: a 36 px foreground-02 band, 16 px in (the status glyph, the label in
 * 13 px medium, the count in a pill and a small chevron), then its rows.
 */
export function ListGroup({
  label,
  count,
  glyph,
  defaultOpen = true,
  children,
}: ListGroupProps) {
  return (
    <Collapsible defaultOpen={defaultOpen} asChild>
      <section>
        <h2>
          <CollapsibleTrigger
            data-list-nav=""
            className="group flex h-9 w-full items-center gap-1 bg-foreground-02 px-4 text-left text-type-body-small font-medium text-heading-01 divider-b-thin -outline-offset-2"
          >
            <span className="flex items-center gap-1.5">
              {glyph}
              <span>{label}</span>
            </span>
            <span className="min-w-5.75 rounded-lg bg-foreground-01 px-1 text-center text-type-caption-1 font-medium text-heading-03 tabular-nums">
              {count}
            </span>
            <GroupChevronIcon className="text-icon-system transition-transform duration-150 ease-out group-data-closed:-rotate-90 motion-reduce:transition-none" />
          </CollapsibleTrigger>
        </h2>
        <CollapsibleContent className="overflow-hidden">
          {/* Figma: rows 2 px apart, the first 2 px under the band. */}
          <ul role="list" className="flex flex-col gap-0.5 pt-0.5">
            {children}
          </ul>
        </CollapsibleContent>
      </section>
    </Collapsible>
  );
}

type ListRowProps = {
  href: string;
  title: ReactNode;
  /** Left of the title: type glyph, key label. */
  leading?: ReactNode;
  /** Right side, inside the link: badges, cost, time, avatar. */
  meta?: ReactNode;
  /** A row menu, outside the link; shown on hover and keyboard focus. */
  actions?: ReactNode;
  /** 1 for a child row (re-build or variant), indented 32 px. */
  level?: 0 | 1;
  /** Nested child rows. */
  children?: ReactNode;
};

/**
 * One 48 px row (Figma: Page List): 16 px in, a hairline below, foreground-01 on hover. The
 * whole row is a link, with an optional menu after it, 12 px from the meta.
 */
export function ListRow({
  href,
  title,
  leading,
  meta,
  actions,
  level = 0,
  children,
}: ListRowProps) {
  return (
    <li>
      <div className="group/row flex h-12 items-center gap-3 pr-4 divider-b-thin hover:bg-foreground-01">
        <Link
          href={href}
          data-list-nav=""
          className={cn(
            "flex h-full min-w-0 flex-1 items-center gap-3 -outline-offset-2",
            level === 1 ? "pl-12" : "pl-4",
          )}
        >
          {leading}
          <span className="min-w-0 flex-1 truncate text-type-body-small font-medium text-heading-01">
            {title}
          </span>
          {meta ? (
            <span className="hidden shrink-0 items-center gap-3 md:flex">
              {meta}
            </span>
          ) : null}
        </Link>
        {actions ? <div className="flex shrink-0">{actions}</div> : null}
      </div>
      {children ? <ul role="list">{children}</ul> : null}
    </li>
  );
}
