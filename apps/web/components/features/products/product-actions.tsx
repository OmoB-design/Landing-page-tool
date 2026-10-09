"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { JobSteps } from "@/components/app/job-steps";
import { toast } from "@/components/app/toaster";
import { Button } from "@/components/ui/button";
import { RefreshIcon, RemoveIcon } from "@/components/ui/icons";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { removeProduct } from "@/lib/products/actions";
import { useJob, useStartJob } from "@/lib/queries/jobs";

import { PULL_STEPS, usePageRefresh } from "./add-product";

/** "Pull again" (re-reads the product page, replacing the details) and "Remove". */
export function ProductActions({
  brandId,
  productId,
  name,
  url,
}: {
  brandId: string;
  productId: string;
  name: string;
  url: string | null;
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
      const result = await removeProduct(productId);
      if (result.ok) {
        toast.success(`Removed ${name}`);
        router.push(`/brands/${brandId}/products`);
      } else {
        setRemoveError(result.error ?? "Couldn't remove the product.");
      }
    });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {url ? (
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                disabled={busy}
              >
                <RefreshIcon aria-hidden />
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
              size="sm"
              className="h-8 text-fg-muted"
              disabled={removing}
            >
              <RemoveIcon aria-hidden />
              Remove
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-80">
            <PopoverHeader>
              <PopoverTitle>Remove {name}?</PopoverTitle>
              <PopoverDescription>
                It leaves this brand&apos;s products. Adding it again from its
                page brings it back.
              </PopoverDescription>
            </PopoverHeader>
            <Button
              variant="destructive"
              size="sm"
              className="h-8 w-fit"
              onClick={remove}
              disabled={removing}
            >
              Remove product
            </Button>
          </PopoverContent>
        </Popover>
      </div>
      {removeError ? (
        <p role="alert" className="text-sm text-danger">
          {removeError}
        </p>
      ) : null}
      {startJob.error ? (
        <p role="alert" className="text-sm text-danger">
          {startJob.error.message}
        </p>
      ) : null}
      {job && job.status !== "succeeded" ? (
        <JobSteps
          title="Pulling the product again"
          steps={PULL_STEPS}
          job={job}
        />
      ) : null}
    </div>
  );
}
