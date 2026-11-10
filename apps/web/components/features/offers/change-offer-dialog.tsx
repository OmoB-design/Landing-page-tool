"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { apiFetch } from "@/lib/api/client";
import { isActive } from "@/lib/jobs/progress";
import { useJob } from "@/lib/queries/jobs";
import { useBrandOffers } from "@/lib/queries/offers";
import { cn } from "@/lib/utils";
import {
  type BrandOffer,
  offerChangeResultSchema,
  offerChangeStartedSchema,
} from "@/lib/validators/offer";

import { CancelButton, LIST, OfferCard, OfferModal, tile } from "./offer-modal";
import { OfferResult } from "./offer-result";

const NONE = "none";

/**
 * Change offer (B7.3a, D147; the build page's ⋯, drawn as Settings → Connect a Shopify store): the brand's offers and
 * No offer, the page's own marked Now; Change offer starts the job, which the desk then follows
 * ("Changing the offer…", the toast with Undo) while this window shows its steps and, when it's
 * done, every line it rewrote before and after, anything to check, and the lines to look at.
 */
export function ChangeOfferDialog({
  open,
  onOpenChange,
  buildId,
  brandId,
  currentOfferId,
  baseVersion,
  onStarted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  buildId: string;
  brandId: string;
  currentOfferId: string | null;
  baseVersion: number;
  /** The desk reads the page again, so it follows the job. */
  onStarted?: () => void;
}) {
  return (
    <OfferModal open={open} onOpenChange={onOpenChange}>
      {open ? (
        <ChangeOffer
          buildId={buildId}
          brandId={brandId}
          currentOfferId={currentOfferId}
          baseVersion={baseVersion}
          onStarted={onStarted}
          onClose={() => onOpenChange(false)}
        />
      ) : null}
    </OfferModal>
  );
}

function ChangeOffer({
  buildId,
  brandId,
  currentOfferId,
  baseVersion,
  onStarted,
  onClose,
}: {
  buildId: string;
  brandId: string;
  currentOfferId: string | null;
  baseVersion: number;
  onStarted?: () => void;
  onClose: () => void;
}) {
  const offers = useBrandOffers(brandId);
  const [chosen, setChosen] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const job = useJob(jobId);
  const pick = chosen ?? currentOfferId ?? NONE;
  const unchanged = pick === (currentOfferId ?? NONE);

  const start = async () => {
    setStarting(true);
    setError(null);
    try {
      const started = await apiFetch(
        `/api/builds/${buildId}/offer`,
        offerChangeStartedSchema,
        {
          method: "POST",
          body: JSON.stringify({
            offer_id: pick === NONE ? null : pick,
            base_version: baseVersion,
          }),
        },
      );
      setJobId(started.job_id);
      onStarted?.();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Couldn’t change the offer.",
      );
    } finally {
      setStarting(false);
    }
  };

  const finished = job.data && !isActive(job.data.status) ? job.data : null;
  const result =
    finished?.status === "succeeded"
      ? offerChangeResultSchema.safeParse(finished.result).data
      : undefined;
  const step = job.data?.events.at(-1)?.message;

  return (
    <OfferCard
      title={result ? result.reason : "Change offer"}
      description={
        result
          ? "Back in review. Undo restores the old offer."
          : "Only the deal changes: its prices, promo and lines."
      }
      error={error}
      band={
        jobId
          ? undefined
          : {
              title: "Offer",
              content: offers.isPending ? (
                <p className="flex items-center gap-2 text-heading-05">
                  <Spinner className="size-3.5" label="Loading offers" />
                  Loading the brand’s offers…
                </p>
              ) : (
                <OfferChoices
                  offers={offers.data?.offers ?? []}
                  current={currentOfferId}
                  value={pick}
                  onChange={setChosen}
                />
              ),
            }
      }
      actions={
        jobId ? (
          <Button
            type="button"
            size="compact"
            disabled={!finished}
            onClick={onClose}
          >
            Done
          </Button>
        ) : (
          <>
            <CancelButton onClick={onClose} />
            <Button
              type="button"
              size="compact"
              disabled={unchanged || starting || offers.isPending}
              onClick={() => void start()}
            >
              {starting ? (
                <Spinner className="size-3.5" label="Starting" />
              ) : null}
              Change offer
            </Button>
          </>
        )
      }
    >
      {result ? (
        <OfferResult result={result} />
      ) : jobId ? (
        finished ? (
          <p
            role="alert"
            className="text-type-caption-1 font-medium text-text-danger"
          >
            {finished.error?.message ?? "The offer didn’t change."}
          </p>
        ) : (
          <p className="flex items-center gap-2 text-type-caption-1 text-heading-02">
            <Spinner className="size-3.5" label="Changing the offer" />
            {step ?? "Waiting for a worker"}…
          </p>
        )
      ) : null}
    </OfferCard>
  );
}

/** The brand's offers and No offer, one to pick; the page's own marked Now. */
export function OfferChoices({
  offers,
  current,
  value,
  onChange,
}: {
  offers: BrandOffer[];
  current: string | null;
  value: string;
  onChange: (id: string) => void;
}) {
  const options = [
    ...offers.map((o) => ({ id: o.id, name: o.name, label: o.label })),
    { id: NONE, name: "No offer", label: "The store’s own price" },
  ];
  return (
    <div role="radiogroup" aria-label="Offer" className={LIST}>
      {options.map((option) => {
        const selected = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.id)}
            className={tile(selected)}
          >
            <span
              aria-hidden
              className={cn(
                "size-3 shrink-0 rounded-full ring-thin ring-stroke-strong",
                selected && "bg-heading-01 ring-heading-01",
              )}
            />
            <span className="min-w-0 flex-1 truncate font-medium text-heading-01">
              {option.name}
            </span>
            <span className="shrink-0 text-sub-text">{option.label}</span>
            {option.id === (current ?? NONE) ? (
              <span className="shrink-0 rounded-sm px-1.5 text-sub-text ring-thin ring-stroke">
                Now
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
