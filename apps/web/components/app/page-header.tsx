import Link from "next/link";
import type { ReactNode } from "react";

import { BackIcon, type Icon } from "@/components/ui/icons";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

import { HeaderTools } from "./header-tools";
import { SidebarToggleButton } from "./sidebar-state";
import { TruncatedTitle } from "./truncated-title";

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
  /** A back arrow before the title, to the page this one came from (owner, 2026-11-06: a batch's
   * page back to its batch); `label` names it for screen readers and in a tooltip. */
  back?: { label: string; href: string };
};

/** The page panel's header (DESIGN.md §2; Figma: Home): 49 px with its border, 16 px in counting the panel's border; a mark if
 * any, the 13 px medium Heading-01 title (every Figma page header), a divider, then tabs; actions, Jobs and Notifications on the right. Opens the sidebar on small screens or when it's collapsed.
 * It stays at the top of the page panel (sticky in its scroll) and the page scrolls under it. */
export function PageHeader({
  title,
  emoji,
  mark,
  tabs,
  actions,
  crumb,
  back,
}: PageHeaderProps) {
  return (
    <header className="sticky top-0 z-20 flex h-header shrink-0 items-center gap-3 bg-surface-primary px-3.75 edge-b">
      {/* Figma Build (full screen): the open-sidebar button's 32 px box 16 px in, the title 6 px after it. */}
      <div className="flex min-w-0 items-center gap-1.5">
        <SidebarToggleButton
          action="open"
          className="lg:hidden lg:sidebar-collapsed:inline-flex"
        />
        {back ? (
          <Link
            href={back.href}
            aria-label={back.label}
            title={back.label}
            className="-ml-1 flex size-7 shrink-0 items-center justify-center rounded-sm text-icon-system outline-none hover:bg-foreground-02 hover:text-body focus-visible:ring-2 focus-visible:ring-ring"
          >
            <BackIcon aria-hidden className="size-4" />
          </Link>
        ) : null}
        <div
          className={cn(
            "flex min-w-0 items-center",
            crumb ? "gap-1.5" : "gap-2",
          )}
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
          <TruncatedTitle
            className={
              crumb
                ? "text-type-caption-1 font-medium text-heading-01"
                : "text-type-body-small font-medium text-heading-01"
            }
          >
            {title}
          </TruncatedTitle>
        </div>
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
