import Link from "next/link";

import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import {
  SkeletonButton,
  SkeletonMark,
  SkeletonRow,
  SkeletonStatus,
  SkeletonText,
  SkeletonViewTabs,
} from "@/components/app/skeletons";
import { type ViewTab, ViewTabs } from "@/components/app/view-tabs";
import { FilterIcon, PagesIcon } from "@/components/ui/icons";
import { Skeleton } from "@/components/ui/shimmer-loader";
import { getSessionContext } from "@/lib/auth/session";
import { getOrgPages } from "@/lib/builds/queries";
import { DEFAULT_DISPLAY, type PageDisplay } from "@/lib/pages/display";
import {
  type PageFilters,
  NO_FILTERS,
  activeFilterCount,
  filterPages,
  groupPages,
  pagesHref,
} from "@/lib/pages/list";
import { samplePages } from "@/lib/pages/sample";

import { PagesDisplay } from "./pages-display";
import { PagesFilter } from "./pages-filter";
import { PagesLayoutToggle } from "./pages-layout-toggle";
import { PagesList } from "./pages-list";

export type PagesViewId = "all" | "mine";

/**
 * /pages (Figma: All Pages 81:1559, My Pages 65:22069): a 1100 px column 48 px under the
 * header; the serif title and its line, flush with the list; the view bar (All pages / My pages
 * with counts, Filter, Display, list or grid) on a hairline; 20 px below, the grouped list (by
 * status unless Display says otherwise). `sample` (development only)
 * shows the sample pages, one or more in every status, instead of the org's builds.
 */
export async function PagesView({
  view,
  filters = NO_FILTERS,
  display = DEFAULT_DISPLAY,
  sample = false,
}: {
  view: PagesViewId;
  filters?: PageFilters;
  display?: PageDisplay;
  sample?: boolean;
}) {
  const { user, currentOrg } = await getSessionContext();
  const all = sample
    ? samplePages(new Date(), user.displayName)
    : await getOrgPages(currentOrg.id, { id: user.id, name: user.displayName });
  const allShown = filterPages(all, filters);
  const mineShown = allShown.filter((page) => page.createdBy.isMe);
  const pages = view === "mine" ? mineShown : allShown;
  const filtered = activeFilterCount(filters) > 0;
  const withSample = (href: string) =>
    sample ? `${href}${href.includes("?") ? "&" : "?"}sample=1` : href;
  // Switching views keeps the filters and display choices.
  const tabs: ViewTab<PagesViewId>[] = [
    {
      id: "all",
      label: "All pages",
      count: allShown.length,
      href: withSample(pagesHref("all", filters, display)),
    },
    {
      id: "mine",
      label: "My pages",
      count: mineShown.length,
      href: withSample(pagesHref("mine", filters, display)),
    },
  ];

  return (
    <>
      <PageHeader icon={PagesIcon} title="Pages" />
      <div className="mx-auto box-content flex w-full max-w-pages flex-col gap-2 px-6 py-12">
        <PagesTitle sample={sample} />
        <div className="flex h-9 items-center justify-between gap-4 divider-b-thin">
          <ViewTabs label="Page views" tabs={tabs} active={view} />
          <div className="flex items-center gap-1.5">
            <PagesFilter view={view} filters={filters} display={display} />
            <PagesDisplay view={view} filters={filters} display={display} />
            <PagesLayoutToggle />
          </div>
        </div>
        <div className="mt-3">
          {filtered && pages.length === 0 ? (
            <EmptyState
              icon={FilterIcon}
              title="No pages match these filters"
              action={
                <Link
                  href={withSample(pagesHref(view, NO_FILTERS, display))}
                  className="text-type-body-small font-medium text-body underline underline-offset-4 hover:text-sub-text"
                >
                  Clear filters
                </Link>
              }
            />
          ) : pages.length === 0 ? (
            <EmptyState icon={PagesIcon} title="No pages yet">
              {view === "mine"
                ? "Pages you build appear here."
                : "Choose New page to build your first page."}
            </EmptyState>
          ) : (
            <PagesList
              groups={groupPages(pages, display)}
              hide={display.hide}
            />
          )}
        </div>
      </div>
    </>
  );
}

function PagesTitle({ sample = false }: { sample?: boolean }) {
  return (
    <div className="flex flex-col gap-1.5 pr-1 pb-6">
      <h1 className="font-serif text-type-title font-medium text-button-secondary-text">
        Pages
      </h1>
      <p className="text-type-body-small leading-5 font-medium text-sub-text">
        Where all your content resides with your attention.
      </p>
      {sample ? (
        <p className="text-type-caption-1 font-medium text-text-warning">
          Sample pages (development only): one or more in every status.
        </p>
      ) : null}
    </div>
  );
}

/**
 * Pages while they load: the same title, the views (counts to come) and toolbar, then a status
 * band and page rows in their shape: glyph and key, title, score, origin, cost, time, avatar.
 */
export function PagesViewSkeleton() {
  return (
    <>
      <PageHeader icon={PagesIcon} title="Pages" />
      <div className="mx-auto box-content flex w-full max-w-pages flex-col gap-2 px-6 py-12">
        <PagesTitle />
        <SkeletonViewTabs labels={["All pages", "My pages"]}>
          <div className="flex items-center gap-1.5">
            <SkeletonButton width={62} height={26} />
            <SkeletonButton width={70} height={26} />
            <SkeletonButton width={64} height={27} radius="var(--radius-md)" />
          </div>
        </SkeletonViewTabs>
        <SkeletonStatus label="Loading pages" />
        <div aria-hidden className="mt-3 flex flex-col gap-4">
          {[3, 2].map((rows, group) => (
            <section key={group}>
              <div className="flex h-9 items-center gap-1.5 bg-foreground-02 px-4 divider-b-thin">
                <SkeletonMark size={14} round />
                <SkeletonText
                  className="text-type-body-small"
                  width={group === 0 ? 72 : 56}
                />
              </div>
              <ul className="flex flex-col gap-0.5 pt-0.5">
                {Array.from({ length: rows }, (_, index) => (
                  <SkeletonRow
                    key={index}
                    leading={
                      <span className="flex w-23.75 shrink-0 items-center gap-1.5">
                        <Skeleton
                          width={23}
                          height={24}
                          radius="var(--radius-xsm)"
                        />
                        <SkeletonText
                          className="text-type-body-small"
                          width={48}
                        />
                      </span>
                    }
                    name={[260, 200, 232][index] ?? 220}
                    meta={[40, 48, 36, 80]}
                    metaEnd={<SkeletonMark size={22} round />}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </>
  );
}
