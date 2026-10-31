"use client";

import Link from "next/link";
import { type ReactNode, useState } from "react";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  GroupCaretIcon,
  NavAnalyticsIcon,
  NavBrandsIcon,
  NavHomeIcon,
  NavLibraryIcon,
  NavNewPageIcon,
  NavPagesIcon,
  NavTemplatesIcon,
  SidebarSearchIcon,
} from "@/components/ui/lp-icons";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { noteNavClick, useNavPath } from "./pending-nav";
import { railIndex } from "./rail";
import { useRail } from "./sidebar-state";
import { WithPathname } from "./with-pathname";

// Icons are chosen by name: Server Components can pass a string to this Client Component, but
// not an icon component (functions are not serialisable).
const NAV_ICONS = {
  analytics: NavAnalyticsIcon,
  brands: NavBrandsIcon,
  home: NavHomeIcon,
  library: NavLibraryIcon,
  new: NavNewPageIcon,
  pages: NavPagesIcon,
  templates: NavTemplatesIcon,
};

export type NavIconName = keyof typeof NAV_ICONS;

type NavItemProps = {
  href: string;
  label: string;
  icon?: NavIconName;
  /** A custom mark (a brand's letter mark) in place of an icon. */
  leading?: ReactNode;
  /** Only the exact path is current (not the pages under it). */
  exact?: boolean;
  /** Its place from the top, for the rail's staggered labels (D97). */
  index?: number;
};

/** Whether a nav link is the current page. /pages/new belongs to New page, not Pages. */
export function isCurrent(pathname: string, href: string, exact = false) {
  if (pathname === href) return true;
  if (exact || !pathname.startsWith(`${href}/`)) return false;
  return !(href === "/pages" && pathname.startsWith("/pages/new"));
}

/**
 * A sidebar link (Figma: Side nav — Default and Hover): 16 px icon, 6 px gap, 13 px medium label
 * on a 20 px line; 6 px across and 4 px down inside a 6 px-rounded row. Hover and the current page fill the row
 * with foreground-02; the current page's icon turns from icon-system to icon-nav-active.
 * Brand rows (with a `leading` mark) sit 8 px in, as in the design. In the icon rail (D97) the row
 * is the 28 px square around its icon, the label fades out but still names the link, and the
 * label shows in a tooltip; a row with no icon or mark leaves the rail.
 */
export function NavItem(props: NavItemProps) {
  return (
    <WithPathname fallback={<NavLink {...props} pathname={null} />}>
      {(pathname) => <NavLink {...props} pathname={pathname} />}
    </WithPathname>
  );
}

function NavLink({
  href,
  label,
  icon,
  leading,
  index,
  exact,
  pathname,
}: NavItemProps & { pathname: string | null }) {
  // The current row moves on click, before the next page has loaded (pending-nav.ts).
  const path = useNavPath(pathname);
  const active = path !== null && isCurrent(path, href, exact);
  const ItemIcon = icon ? NAV_ICONS[icon] : undefined;
  const link = (
    <Link
      href={href}
      onClick={(event) => noteNavClick(event, href, pathname)}
      aria-current={active ? "page" : undefined}
      style={railIndex(index)}
      className={cn(
        "flex w-full items-center gap-1.5 rounded-sm py-1 text-type-body-small leading-5 font-medium text-heading-04 outline-none hover:bg-foreground-02 focus-visible:ring-2 focus-visible:ring-ring",
        leading ? "px-2" : "px-1.5",
        active && "bg-foreground-02 text-heading-03",
        !leading && !ItemIcon && "rail-gone rail-label",
      )}
    >
      {leading ??
        (ItemIcon ? (
          <ItemIcon
            className={cn(
              "size-4 shrink-0",
              active ? "text-icon-nav-active" : "text-icon-system",
            )}
          />
        ) : (
          <span aria-hidden className="size-4 shrink-0" />
        ))}
      <span
        className={cn(
          "min-w-0 flex-1 truncate",
          (leading || ItemIcon) && "rail-label",
        )}
      >
        {label}
      </span>
    </Link>
  );
  return <RailTooltip label={label}>{link}</RailTooltip>;
}

/**
 * The label beside an icon while the sidebar is the rail (D97). Always rendered, so the link keeps
 * its place in the tree (and its labels their fade) when the rail opens or closes.
 */
export function RailTooltip({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const rail = useRail();
  const [open, setOpen] = useState(false);
  return (
    <Tooltip open={rail && open} onOpenChange={setOpen}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="right" sideOffset={12}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * A collapsible nav group (Figma: Workspace ▾, Your brands ▾): 16 px above, a 12 px medium
 * heading-05 label with a small filled caret, 8 px in; its rows 2 px apart. In the rail (D97) the
 * heading fades away and keeps its space (on one line), so the icons below don’t move, and a
 * 28 px rule fades in midway between the sections, as shadcn's sidebar separates its groups.
 */
export function NavGroup({
  label,
  index,
  children,
}: {
  label: string;
  /** Its place from the top, for the rail's staggered labels. */
  index?: number;
  children: ReactNode;
}) {
  return (
    <Collapsible defaultOpen className="relative flex flex-col pt-4">
      {/* In the rail the heading gives way to a short rule between sections (D97). */}
      <span
        aria-hidden
        className="pointer-events-none absolute top-4.75 left-0 h-px w-7 bg-edge rail-rule"
      />
      <CollapsibleTrigger
        style={railIndex(index)}
        className="group rail-gone flex rail-label items-center gap-1 self-start rounded-sm px-2 py-1 text-type-caption-1 font-medium whitespace-nowrap text-heading-05 outline-none hover:text-heading-01 focus-visible:ring-2 focus-visible:ring-ring"
      >
        {label}
        <GroupCaretIcon className="transition-transform duration-150 ease-out group-data-closed:-rotate-90 motion-reduce:transition-none" />
      </CollapsibleTrigger>
      <CollapsibleContent className="flex flex-col gap-0.5">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

/** Search in the sidebar's top row (Figma: 14 px icon). Not built yet: the ⌘K palette comes later. */
export function SearchButton() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-disabled="true"
          aria-label="Search (not built yet)"
          className="flex size-5 cursor-not-allowed items-center justify-center rounded-xsm text-icon-system outline-none hover:text-icon-nav-active focus-visible:ring-2 focus-visible:ring-ring"
        >
          <SidebarSearchIcon className="size-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent>Search · not built yet</TooltipContent>
    </Tooltip>
  );
}
