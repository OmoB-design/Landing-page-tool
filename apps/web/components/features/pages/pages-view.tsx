import { ListToolbar } from "@/components/app/list-toolbar";
import { PageHeader } from "@/components/app/page-header";
import { SegmentedTabs } from "@/components/app/segmented-tabs";
import { ToolbarButton } from "@/components/app/toolbar-button";
import { Badge } from "@/components/ui/badge";
import {
  DisplayIcon,
  FilterIcon,
  PagesIcon,
  SampleIcon,
} from "@/components/ui/icons";
import { getSessionContext } from "@/lib/auth/session";
import { groupPagesByStatus } from "@/lib/pages/list";
import { samplePages } from "@/lib/pages/sample";

import { PagesList } from "./pages-list";

export type PagesViewId = "all" | "mine";

const TABS = [
  { id: "all", label: "All pages", href: "/pages" },
  { id: "mine", label: "My pages", href: "/pages?view=mine" },
] satisfies { id: PagesViewId; label: string; href: string }[];

/** /pages: header with view tabs, toolbar with count, and the status-grouped list. */
export async function PagesView({ view }: { view: PagesViewId }) {
  const { user } = await getSessionContext();
  const pages = samplePages(new Date(), user.displayName).filter(
    (page) => view === "all" || page.createdBy.isMe,
  );

  return (
    <>
      <PageHeader
        icon={PagesIcon}
        title="Pages"
        tabs={<SegmentedTabs label="Page views" tabs={TABS} active={view} />}
      />
      <ListToolbar icon={PagesIcon} label="Pages" count={pages.length}>
        <Badge
          variant="outline"
          title="Real pages replace these once builds exist (B1.4)"
          className="h-5 rounded-xs border-warning/40 bg-warning-soft px-1.5 font-normal text-warning"
        >
          <SampleIcon aria-hidden />
          Sample data
        </Badge>
        <ToolbarButton icon={FilterIcon} label="Filter" notBuilt />
        <ToolbarButton icon={DisplayIcon} label="Display" notBuilt />
      </ListToolbar>
      <PagesList groups={groupPagesByStatus(pages)} />
    </>
  );
}
