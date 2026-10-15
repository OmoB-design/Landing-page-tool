import Link from "next/link";
import type { ReactNode } from "react";

import type { Icon } from "@/components/ui/icons";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

import { HeaderTools } from "./header-tools";
import { SidebarToggleButton } from "./sidebar-state";

type PageHeaderProps = {
  title: string;
  /** The section's icon. Not shown (D67: headers are text, like the reference); kept so pages
   * can still name their section's icon in one place. */
  icon?: Icon;
  /** An emoji or a custom mark (e.g. a BrandMark) shown before the title. */
  emoji?: string;
  mark?: ReactNode;
  /** Usually SegmentedTabs, shown after a vertical divider. */
  tabs?: ReactNode;
  /** Right-aligned actions. */
  actions?: ReactNode;
  /** A parent page before the title, as "Parent / title" (Figma Brands Details: "Brands / BREZ"). */
  crumb?: { label: string; href: string };
};

/** The page panel's header (DESIGN.md §2; Figma: Home): 49 px with its border, 16 px in counting the panel's border; a mark if
 * any, the 13 px medium Heading-01 title (every Figma page header), a divider, then tabs; actions, Jobs and Notifications on the right. Opens the sidebar on small screens or when it's collapsed. */
export function PageHeader({
  title,
  emoji,
  mark,
  tabs,
  actions,
  crumb,
}: PageHeaderProps) {
  return (
    <header className="flex h-header shrink-0 items-center gap-3 px-3.75 edge-b">
      <SidebarToggleButton
        action="open"
        className="-ml-1.5 lg:hidden lg:sidebar-collapsed:inline-flex"
      />
      <div
        className={cn("flex min-w-0 items-center", crumb ? "gap-1.5" : "gap-2")}
      >
        {crumb ? (
          <>
            <Link
              href={crumb.href}
              className="shrink-0 rounded-xsm text-type-body-small font-medium text-heading-01 outline-none hover:text-sub-text focus-visible:ring-2 focus-visible:ring-ring"
            >
              {crumb.label}
            </Link>
            <span
              aria-hidden
              className="text-type-body-small font-medium text-heading-01"
            >
              /
            </span>
          </>
        ) : null}
        {mark ? (
          mark
        ) : emoji ? (
          <span aria-hidden className="text-type-body-large">
            {emoji}
          </span>
        ) : null}
        <h1
          className={cn(
            "truncate",
            crumb
              ? "text-type-caption-1 font-medium text-heading-01"
              : "text-type-body-small font-medium text-heading-01",
          )}
        >
          {title}
        </h1>
      </div>
      {tabs ? (
        <>
          <Separator orientation="vertical" className="h-5 self-center" />
          {tabs}
        </>
      ) : null}
      <div className="ml-auto flex items-center gap-3">
        {actions ? (
          <div className="flex items-center gap-1">{actions}</div>
        ) : null}
        <HeaderTools />
      </div>
    </header>
  );
}
