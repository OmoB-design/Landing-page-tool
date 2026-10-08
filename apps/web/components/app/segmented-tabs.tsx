import Link from "next/link";

import { cn } from "@/lib/utils";

export type SegmentedTab = {
  id: string;
  label: string;
  href: string;
};

type SegmentedTabsProps = {
  /** Accessible name of the tab navigation, e.g. "Page views". */
  label: string;
  tabs: SegmentedTab[];
  /** The id of the current tab. */
  active: string;
};

/**
 * Route tabs as segmented pills (DESIGN.md §2): inactive tabs are plain text; the active tab has
 * a light filled pill and a short accent underline. Each tab is a link, marked aria-current.
 */
export function SegmentedTabs({ label, tabs, active }: SegmentedTabsProps) {
  return (
    <nav aria-label={label} className="min-w-0 overflow-x-auto">
      <ul className="flex items-center gap-1">
        {tabs.map((tab) => {
          const current = tab.id === active;
          return (
            <li key={tab.id}>
              <Link
                href={tab.href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "relative flex h-7 items-center rounded-sm px-2.5 text-base whitespace-nowrap text-fg-muted hover:bg-surface-hover hover:text-fg",
                  current &&
                    "bg-surface-muted font-medium text-fg after:absolute after:bottom-0 after:left-1/2 after:h-0.5 after:w-4 after:-translate-x-1/2 after:rounded-full after:bg-accent",
                )}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
