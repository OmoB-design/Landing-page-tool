"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { JobSteps } from "@/components/app/job-steps";
import { toast } from "@/components/app/toaster";
import { Button } from "@/components/ui/button";
import { RefreshFigmaIcon, TrashFigmaIcon } from "@/components/ui/lp-icons";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { restoreItem, trashItem } from "@/lib/trash/actions";
import { usePageRefresh } from "@/lib/hooks/use-page-refresh";
import { useJob, useStartJob } from "@/lib/queries/jobs";

import { PULL_STEPS } from "./add-product";
import { NewPageLink } from "./new-page-link";

/** Pull again, and Refresh on the briefing: Surface-Primary on a Stroke line, a 16 px icon. */
export const PULL_AGAIN =
  "h-7.5 border-stroke px-4 text-heading-02 shadow-none hover:bg-foreground-01 aria-expanded:bg-foreground-01";

/**
 * The product's actions (Figma Brands Details: product detail page), 30 px buttons 6 px apart:
 * New Page for this product (blue), Pull again (re-reads the product page, replacing the details;
 * Surface-Primary on a Stroke line) and Remove (no frame; to Trash, D92); each change asks first.
 */
export function ProductActions({
  brandId,
  productId,
  name,
  url,
  loading = false,
}: {
  brandId: string;
  productId: string;
  name: string;
  url: string | null;
  /** While the product loads: the same buttons, out of reach (the skeleton). */
  loading?: boolean;
}) {
  const router = useRouter();
  const startJob = useStartJob();
  const [jobId, setJobId] = useState<string | null>(null);
  const { data: job } = useJob(jobId);
  usePageRefresh(job?.status === "succeeded" ? job.id : null);
  const [removing, startRemoving] = useTransition();
  const [removeError, setRemoveError] = useState<string | null>(null);
  const busy =
    startJob.isPending || job?.status === "queued" || job?.status === "running";

  const pullAgain = () => {
    if (!url) return;
    startJob.mutate(
      { kind: "product_pull", payload: { brand_id: brandId, url } },
      { onSuccess: ({ job: started }) => setJobId(started.id) },
    );
  };

  const remove = () =>
    startRemoving(async () => {
      const result = await trashItem("product", productId);
      if (result.ok) {
        toast.success(`${name} moved to Trash`, {
          action: {
            label: "Undo",
            onClick: () =>
              void restoreItem("product", productId).then((back) =>
                back.ok
                  ? (toast.success(`${name} restored`), router.refresh())
                  : toast.error(back.error ?? "Couldn’t restore it."),
              ),
          },
        });
        router.push(`/brands/${brandId}/products`);
      } else {
        setRemoveError(result.error ?? "Couldn't remove the product.");
      }
    });

  return (
    <div
      inert={loading}
      aria-hidden={loading || undefined}
      className="flex flex-col gap-3"
    >
      <div className="flex flex-wrap gap-1.5">
        <NewPageLink brandId={brandId} productId={productId} />
        {url ? (
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="compact"
                className={PULL_AGAIN}
                disabled={busy}
              >
                <RefreshFigmaIcon className="size-4 text-icon-nav-active" />
                Pull again
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-80">
              <PopoverHeader>
                <PopoverTitle>Pull the product again?</PopoverTitle>
                <PopoverDescription>
                  Reads the product page again and replaces the details,
                  including any edits you made here.
                </PopoverDescription>
              </PopoverHeader>
              <Button size="sm" className="h-8 w-fit" onClick={pullAgain}>
                Pull again
              </Button>
            </PopoverContent>
          </Popover>
        ) : null}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="compact"
              className="h-7.5 px-4 text-heading-03"
              disabled={removing}
            >
              <TrashFigmaIcon className="size-4 text-icon-system" />
              Remove
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-80">
            <PopoverHeader>
              <PopoverTitle>Move {name} to Trash?</PopoverTitle>
              <PopoverDescription>
                It leaves the brand&apos;s products; pages made with it keep
                working. You can restore it from Settings → Trash for 7 days.
              </PopoverDescription>
            </PopoverHeader>
            <Button
              variant="destructive"
              size="sm"
              className="h-8 w-fit"
              onClick={remove}
              disabled={removing}
            >
              Move to Trash
            </Button>
          </PopoverContent>
        </Popover>
      </div>
      {removeError ? (
        <p role="alert" className="text-type-caption-1 text-text-danger">
          {removeError}
        </p>
      ) : null}
      {startJob.error ? (
        <p role="alert" className="text-type-caption-1 text-text-danger">
          {startJob.error.message}
        </p>
      ) : null}
      {job && job.status !== "succeeded" ? (
        <JobSteps
          title="Pulling the product again"
          steps={PULL_STEPS}
          job={job}
          className="w-75 [&_.ui-progress]:pb-6.5"
        />
      ) : null}
    </div>
  );
}
