"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  AnalyticsIcon,
  BrandsIcon,
  HomeIcon,
  LibraryIcon,
  MyPagesIcon,
  PlusIcon,
  TemplatesIcon,
} from "@/components/ui/icons";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { SECTION_ACTIONS, sectionFor } from "./navigation";
import { SidebarToggleButton } from "./sidebar-state";

/** Sidebar title (the active rail section) with the collapse button. */
export function SidebarHeader() {
  const section = sectionFor(usePathname());
  return (
    <div className="flex items-center justify-between gap-2 pl-2">
      <h2 className="text-md font-semibold">{section.label}</h2>
      <SidebarToggleButton action="close" />
    </div>
  );
}

/** The section's primary action ("New page" …): a quiet full-width button, not a loud one. */
export function SidebarAction() {
  const label = SECTION_ACTIONS[sectionFor(usePathname()).id];
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-disabled="true"
          className="flex h-nav-item w-full items-center gap-2 rounded-sm bg-surface-muted px-2 text-base font-medium text-fg hover:bg-surface-hover aria-disabled:cursor-not-allowed"
        >
          <span
            aria-hidden
            className="flex size-4 items-center justify-center rounded-full bg-fg text-surface"
          >
            <PlusIcon className="size-3" />
          </span>
          {label}
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">Not built yet</TooltipContent>
    </Tooltip>
  );
}

// Icons are chosen by name: Server Components can pass a string to this Client Component, but
// not an icon component (functions are not serialisable).
const NAV_ICONS = {
  analytics: AnalyticsIcon,
  brands: BrandsIcon,
  home: HomeIcon,
  library: LibraryIcon,
  "my-pages": MyPagesIcon,
  templates: TemplatesIcon,
};

export type NavIconName = keyof typeof NAV_ICONS;

type NavItemProps = {
  href: string;
  label: string;
  icon?: NavIconName;
  emoji?: string;
};

/**
 * A 32 px sidebar link: icon or emoji, label; subtle grey on hover, stronger when active.
 * Links with a query (/pages?view=mine) never show as active; the page header's tabs show the view.
 */
export function NavItem({ href, label, icon, emoji }: NavItemProps) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);
  const ItemIcon = icon ? NAV_ICONS[icon] : undefined;

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-nav-item items-center gap-2 rounded-sm px-2 text-base text-fg hover:bg-surface-hover",
        active && "bg-surface-active font-medium hover:bg-surface-active",
      )}
    >
      {emoji ? (
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
