import type { ReactNode } from "react";

import type { Icon } from "@/components/ui/icons";

import { CountBadge } from "./count-badge";

type ListToolbarProps = {
  icon: Icon;
  label: string;
  count: number;
  /** Filters and display options, right-aligned. */
  children?: ReactNode;
};

/** 40 px bar above a list (DESIGN.md §2): small icon, label and count, controls on the right. */
export function ListToolbar({
  icon: ToolbarIcon,
  label,
  count,
  children,
}: ListToolbarProps) {
  return (
    <div className="flex h-10 shrink-0 items-center gap-2 border-b border-stroke px-6">
      <ToolbarIcon aria-hidden className="size-4 text-sub-text" />
      <span className="text-type-body-small font-medium">{label}</span>
      <CountBadge count={count} noun={label.toLowerCase()} />
      {children ? (
        <div className="ml-auto flex items-center gap-1">{children}</div>
      ) : null}
    </div>
  );
}
