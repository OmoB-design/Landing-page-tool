"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { type FilterValue, FilterMenu } from "@/components/ui/filter-menu";
import { PagesFilterIcon } from "@/components/ui/lp-icons";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { PageDisplay } from "@/lib/pages/display";
import {
  ORIGIN_OPTIONS,
  type PageFilters,
  STATUS_GROUPS,
  TYPE_OPTIONS,
  activeFilterCount,
  pagesHref,
  parsePageFilters,
} from "@/lib/pages/list";

const GROUPS = [
  {
    id: "status",
    label: "Status",
    options: STATUS_GROUPS.map(({ id, label }) => ({ id, label })),
  },
  { id: "origin", label: "Origin", options: [...ORIGIN_OPTIONS] },
  { id: "type", label: "Template type", options: [...TYPE_OPTIONS] },
];

/**
 * Pages view bar → Filter (Figma: 6 px corners, filled foreground-01 on hover, the 14 px icon in a 26 px
 * box and "Filter" in 13 px heading-05): the AffectUI filter menu in a popover; choices live in
 * the URL. The number of active filters shows after the label.
 */
export function PagesFilter({
  view,
  filters,
  display,
}: {
  view: "all" | "mine";
  filters: PageFilters;
  /** Kept in the URL when filters change. */
  display?: PageDisplay;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const count = activeFilterCount(filters);

  const apply = (value: FilterValue) => {
    const next = parsePageFilters(value);
    startTransition(() =>
      router.replace(pagesHref(view, next, display), { scroll: false }),
    );
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={count > 0 ? `Filter, ${count} active` : "Filter"}
          className="flex h-6.5 items-center gap-1 rounded-sm pr-2 text-type-body-small font-medium text-heading-05 outline-none hover:bg-foreground-01 focus-visible:ring-2 focus-visible:ring-ring aria-expanded:bg-foreground-01"
        >
          <span className="-mr-1 flex size-6.5 items-center justify-center text-icon-system">
            <PagesFilterIcon />
          </span>
          <span className="sr-only sm:not-sr-only">Filter</span>
          {count > 0 ? (
            <span
              aria-hidden
              className="rounded-xsm bg-highlight-indigo-50 px-1 text-type-caption-2 text-text-link tabular-nums"
            >
              {count}
            </span>
          ) : null}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-96 max-w-dvw border-0 bg-transparent p-0 shadow-pop"
      >
        {/* Uncontrolled: it starts from the URL each time it opens, and changes update the URL. */}
        <FilterMenu
          title="Filter pages"
          groups={GROUPS}
          defaultValue={{ ...filters }}
          defaultOpen={GROUPS.map((group) => group.id)}
          onChange={apply}
        />
      </PopoverContent>
    </Popover>
  );
}
