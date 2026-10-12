"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { toast } from "@/components/app/toaster";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { deleteTemplate } from "@/lib/templates/actions";

// Figma Template/Yours: 26 px rows on 4 px corners, 4 px in, a 14 px icon 4 px from a 12 px
// medium label; Foreground-03 on hover and focus.
const ITEM =
  "h-6.5 gap-1 rounded-xsm p-1 text-type-caption-1 font-medium text-heading-02 focus:bg-foreground-03 focus:text-heading-02 [&_svg:not([class*='size-'])]:size-3.5 [&_svg]:text-icon-nav-active";

/**
 * The ⋯ beside Use Template on your own templates (Figma: Template/Yours): a 28 x 26 button on
 * Foreground-03 (Foreground-02 in dark) with 8 px corners, and its 132 px menu, Preview and Delete, with the app's menu
 * frame (2 px padding, 6 px corners, the float shadow and a 0.5 px edge). Delete asks first.
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
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  const remove = () =>
    startTransition(async () => {
      const result = await deleteTemplate(templateId);
      if (result.ok) {
        setConfirming(false);
        toast.success(`Deleted ${name}`);
        router.refresh();
      } else {
        toast.error(result.error ?? "Couldn't delete the template.");
      }
    });

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`More actions for ${name}`}
            className="flex h-6.5 w-7 shrink-0 items-center justify-center rounded-md bg-foreground-03 text-icon-nav-active outline-none hover:bg-stroke-input-hover focus-visible:ring-2 focus-visible:ring-ring aria-expanded:bg-stroke-input-hover dark:bg-foreground-02 dark:hover:bg-foreground-03 dark:aria-expanded:bg-foreground-02"
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
          <DropdownMenuItem
            className={ITEM}
            onSelect={() => setConfirming(true)}
          >
            <TrashFigmaIcon />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Delete {name}?</DialogTitle>
            <DialogDescription>
              Pages already built from it keep working. You can add it again
              from the library.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" size="sm">
                Cancel
              </Button>
            </DialogClose>
            <Button
              variant="destructive"
              size="sm"
              disabled={pending}
              onClick={remove}
            >
              Delete template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
