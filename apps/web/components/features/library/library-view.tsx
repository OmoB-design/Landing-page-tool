import Link from "next/link";

import { PageHeader } from "@/components/app/page-header";
import { formatCost } from "@/components/app/row-meta";
import { SkeletonStatus, SkeletonText } from "@/components/app/skeletons";
import { LibraryIcon } from "@/components/ui/icons";
import { getSessionContext } from "@/lib/auth/session";
import {
  LIBRARY_PAGE,
  type LibraryFilters,
  libraryHref,
} from "@/lib/library/href";
import { getLibrary, getLibraryOptions } from "@/lib/library/queries";

import { LibraryFilter } from "./library-filter";
import {
  type LibraryTableRow,
  LibraryTable,
  LibraryTableSkeleton,
} from "./library-table";

const DAY = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/**
 * /library (BUILD_SPEC §14; no Figma frame yet, drawn like Pages and Quality's table, D93): every
 * page of the workspace with its brand, template, status, origin, cost and date, newest first,
 * filtered by brand, template, status and origin; each row opens to its paid calls. 50 at a time.
 */
export async function LibraryView({
  filters,
  show,
}: {
  filters: LibraryFilters;
  show: number;
}) {
  const { currentOrg } = await getSessionContext();
  const [{ rows, total }, options] = await Promise.all([
    getLibrary(currentOrg.id, filters, show),
    getLibraryOptions(currentOrg.id),
  ]);
  const filtered = Object.values(filters).some((values) => values.length > 0);
  const tableRows: LibraryTableRow[] = rows.map((row) => ({
    id: row.id,
    key: row.key,
    title: row.title,
    status: row.status,
    origin: row.origin,
    costUsd: row.costUsd,
    created: DAY.format(new Date(row.createdAt)),
    brand: row.brand,
    template: row.template,
  }));
  const shownCost = rows.reduce((sum, row) => sum + row.costUsd, 0);
  return (
    <>
      <PageHeader icon={LibraryIcon} title="Library" />
      <div className="mx-auto box-content flex w-full max-w-pages flex-col gap-4 px-6 py-12">
        <LibraryTitle />
        <div className="flex items-center justify-between gap-3">
          <p className="text-type-body-small font-medium text-heading-05 tabular-nums">
            {total} {total === 1 ? "page" : "pages"}
            {rows.length > 0
              ? ` · ${formatCost(shownCost)}${rows.length < total ? ` for these ${rows.length}` : ""}`
              : ""}
          </p>
          <LibraryFilter
            filters={filters}
            brands={options.brands}
            templates={options.templates}
          />
        </div>
        {rows.length === 0 ? (
          <div className="flex items-center justify-center px-8 py-16">
            <p className="text-center text-type-body-small font-medium text-heading-05">
              {filtered ? "No pages match these filters" : "No pages yet"}
            </p>
          </div>
        ) : (
          <LibraryTable rows={tableRows} />
        )}
        {rows.length < total ? (
          <Link
            href={libraryHref(filters, show + LIBRARY_PAGE)}
            scroll={false}
            className="self-center rounded-sm px-3 py-1 text-type-body-small font-medium text-heading-05 outline-none hover:bg-foreground-01 focus-visible:ring-2 focus-visible:ring-ring"
          >
            Show {Math.min(LIBRARY_PAGE, total - rows.length)} more
          </Link>
        ) : null}
      </div>
    </>
  );
}

function LibraryTitle() {
  return (
    <div className="flex flex-col gap-1.5 pr-1 pb-6">
      <h1 className="font-serif text-type-title font-medium text-button-secondary-text">
        Library
      </h1>
      <p className="text-type-body-small leading-5 font-medium text-sub-text">
        Every page you’ve built, with what it cost.
      </p>
    </div>
  );
}

/**
 * The Library while it loads (measured against the loaded page, 2026-10-31): the title, the
 * count line and the Filter button where they'll be, then the table with its real headers.
 */
export function LibraryViewSkeleton() {
  return (
    <>
      <PageHeader icon={LibraryIcon} title="Library" />
      <div className="mx-auto box-content flex w-full max-w-pages flex-col gap-4 px-6 py-12">
        <SkeletonStatus label="Loading the library" />
        <LibraryTitle />
        <div className="flex items-center justify-between gap-3">
          <SkeletonText className="text-type-body-small" width={96} />
          <div inert>
            <LibraryFilter
              filters={{ brand: [], template: [], status: [], origin: [] }}
              brands={[]}
              templates={[]}
            />
          </div>
        </div>
        <LibraryTableSkeleton />
      </div>
    </>
  );
}
