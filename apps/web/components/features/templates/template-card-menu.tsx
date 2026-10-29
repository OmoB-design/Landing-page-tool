"use client";

import { useState } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ExternalLinkFigmaIcon,
  RowMoreIcon,
  TrashFigmaIcon,
} from "@/components/ui/lp-icons";

import { MoveToTrashDialog } from "../trash/move-to-trash-dialog";

// Figma Template/Yours: 26 px rows on 4 px corners, 4 px in, a 14 px icon 4 px from a 12 px
// medium label; Foreground-03 on hover and focus.
const ITEM =
  "h-6.5 gap-1 rounded-xsm p-1 text-type-caption-1 font-medium text-heading-02 focus:bg-foreground-03 focus:text-heading-02 [&_svg:not([class*='size-'])]:size-3.5 [&_svg]:text-icon-nav-active";

/**
 * The ⋯ beside Use Template on your own templates (Figma: Template/Yours): a 28 x 26 button on
 * Foreground-02 with 8 px corners, and its 132 px menu, Preview and Move to Trash, with the app's
 * menu frame (2 px padding, 6 px corners, the float shadow and a 0.5 px edge). Moving to Trash asks
 * first (D92); pages built from the template keep working.
 */
export function TemplateCardMenu({
  templateId,
  name,
  previewHref,
}: {
  templateId: string;
  name: string;
  previewHref: string;
}) {
  const [trashing, setTrashing] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`More actions for ${name}`}
            className="flex h-6.5 w-7 shrink-0 items-center justify-center rounded-md bg-foreground-02 text-icon-nav-active outline-none hover:bg-foreground-03 focus-visible:ring-2 focus-visible:ring-ring aria-expanded:bg-foreground-03"
          >
            <RowMoreIcon />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          sideOffset={4}
          className="flex w-menu-row flex-col gap-0.5 rounded-sm bg-surface-modal p-0.5 shadow-float edge-hairline"
        >
          <DropdownMenuItem asChild className={ITEM}>
            <a href={previewHref} target="_blank" rel="noreferrer">
              <ExternalLinkFigmaIcon />
              Preview
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          </DropdownMenuItem>
          <DropdownMenuItem className={ITEM} onSelect={() => setTrashing(true)}>
            <TrashFigmaIcon />
            Move to Trash
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <MoveToTrashDialog
        open={trashing}
        onOpenChange={setTrashing}
        kind="template"
        id={templateId}
        name={name}
      />
    </>
  );
}
