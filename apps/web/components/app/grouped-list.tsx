"use client";

import Link from "next/link";
import { type KeyboardEvent, type ReactNode, useRef } from "react";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDownIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

// Status-grouped list (DESIGN.md §2): tinted group bands, 40 px rows, nested child rows.
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
      className="flex flex-col"
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

/** A collapsible group: a full-width tinted header band, then its rows. */
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
            className="group flex h-9 w-full items-center gap-2 bg-surface-muted px-6 text-left text-base font-medium -outline-offset-2 hover:bg-surface-hover"
          >
            {glyph}
            <span>{label}</span>
            <span className="text-sm font-normal text-fg-muted tabular-nums">
              {count}
            </span>
            <ChevronDownIcon
              aria-hidden
              className="size-3.5 text-fg-muted transition-transform duration-150 ease-out group-data-closed:-rotate-90 motion-reduce:transition-none"
            />
          </CollapsibleTrigger>
        </h2>
        <CollapsibleContent className="overflow-hidden">
          <ul role="list">{children}</ul>
        </CollapsibleContent>
      </section>
    </Collapsible>
  );
}

type ListRowProps = {
  href: string;
  title: string;
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

/** One 40 px row: the whole row is a link, with an optional menu after it. */
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
      <div className="group/row flex h-row items-center gap-1 pr-4 hover:bg-surface-hover">
        <Link
          href={href}
          data-list-nav=""
          className={cn(
            "flex h-full min-w-0 flex-1 items-center gap-3 pr-2 -outline-offset-2",
            level === 1 ? "pl-14" : "pl-6",
          )}
        >
          {leading}
          <span className="min-w-0 flex-1 truncate text-base">{title}</span>
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
