"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import { type FilterValue, FilterMenu } from "@/components/ui/filter-menu";
import { FilterIcon } from "@/components/ui/icons";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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

/** Pages toolbar → Filter: the AffectUI filter menu in a popover; choices live in the URL. */
export function PagesFilter({
  view,
  filters,
}: {
  view: "all" | "mine";
  filters: PageFilters;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const count = activeFilterCount(filters);

  const apply = (value: FilterValue) => {
    const next = parsePageFilters(value);
    startTransition(() =>
      router.replace(pagesHref(view, next), { scroll: false }),
    );
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          aria-label={count > 0 ? `Filter, ${count} active` : "Filter"}
          className="text-sub-text hover:bg-foreground-02"
        >
          <FilterIcon aria-hidden />
          <span className="sr-only sm:not-sr-only">Filter</span>
          {count > 0 ? (
            <span
              aria-hidden
              className="rounded-xsm bg-highlight-indigo-50 px-1 text-type-caption-2 text-text-link tabular-nums"
            >
              {count}
            </span>
          ) : null}
        </Button>
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
