"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DisplayIcon } from "@/components/ui/icons";
import {
  DEFAULT_DISPLAY,
  GROUP_OPTIONS,
  ORDER_OPTIONS,
  PROPERTY_OPTIONS,
  type PageDisplay,
  type PageGrouping,
  type PageOrdering,
  type PageProperty,
  changedDisplayCount,
} from "@/lib/pages/display";
import { type PageFilters, pagesHref } from "@/lib/pages/list";

// Not in a frame yet: the menu follows the Figma menus (Sidebar Menu Option, the row ⋯ menu):
// 2 px padding, 6 px corners, a 0.7 px stroke-strong outline, 12 px medium rows on 4 px
// corners with foreground-02 on hover and focus; a tick marks each current choice.
const ITEM =
  "rounded-xsm py-1 pr-7 pl-1 text-type-caption-1 font-medium text-heading-02 focus:bg-foreground-02 focus:text-heading-02 [&_svg]:size-3.5 [&_svg]:text-icon-system";
const LABEL =
  "px-1 pt-1 pb-0.5 text-type-caption-2 font-medium text-heading-05";
const SECTION = "flex flex-col gap-0.5 pb-1.5 divider-b-thin";

/**
 * Pages view bar → Display (next to Filter, the same pill): group by (status, template type,
 * creator or none), order by (last updated, newest first, cost), and which row details show.
 * Choices live in the URL; the menu stays open while you change them, and the button counts
 * the choices that differ from the defaults.
 */
export function PagesDisplay({
  view,
  filters,
  display,
}: {
  view: "all" | "mine";
  filters: PageFilters;
  display: PageDisplay;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  // Ticks move at once; the list follows when the server answers.
  const [current, setCurrent] = useState(display);
  const [shown, setShown] = useState(display);
  if (shown !== display) {
    setShown(display);
    setCurrent(display);
  }
  const changed = changedDisplayCount(current);

  const apply = (next: PageDisplay) => {
    setCurrent(next);
    startTransition(() =>
      router.replace(pagesHref(view, filters, next), { scroll: false }),
    );
  };
  const keepOpen = (event: Event) => event.preventDefault();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={
            changed > 0 ? `Display, ${changed} changed` : "Display options"
          }
          className="flex h-6.5 items-center gap-1 rounded-sm pr-2 text-type-body-small font-medium text-heading-05 outline-none hover:bg-foreground-01 focus-visible:ring-2 focus-visible:ring-ring aria-expanded:bg-foreground-01"
        >
          <span className="-mr-1 flex size-6.5 items-center justify-center text-icon-system">
            <DisplayIcon aria-hidden className="size-3.5" />
          </span>
          <span className="sr-only sm:not-sr-only">Display</span>
          {changed > 0 ? (
            <span
              aria-hidden
              className="rounded-xsm bg-highlight-indigo-50 px-1 text-type-caption-2 text-text-link tabular-nums"
            >
              {changed}
            </span>
          ) : null}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={6}
        className="flex w-menu-display flex-col gap-1.5 rounded-sm bg-surface-modal p-0.5 shadow-float edge-hairline"
      >
        <DropdownMenuGroup className={SECTION}>
          <DropdownMenuLabel className={LABEL}>Group by</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={current.group}
            onValueChange={(group) =>
              apply({ ...current, group: group as PageGrouping })
            }
          >
            {GROUP_OPTIONS.map((option) => (
              <DropdownMenuRadioItem
                key={option.id}
                value={option.id}
                className={ITEM}
                onSelect={keepOpen}
              >
                {option.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
        <DropdownMenuGroup className={SECTION}>
          <DropdownMenuLabel className={LABEL}>Order by</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={current.order}
            onValueChange={(order) =>
              apply({ ...current, order: order as PageOrdering })
            }
          >
            {ORDER_OPTIONS.map((option) => (
              <DropdownMenuRadioItem
                key={option.id}
                value={option.id}
                className={ITEM}
                onSelect={keepOpen}
              >
                {option.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
        <DropdownMenuGroup
          className={changed > 0 ? SECTION : "flex flex-col gap-0.5 pb-0.5"}
        >
          <DropdownMenuLabel className={LABEL}>Show</DropdownMenuLabel>
          {PROPERTY_OPTIONS.map((option) => (
            <DropdownMenuCheckboxItem
              key={option.id}
              checked={!current.hide.includes(option.id)}
              className={ITEM}
              onSelect={keepOpen}
              onCheckedChange={(checked) =>
                apply({
                  ...current,
                  hide: toggle(current.hide, option.id, !checked),
                })
              }
            >
              {option.label}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuGroup>
        {changed > 0 ? (
          <DropdownMenuItem
            className={`${ITEM} mb-0.5`}
            onSelect={() => apply(DEFAULT_DISPLAY)}
          >
            Reset to default
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Adds or removes a row detail from the hidden list, keeping the menu's order. */
function toggle(
  hidden: PageProperty[],
  property: PageProperty,
  hide: boolean,
): PageProperty[] {
  const next = new Set(hidden);
  if (hide) next.add(property);
  else next.delete(property);
  return PROPERTY_OPTIONS.map((option) => option.id).filter((id) =>
    next.has(id),
  );
}
