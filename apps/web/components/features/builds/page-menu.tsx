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

import { ChangeOfferDialog } from "../offers/change-offer-dialog";
import { VariantsDialog } from "../offers/variants-dialog";
import { MoveToTrashDialog } from "../trash/move-to-trash-dialog";

import { useDeskOptional } from "./desk-context";
import { useDuplicatePage } from "./use-duplicate-page";
import { useExportPage } from "./use-export-page";

const ITEM =
  "rounded-xsm px-1 py-0.5 text-type-caption-1 font-medium text-heading-02 focus:bg-foreground-03 focus:text-heading-02";

/**
 * The build page's ⋯ (D141), last in its header: Back to review (once approved), Duplicate (a copy
 * as it is now, once it's built: B7.1, D144), Duplicate with offers… and Change offer… (B7.3a), Export (the page as one HTML file, when it's built;
 * the ⋯ shows a spinner while it runs), Copy key and Move to Trash, which asks first and then goes
 * to Pages (D92). The menu is the page rows' (Figma: Page
 * List, Hover).
 */
export function PageMenu({
  buildId,
  buildKey,
  ready,
  brandId = null,
  offerId = null,
}: {
  buildId: string;
  buildKey: string;
  ready: boolean;
  /** For Change offer and Duplicate with offers (B7.3a): the page's brand and its offer. */
  brandId?: string | null;
  offerId?: string | null;
}) {
  const router = useRouter();
  const desk = useDeskOptional();
  const exporting = useExportPage(buildId, buildKey);
  const duplicating = useDuplicatePage(buildId);
  const [trashing, setTrashing] = useState(false);
  const [changing, setChanging] = useState(false);
  const [variants, setVariants] = useState(false);
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
          className="flex w-menu-page flex-col gap-0.5 rounded-sm bg-surface-modal p-0.5 shadow-float edge-hairline"
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
            disabled={!ready || duplicating.busy}
            onSelect={duplicating.start}
          >
            {duplicating.busy ? "Duplicating…" : "Duplicate"}
          </DropdownMenuItem>
          {brandId ? (
            <DropdownMenuItem
              className={ITEM}
              disabled={!ready}
              onSelect={() => setVariants(true)}
            >
              Duplicate with offers…
            </DropdownMenuItem>
          ) : null}
          {brandId && desk ? (
            <DropdownMenuItem
              className={ITEM}
              disabled={!ready || deskBusy || desk.redrafting !== null}
              onSelect={() => setChanging(true)}
            >
              Change offer…
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
      {brandId && desk ? (
        <ChangeOfferDialog
          open={changing}
          onOpenChange={setChanging}
          buildId={buildId}
          brandId={brandId}
          currentOfferId={offerId}
          baseVersion={desk.desk.build.page_version}
          onStarted={() => void desk.reload()}
        />
      ) : null}
      {brandId ? (
        <VariantsDialog
          open={variants}
          onOpenChange={setVariants}
          buildId={buildId}
          pageKey={buildKey}
          brandId={brandId}
          currentOfferId={offerId}
        />
      ) : null}
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
