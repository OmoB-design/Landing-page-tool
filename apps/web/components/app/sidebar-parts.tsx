"use client";

import Link from "next/link";
import type { ReactNode } from "react";

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
 * Brand rows (with a `leading` mark) sit 8 px in, as in the design.
 */
export function NavItem(props: NavItemProps) {
  return (
    <WithPathname fallback={<NavLink {...props} active={false} />}>
      {(pathname) => (
        <NavLink
          {...props}
          active={isCurrent(pathname, props.href, props.exact)}
        />
      )}
    </WithPathname>
  );
}

function NavLink({
  href,
  label,
  icon,
  leading,
  active,
}: NavItemProps & { active: boolean }) {
  const ItemIcon = icon ? NAV_ICONS[icon] : undefined;
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex w-full items-center gap-1.5 rounded-sm py-1 text-type-body-small leading-5 font-medium text-heading-04 outline-none hover:bg-foreground-02 focus-visible:ring-2 focus-visible:ring-ring",
        leading ? "px-2" : "px-1.5",
        active && "bg-foreground-02 text-heading-03",
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
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </Link>
  );
}

/**
 * A collapsible nav group (Figma: Workspace ▾, Your brands ▾): 16 px above, a 12 px medium
 * heading-05 label with a small filled caret, 8 px in; its rows 2 px apart.
 */
export function NavGroup({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <Collapsible defaultOpen className="flex flex-col pt-4">
      <CollapsibleTrigger className="group flex items-center gap-1 self-start rounded-sm px-2 py-1 text-type-caption-1 font-medium text-heading-05 outline-none hover:text-heading-01 focus-visible:ring-2 focus-visible:ring-ring">
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
