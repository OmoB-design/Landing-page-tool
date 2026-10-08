import type { ReactNode } from "react";

import type { Icon } from "@/components/ui/icons";

type EmptyStateProps = {
  title: string;
  /** Shown in the illustration slot until Figma supplies illustrations. */
  icon?: Icon;
  children?: ReactNode;
  /** A button or link. */
  action?: ReactNode;
};

/** Centred placeholder for an empty list or an unbuilt screen: icon, title, body, action. */
export function EmptyState({
  title,
  icon: StateIcon,
  children,
  action,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
      {StateIcon ? (
        <div className="flex size-10 items-center justify-center rounded-md bg-surface-muted text-fg-muted">
          <StateIcon aria-hidden className="size-5" />
        </div>
      ) : null}
      <h2 className="text-xl font-semibold">{title}</h2>
      {children ? (
        <div className="max-w-sm text-base text-fg-muted">{children}</div>
      ) : null}
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  );
}
