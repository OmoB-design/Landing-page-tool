import Link from "next/link";

import { EmptyState } from "@/components/app/empty-state";
import { ListToolbar } from "@/components/app/list-toolbar";
import { PageHeader } from "@/components/app/page-header";
import { SegmentedTabs } from "@/components/app/segmented-tabs";
import { ToolbarButton } from "@/components/app/toolbar-button";
import { DisplayIcon, FilterIcon, PagesIcon } from "@/components/ui/icons";
import { getSessionContext } from "@/lib/auth/session";
import { getOrgPages } from "@/lib/builds/queries";
import {
  type PageFilters,
  NO_FILTERS,
  activeFilterCount,
  filterPages,
  groupPagesByStatus,
  pagesHref,
} from "@/lib/pages/list";

import { PagesFilter } from "./pages-filter";
import { PagesList } from "./pages-list";

export type PagesViewId = "all" | "mine";

/** /pages: header with view tabs, toolbar with count and filters, and the status-grouped list. */
export async function PagesView({
  view,
  filters = NO_FILTERS,
}: {
  view: PagesViewId;
  filters?: PageFilters;
}) {
  const { user, currentOrg } = await getSessionContext();
  const all = await getOrgPages(currentOrg.id, {
    id: user.id,
    name: user.displayName,
  });
  const inView = all.filter((page) => view === "all" || page.createdBy.isMe);
  const pages = filterPages(inView, filters);
  const filtered = activeFilterCount(filters) > 0;
  // Switching tabs keeps the filters.
  const tabs = [
    { id: "all", label: "All pages", href: pagesHref("all", filters) },
    { id: "mine", label: "My pages", href: pagesHref("mine", filters) },
  ];

  return (
    <>
      <PageHeader
        icon={PagesIcon}
        title="Pages"
        tabs={<SegmentedTabs label="Page views" tabs={tabs} active={view} />}
      />
      <ListToolbar icon={PagesIcon} label="Pages" count={pages.length}>
        <PagesFilter view={view} filters={filters} />
        <ToolbarButton icon={DisplayIcon} label="Display" notBuilt />
      </ListToolbar>
      {filtered && pages.length === 0 ? (
        <EmptyState
          icon={FilterIcon}
          title="No pages match these filters"
          action={
            <Link
              href={pagesHref(view, NO_FILTERS)}
              className="text-base font-medium text-fg underline underline-offset-4 hover:text-fg-muted"
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
        <PagesList groups={groupPagesByStatus(pages)} />
      )}
    </>
  );
}
