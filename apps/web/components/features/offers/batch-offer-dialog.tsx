"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { apiFetch } from "@/lib/api/client";
import { isActive } from "@/lib/jobs/progress";
import { useJob } from "@/lib/queries/jobs";
import { useBrandOffers } from "@/lib/queries/offers";
import { cn } from "@/lib/utils";
import type { BatchPage, BatchState } from "@/lib/validators/build";
import {
  type BatchOfferStarted,
  batchOfferStartedSchema,
  offerChangeResultSchema,
} from "@/lib/validators/offer";

import { OfferChoices } from "./change-offer-dialog";
import {
  CancelButton,
  LIST,
  ListName,
  OfferCard,
  OfferModal,
  tile,
} from "./offer-modal";

const NONE = "none";

/** A copy made with a different offer than its original's: a variant, left out by default. */
function isVariant(page: BatchPage, pages: BatchPage[]): boolean {
  if (!page.parent_id) return false;
  const parent = pages.find((p) => p.id === page.parent_id);
  return parent !== undefined && parent.offer_id !== page.offer_id;
}

function pageName(page: BatchPage): string {
  return page.copy_number ? `Copy ${page.copy_number}` : page.template_name;
}

/**
 * Change offer on a batch (B7.3a, D147; the batch screen's header), drawn as Settings → Connect a
 * Shopify store (owner, 2026-11-10): a card on the grey frame, its header centred under an icon
 * tile, Cancel and the action on the frame below. The offer, then the batch's
 * pages to change, every one ticked except variants made with another offer; then each page's
 * change as it runs and what it did, a page that couldn't take it saying why.
 */
export function BatchOfferDialog({
  open,
  onOpenChange,
  batch,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  batch: BatchState;
  onChanged: () => void;
}) {
  const router = useRouter();
  const ready = batch.pages.filter((p) =>
    ["needs_review", "approved", "published"].includes(p.status),
  );
  const firstOriginal = ready.find((p) => !p.parent_id) ?? ready[0];
  const current = firstOriginal?.offer_id ?? null;
  const offers = useBrandOffers(batch.brand_id ?? null, open);
  const [chosen, setChosen] = useState<string | null>(null);
  const [ticked, setTicked] = useState<string[] | null>(null);
  const [started, setStarted] = useState<BatchOfferStarted | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pick = chosen ?? current ?? NONE;
  const chosenPages =
    ticked ?? ready.filter((p) => !isVariant(p, batch.pages)).map((p) => p.id);
  const close = () => {
    onOpenChange(false);
    if (started) {
      onChanged();
      router.refresh();
    }
    setChosen(null);
    setTicked(null);
    setStarted(null);
    setError(null);
  };
  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      setStarted(
        await apiFetch(
          `/api/builds/batch/${batch.batch_id}/offer`,
          batchOfferStartedSchema,
          {
            method: "POST",
            body: JSON.stringify({
              offer_id: pick === NONE ? null : pick,
              build_ids: chosenPages,
            }),
          },
        ),
      );
      onChanged();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Couldn’t change the offers.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <OfferModal open={open} onOpenChange={(next) => (next ? null : close())}>
      <OfferCard
        title="Change offer"
        description={
          started
            ? "Each page is back in review. Undo restores its old offer."
            : "Only the deal changes on the pages you tick."
        }
        error={error}
        actions={
          started ? (
            <Button type="button" size="compact" onClick={close}>
              Done
            </Button>
          ) : (
            <>
              <CancelButton disabled={busy} onClick={close} />
              <Button
                type="button"
                size="compact"
                disabled={busy || chosenPages.length === 0 || offers.isPending}
                onClick={() => void start()}
              >
                {busy ? (
                  <Spinner className="size-3.5" label="Starting" />
                ) : null}
                {chosenPages.length === 1
                  ? "Change 1 page"
                  : `Change ${chosenPages.length} pages`}
              </Button>
            </>
          )
        }
      >
        {started ? (
          <ul aria-label="Pages" className={LIST}>
            {started.pages.map((page) => (
              <StartedRow
                key={page.build_id}
                name={page.key}
                jobId={page.job_id}
                error={page.error}
              />
            ))}
          </ul>
        ) : offers.isPending ? (
          <p className="flex items-center gap-2 text-type-caption-1 text-heading-05">
            <Spinner className="size-3.5" label="Loading offers" />
            Loading the brand’s offers…
          </p>
        ) : (
          <>
            <div className="flex flex-col gap-1.5">
              <ListName>Offer</ListName>
              <OfferChoices
                offers={offers.data?.offers ?? []}
                current={current}
                value={pick}
                onChange={setChosen}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <ListName>Pages</ListName>
              <div role="group" aria-label="Pages to change" className={LIST}>
                {ready.map((page) => {
                  const on = chosenPages.includes(page.id);
                  return (
                    <label
                      key={page.id}
                      className={`${tile(on)} cursor-pointer`}
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={(event) =>
                          setTicked(
                            event.target.checked
                              ? [...chosenPages, page.id]
                              : chosenPages.filter((id) => id !== page.id),
                          )
                        }
                        className="size-3.5 accent-spot-500-blue"
                      />
                      <span className="w-14 shrink-0 font-medium text-heading-01">
                        {page.key}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-heading-02">
                        {pageName(page)}
                      </span>
                      <span className="shrink-0 text-sub-text">
                        {page.offer_name ?? "No offer"}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </OfferCard>
    </OfferModal>
  );
}

/** One page's change: its step while it runs, then how many lines it rewrote (or why not). */
function StartedRow({
  name,
  jobId,
  error,
}: {
  name: string;
  jobId: string | null;
  error: string | null;
}) {
  const job = useJob(jobId);
  const done = job.data && !isActive(job.data.status) ? job.data : null;
  const result =
    done?.status === "succeeded"
      ? offerChangeResultSchema.safeParse(done.result).data
      : undefined;
  const checks = result
    ? result.leftovers.length + result.invented.length + result.overreach.length
    : 0;
  const status = error
    ? error
    : !jobId
      ? "Not started"
      : result
        ? `${result.changed.length} ${result.changed.length === 1 ? "line" : "lines"} rewritten${checks ? `, ${checks} to check on the page` : ""}`
        : done
          ? (done.error?.message ?? "Didn’t change")
          : (job.data?.events.at(-1)?.message ?? "Waiting for a worker");
  return (
    <li className={tile(false)}>
      {jobId && !done && !error ? (
        <Spinner className="size-3.5" label={`Changing ${name}`} />
      ) : null}
      <span className="w-14 shrink-0 font-medium text-heading-01">{name}</span>
      <span
        className={cn(
          "min-w-0 flex-1 truncate",
          error || (done && !result) ? "text-text-danger" : "text-heading-02",
        )}
      >
        {status}
      </span>
    </li>
  );
}
