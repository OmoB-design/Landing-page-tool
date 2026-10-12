"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ViewGridIcon, ViewListIcon } from "@/components/ui/lp-icons";

/**
 * List / grid (Figma: the segmented control at the right of the view bar): 27 px tall, 8 px
 * corners, a hairline around it and between the halves; the current layout on foreground-01.
 * Only the list exists for now: grid waits for its design.
 */
export function PagesLayoutToggle() {
  return (
    <div
      role="group"
      aria-label="Layout"
      className="flex h-6.75 overflow-hidden rounded-md bg-surface-primary edge"
    >
      <button
        type="button"
        aria-pressed="true"
        aria-label="List"
        className="flex items-center border-r border-stroke bg-foreground-01 px-2.5 text-icon-system outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      >
        <ViewListIcon />
      </button>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-pressed="false"
            aria-disabled="true"
            aria-label="Grid (not designed yet)"
            className="flex cursor-not-allowed items-center px-2.5 text-icon-system outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
          >
            <ViewGridIcon />
          </button>
        </TooltipTrigger>
        <TooltipContent>Grid view · waiting for its design</TooltipContent>
      </Tooltip>
    </div>
  );
}
