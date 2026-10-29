"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { RowMoreIcon, TrashFigmaIcon } from "@/components/ui/lp-icons";

import { MoveToTrashDialog } from "../trash/move-to-trash-dialog";

// The template card menu's rows (Figma Template/Yours).
const ITEM =
  "h-6.5 gap-1 rounded-xsm p-1 text-type-caption-1 font-medium text-heading-02 focus:bg-foreground-03 focus:text-heading-02 [&_svg:not([class*='size-'])]:size-3.5 [&_svg]:text-icon-nav-active";

/**
 * The ⋯ in a brand's header (no Figma frame yet; the template card's button and menu): Move to
 * Trash, which takes the brand's pages and products with it and asks first (D92). It's refused
 * while any of its pages is building or published.
 */
export function BrandMenu({
  brandId,
  name,
}: {
  brandId: string;
  name: string;
}) {
  const router = useRouter();
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
          <DropdownMenuItem className={ITEM} onSelect={() => setTrashing(true)}>
            <TrashFigmaIcon />
            Move to Trash
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <MoveToTrashDialog
        open={trashing}
        onOpenChange={setTrashing}
        kind="brand"
        id={brandId}
        name={name}
        onMoved={() => router.push("/brands")}
      />
    </>
  );
}
