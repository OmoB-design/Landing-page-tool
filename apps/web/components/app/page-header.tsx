import type { ReactNode } from "react";

import type { Icon } from "@/components/ui/icons";
import { Separator } from "@/components/ui/separator";

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
};

/** The page panel's 48 px header (DESIGN.md §2, D67): a mark if any, the 13 px regular title, a
 * divider, then tabs; actions on the right. Opens the sidebar on small screens or when it's collapsed. */
export function PageHeader({
  title,
  emoji,
  mark,
  tabs,
  actions,
}: PageHeaderProps) {
  return (
    <header className="flex h-header shrink-0 items-center gap-3 border-b border-stroke px-5">
      <SidebarToggleButton
        action="open"
        className="-ml-1.5 lg:hidden lg:sidebar-collapsed:inline-flex"
      />
      <div className="flex min-w-0 items-center gap-2">
        {mark ? (
          mark
        ) : emoji ? (
          <span aria-hidden className="text-type-body-large">
            {emoji}
          </span>
        ) : null}
        <h1 className="truncate text-type-body-small font-normal">{title}</h1>
      </div>
      {tabs ? (
        <>
          <Separator orientation="vertical" className="h-5 self-center" />
          {tabs}
        </>
      ) : null}
      {actions ? (
        <div className="ml-auto flex items-center gap-1">{actions}</div>
      ) : null}
    </header>
  );
}
