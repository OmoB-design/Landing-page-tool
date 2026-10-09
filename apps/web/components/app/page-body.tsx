import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

const WIDTHS = {
  /** Forms, settings, Home. */
  md: "max-w-2xl",
  /** Detail pages with media and tables (a product). */
  lg: "max-w-3xl",
};

/**
 * The content column under a page header (DESIGN.md §2): centred in the main pane with a
 * readable max width. Full-width lists (Pages, Brands) sit outside it.
 */
export function PageBody({
  width = "md",
  className,
  children,
}: {
  width?: keyof typeof WIDTHS;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "mx-auto flex w-full flex-col gap-6 px-6 py-6",
        WIDTHS[width],
        className,
      )}
    >
      {children}
    </div>
  );
}
