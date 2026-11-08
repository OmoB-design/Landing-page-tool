"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { toast } from "@/components/app/toaster";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { RowMoreIcon } from "@/components/ui/lp-icons";
import { Spinner } from "@/components/ui/spinner";

import { MoveToTrashDialog } from "../trash/move-to-trash-dialog";

import { useDeskOptional } from "./desk-context";
import { useExportPage } from "./use-export-page";

const ITEM =
  "rounded-xsm px-1 py-0.5 text-type-caption-1 font-medium text-heading-02 focus:bg-foreground-03 focus:text-heading-02";

/**
 * The build page's ⋯ (D141), last in its header: Back to review (once approved), Export (the page
 * as one HTML file, when it's built; the ⋯ shows a spinner while it runs), Copy key and Move to
 * Trash, which asks first and then goes to Pages (D92). The menu is the page rows' (Figma: Page
 * List, Hover).
 */
export function PageMenu({
  buildId,
  buildKey,
  ready,
}: {
  buildId: string;
  buildKey: string;
  ready: boolean;
}) {
  const router = useRouter();
  const desk = useDeskOptional();
  const exporting = useExportPage(buildId, buildKey);
  const [trashing, setTrashing] = useState(false);
  const approved = desk?.desk.build.status === "approved";
  const deskBusy =
    desk !== null && (desk.pending !== null || desk.redrafting !== null);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="compact"
            aria-label={exporting.busy ? "More (exporting)" : "More"}
            title={exporting.busy ? "Exporting…" : undefined}
            className="w-6.5 px-0"
          >
            {exporting.busy ? (
              <Spinner className="size-3.5" label="Exporting" />
            ) : (
              <RowMoreIcon />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          sideOffset={5}
          className="flex w-menu-row flex-col gap-0.5 rounded-sm bg-surface-modal p-0.5 shadow-float edge-hairline"
        >
          {approved ? (
            <DropdownMenuItem
              className={ITEM}
              disabled={deskBusy}
              onSelect={() => desk?.setStatus("needs_review")}
            >
              Back to review
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem
            className={ITEM}
            disabled={!ready || exporting.busy}
            onSelect={exporting.start}
          >
            {exporting.busy ? "Exporting…" : "Export"}
          </DropdownMenuItem>
          <DropdownMenuItem
            className={ITEM}
            onSelect={() =>
              void navigator.clipboard
                ?.writeText(buildKey)
                .then(() => toast.success(`${buildKey} copied`))
            }
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
        name={buildKey}
        onMoved={() => router.push("/pages")}
      />
    </>
  );
}
