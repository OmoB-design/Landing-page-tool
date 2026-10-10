"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import {
  AnalyticsIcon,
  BrandsIcon,
  HomeIcon,
  LibraryIcon,
  PagesIcon,
  PlusIcon,
  SearchIcon,
  SettingsIcon,
  TemplatesIcon,
} from "@/components/ui/icons";
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
  analytics: AnalyticsIcon,
  brands: BrandsIcon,
  home: HomeIcon,
  library: LibraryIcon,
  new: PlusIcon,
  pages: PagesIcon,
  settings: SettingsIcon,
  templates: TemplatesIcon,
};

export type NavIconName = keyof typeof NAV_ICONS;

const ITEM_CLASS =
  "flex h-nav-item w-full items-center gap-2 rounded-sm px-2 text-base text-fg outline-none hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-ring";

type NavItemProps = {
  href: string;
  label: string;
  icon?: NavIconName;
  emoji?: string;
  /** A custom mark (e.g. a BrandMark) in place of an icon or emoji. */
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

/** A 32 px sidebar link: icon or mark and label; grey on hover and when it's the current page. */
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
  emoji,
  leading,
  active,
}: NavItemProps & { active: boolean }) {
  const ItemIcon = icon ? NAV_ICONS[icon] : undefined;

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(ITEM_CLASS, active && "bg-surface-hover")}
    >
      {leading ? (
        leading
      ) : emoji ? (
        <span aria-hidden className="flex w-4 justify-center">
          {emoji}
        </span>
      ) : ItemIcon ? (
        <ItemIcon aria-hidden className="size-4 shrink-0 text-fg-muted" />
      ) : (
        <span aria-hidden className="w-4" />
      )}
      <span className="truncate">{label}</span>
    </Link>
  );
}

/** Search (⌘K), shown but not built yet: the command palette arrives in a later build. */
export function SearchItem() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-disabled="true"
          className={cn(ITEM_CLASS, "cursor-not-allowed")}
        >
          <SearchIcon aria-hidden className="size-4 shrink-0 text-fg-muted" />
          <span className="truncate">Search</span>
          <kbd className="ml-auto font-sans text-sm text-fg-subtle">⌘K</kbd>
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">Not built yet</TooltipContent>
    </Tooltip>
  );
}
