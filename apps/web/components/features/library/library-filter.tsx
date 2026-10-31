"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { PagesFilterIcon } from "@/components/ui/lp-icons";
import {
  type FilterGroup,
  FilterMenu,
  type FilterValue,
} from "@/components/ui/filter-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { type LibraryFilters, libraryHref } from "@/lib/library/href";
import { ORIGIN_OPTIONS, STATUS_GROUPS } from "@/lib/pages/list";

type Option = { id: string; label: string };

/**
 * The Library's Filter (the Pages view bar's Filter, D70): brand, template, status and origin in
 * the AffectUI filter menu; choices live in the URL.
 */
export function LibraryFilter({
  filters,
  brands,
  templates,
}: {
  filters: LibraryFilters;
  brands: Option[];
  templates: Option[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const count = Object.values(filters).reduce(
    (n, values) => n + values.length,
    0,
  );
  const groups: FilterGroup[] = [
    { id: "brand", label: "Brand", options: brands },
    { id: "template", label: "Template", options: templates },
    {
      id: "status",
      label: "Status",
      options: STATUS_GROUPS.map(({ id, label }) => ({ id, label })),
    },
    { id: "origin", label: "Origin", options: [...ORIGIN_OPTIONS] },
  ].filter((group) => group.options.length > 0);

  const apply = (value: FilterValue) => {
    const next: LibraryFilters = {
      brand: value.brand ?? [],
      template: value.template ?? [],
      status: (value.status ?? []) as LibraryFilters["status"],
      origin: (value.origin ?? []) as LibraryFilters["origin"],
    };
    startTransition(() => router.replace(libraryHref(next), { scroll: false }));
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
        <FilterMenu
          title="Filter the library"
          groups={groups}
          defaultValue={{ ...filters }}
          defaultOpen={groups.map((group) => group.id)}
          onChange={apply}
        />
      </PopoverContent>
    </Popover>
  );
}
