"use client";

import { useRef, useState } from "react";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * A page's title in a header bar (owner, 2026-11-04): capped at 12 rem (16 rem from `xl`) so the
 * header's tabs and buttons keep their room, cut with an ellipsis, and the full title in a tooltip,
 * which opens on hover only when the title is cut (a short "Pages" has none; the whole title is in
 * the page for screen readers). Used by PageHeader and the page and template editors' top bars.
 */
export function TruncatedTitle({
  children,
  className,
}: {
  children: string;
  className?: string;
}) {
  const ref = useRef<HTMLHeadingElement>(null);
  const [open, setOpen] = useState(false);
  const cut = () => {
    const element = ref.current;
    return element !== null && element.scrollWidth > element.clientWidth + 1;
  };
  return (
    <TooltipProvider>
      <Tooltip open={open} onOpenChange={(next) => setOpen(next && cut())}>
        <TooltipTrigger asChild>
          <h1
            ref={ref}
            className={cn("max-w-48 min-w-0 truncate xl:max-w-64", className)}
          >
            {children}
          </h1>
        </TooltipTrigger>
        <TooltipContent>{children}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
