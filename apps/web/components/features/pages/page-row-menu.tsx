"use client";

import Link from "next/link";
import { useState } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { RowMoreIcon } from "@/components/ui/lp-icons";

import { MoveToTrashDialog } from "../trash/move-to-trash-dialog";

const ITEM =
  "rounded-xsm px-1 py-0.5 text-type-caption-1 font-medium text-heading-02 focus:bg-foreground-03 focus:text-heading-02";

/**
 * The ⋯ at the end of a page row (Figma: Page List, Hover) and its menu: an 18 px button on
 * foreground-03, shown on row hover, keyboard focus or touch; the menu is 132 px with 2 px
 * padding, 6 px corners, a 0.7 px stroke-strong outline and the pop shadow. Move to Trash asks
 * first (D92).
 */
export function PageRowMenu({
  buildId,
  pageKey,
  href,
}: {
  buildId: string;
  pageKey: string;
  href: string;
}) {
  const [trashing, setTrashing] = useState(false);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`Actions for ${pageKey}`}
            className="flex size-4.5 items-center justify-center rounded-xsm bg-foreground-03 text-body opacity-0 outline-none group-hover/row:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:opacity-100 data-open:opacity-100"
          >
            <RowMoreIcon />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          sideOffset={5}
          className="flex w-menu-row flex-col gap-0.5 rounded-sm bg-surface-modal p-0.5 shadow-float edge-hairline"
        >
          <DropdownMenuItem asChild className={ITEM}>
            <Link href={href}>Open</Link>
          </DropdownMenuItem>
          <DropdownMenuItem
            className={ITEM}
            onSelect={() => void navigator.clipboard?.writeText(pageKey)}
          >
            Copy key
          </DropdownMenuItem>
          <DropdownMenuItem className={ITEM} onSelect={() => setTrashing(true)}>
            Move to Trash
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <MoveToTrashDialog
        open={trashing}
        onOpenChange={setTrashing}
        kind="page"
        id={buildId}
        name={pageKey}
      />
    </>
  );
}
