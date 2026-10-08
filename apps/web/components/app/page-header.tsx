import type { ReactNode } from "react";

import type { Icon } from "@/components/ui/icons";
import { Separator } from "@/components/ui/separator";

type PageHeaderProps = {
  title: string;
  /** An outline icon, or an emoji (brands) shown in its place. */
  icon?: Icon;
  emoji?: string;
  /** Usually SegmentedTabs, shown after a vertical divider. */
  tabs?: ReactNode;
  /** Right-aligned actions. */
  actions?: ReactNode;
};

/** 48 px page header (DESIGN.md §2): icon or emoji, the entity name, a divider, then tabs. */
export function PageHeader({
  title,
  icon: HeaderIcon,
  emoji,
  tabs,
  actions,
}: PageHeaderProps) {
  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border px-6">
      <div className="flex min-w-0 items-center gap-2">
        {emoji ? (
          <span aria-hidden className="text-md">
            {emoji}
          </span>
        ) : HeaderIcon ? (
          <HeaderIcon aria-hidden className="size-4 shrink-0 text-fg-muted" />
        ) : null}
        <h1 className="truncate text-lg font-semibold">{title}</h1>
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
