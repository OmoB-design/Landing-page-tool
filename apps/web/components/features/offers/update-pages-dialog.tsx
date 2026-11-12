"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { MorphText } from "@/components/ui/text-morph";
import { apiFetch } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import {
  type OfferPage,
  batchOfferStartedSchema,
  offerPagesSchema,
} from "@/lib/validators/offer";

import { ordinal } from "../builds/batch-frame";
import { PublishAllCard } from "../builds/publish-all-dialog";
import {
  LIST,
  ListName,
  OfferCard,
  OfferModal,
  WELL,
  tile,
} from "./offer-modal";

const ACTIVE = new Set(["queued", "running"]);
const POLL_MS = 1500;
/** What one page's rewrite costs in Claude, about (the copy pass on the deal's lines). */
const COST_NOTE = "About 2¢ a page.";

const ghost = "text-body hover:bg-foreground-03";

function isActive(page: OfferPage): boolean {
  return page.job !== null && ACTIVE.has(page.job.status);
}

/** A copy by its number (its title is its original's), as the batch windows name them. */
function pageName(page: OfferPage): string {
  return page.copy_number
    ? `Copy ${page.copy_number}`
    : (page.title.split(" · ")[0] ?? page.title);
}

/** The job's step in words; the runner's own first line ("Started (attempt 1 of 1)") as Starting. */
function stepText(step: string | null | undefined): string {
  if (!step) return "Updating";
  return step.startsWith("Started") ? "Starting" : step;
}

function updatedText(changed: number, checks: number): string {
  const lines = changed
    ? ` · ${changed} ${changed === 1 ? "line" : "lines"} rewritten`
    : "";
  return `Updated${lines}${checks ? `, ${checks} to check` : ""}`;
}

/**
 * Update the N pages that use it (B7.4, D149): after an offer is edited (or from its ⋯ on the
 * Offers tab), the pages selling it in their well, the out-of-date ones ticked, the others saying
 * why not (up to date, still building, another change running). Updating them is Change offer on
 * each, from the page's record of the offer to the offer as it is now. Then each page as it goes
 * (its place in line, its step, how many lines it rewrote and any to check, or why not with Try
 * again), "6 of 20 updated" above them; the window can close, the updates go on, and reopening it
 * follows them. When they're done, Approve and publish all for these pages, in the same window.
 */
export function UpdatePagesDialog({
  open,
  onOpenChange,
  offerId,
  offerName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  offerId: string;
  offerName: string;
}) {
  return (
    <OfferModal open={open} onOpenChange={onOpenChange}>
      {open ? (
        <UpdatePages
          offerId={offerId}
          offerName={offerName}
          onClose={() => onOpenChange(false)}
        />
      ) : null}
    </OfferModal>
  );
}

function UpdatePages({
  offerId,
  offerName,
  onClose,
}: {
  offerId: string;
  offerName: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const query = useQuery({
    queryKey: ["offer-pages", offerId],
    queryFn: () => apiFetch(`/api/offers/${offerId}/pages`, offerPagesSchema),
    refetchInterval: (q) =>
      q.state.data?.pages.some(isActive) ? POLL_MS : false,
  });
  // The pages being followed: those started here, or (reopened) those updating when it opened.
  const [started, setStarted] = useState<string[] | null>(null);
  const [ticked, setTicked] = useState<string[] | null>(null);
  // Why a page wasn't started (its row says so).
  const [refused, setRefused] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const pages = query.data?.pages ?? [];
  const running = pages.filter(isActive);
  if (started === null && running.length > 0)
    setStarted(running.map((p) => p.build_id));

  const followed = started
    ? pages.filter((p) => started.includes(p.build_id))
    : [];
  const updated = followed.filter(
    (p) => p.job?.status === "succeeded" && !refused[p.build_id],
  ).length;
  const allDone = followed.every((p) => !isActive(p));
  // The Offers tab's counts follow as pages finish.
  useEffect(() => {
    if (updated > 0) router.refresh();
  }, [updated, router]);

  const close = () => {
    router.refresh();
    onClose();
  };
  const start = async (ids: string[]) => {
    setBusy(true);
    setError(null);
    try {
      const result = await apiFetch(
        `/api/offers/${offerId}/pages`,
        batchOfferStartedSchema,
        { method: "POST", body: JSON.stringify({ build_ids: ids }) },
      );
      await query.refetch();
      setRefused((current) => {
        const next = { ...current };
        for (const page of result.pages) {
          if (page.error) next[page.build_id] = page.error;
          else delete next[page.build_id];
        }
        return next;
      });
      setStarted((current) => [...new Set([...(current ?? []), ...ids])]);
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Couldn’t update the pages.",
      );
    } finally {
      setBusy(false);
    }
  };

  if (publishing)
    return (
      <PublishAllCard
        scope={{ kind: "offer", id: offerId }}
        onChanged={() => router.refresh()}
        onClose={close}
      />
    );

  if (query.isPending || query.isError)
    return (
      <OfferCard
        title={`Pages using ${offerName}`}
        description="The pages selling this offer."
        error={
          query.isError
            ? query.error instanceof Error
              ? query.error.message
              : "Couldn’t read the pages."
            : null
        }
        actions={
          <Button
            type="button"
            variant="ghost"
            size="compact"
            className={ghost}
            onClick={close}
          >
            Close
          </Button>
        }
      >
        {query.isPending ? (
          <p className="flex items-center gap-2 text-type-caption-1 text-heading-05">
            <Spinner className="size-3.5" label="Reading the pages" />
            Reading the pages…
          </p>
        ) : null}
      </OfferCard>
    );

  if (started) {
    const total = followed.length;
    return (
      <OfferCard
        title={allDone ? "Pages updated" : "Updating the pages"}
        description={
          allDone
            ? "Approve and publish all puts the ones that were live, live again."
            : "You can close this. The updates carry on."
        }
        error={error}
        actions={
          <>
            <Button
              type="button"
              variant="ghost"
              size="compact"
              className={ghost}
              onClick={close}
            >
              Close
            </Button>
            {allDone && updated > 0 ? (
              <Button
                type="button"
                size="compact"
                onClick={() => setPublishing(true)}
              >
                Approve and publish all
              </Button>
            ) : null}
          </>
        }
      >
        <div className="flex flex-col gap-1.5">
          <ListName>
            <MorphText>{`${updated} of ${total} updated`}</MorphText>
          </ListName>
          <ul aria-label="Pages" className={`${WELL} ${LIST}`}>
            {followed.map((page) => (
              <ProgressRow
                key={page.build_id}
                page={page}
                refused={refused[page.build_id] ?? null}
                retrying={busy}
                onRetry={() => void start([page.build_id])}
              />
            ))}
          </ul>
        </div>
      </OfferCard>
    );
  }

  const actionable = pages.filter(
    (p) => p.out_of_date && !p.reason && !isActive(p),
  );
  const chosen = ticked ?? actionable.map((p) => p.build_id);
  const n = actionable.length;
  return (
    <OfferCard
      title={
        n === 0
          ? `Pages using ${offerName}`
          : n === 1
            ? "Update the page that uses it"
            : `Update the ${n} pages that use it`
      }
      description={
        n === 0
          ? pages.length === 0
            ? "No pages use it."
            : "They’re all up to date."
          : `${offerName} changed. On each page, only the deal changes.`
      }
      error={error}
      note={n > 0 && chosen.length > 0 ? COST_NOTE : null}
      actions={
        n === 0 ? (
          <Button type="button" size="compact" onClick={close}>
            Done
          </Button>
        ) : (
          <>
            <Button
              type="button"
              variant="ghost"
              size="compact"
              className={ghost}
              disabled={busy}
              onClick={close}
            >
              Not now
            </Button>
            <Button
              type="button"
              size="compact"
              disabled={busy || chosen.length === 0}
              onClick={() => void start(chosen)}
            >
              {busy ? <Spinner className="size-3.5" label="Starting" /> : null}
              {`Update ${chosen.length} ${chosen.length === 1 ? "page" : "pages"}`}
            </Button>
          </>
        )
      }
    >
      {pages.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <ListName>Pages</ListName>
          <ul aria-label="Pages" className={`${WELL} ${LIST}`}>
            {pages.map((page) => {
              const can = actionable.includes(page);
              const on = chosen.includes(page.build_id);
              return (
                <li key={page.build_id}>
                  <label
                    className={cn(
                      tile(on),
                      can ? "cursor-pointer" : "opacity-60",
                    )}
                  >
                    <input
                      type="checkbox"
                      disabled={!can}
                      checked={on}
                      onChange={(event) =>
                        setTicked(
                          event.target.checked
                            ? [...chosen, page.build_id]
                            : chosen.filter((id) => id !== page.build_id),
                        )
                      }
                      className="size-3.5 accent-spot-500-blue"
                    />
                    <PageLabel page={page} />
                    <span className="shrink-0 text-right text-sub-text">
                      {page.reason ??
                        (isActive(page)
                          ? "Updating…"
                          : page.out_of_date
                            ? "Out of date"
                            : "Up to date")}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </OfferCard>
  );
}

function PageLabel({ page }: { page: OfferPage }) {
  return (
    <span className="flex min-w-0 flex-1 items-center gap-2" title={page.title}>
      <span className="w-14 shrink-0 font-medium text-heading-01">
        {page.key}
      </span>
      <span className="min-w-0 truncate text-heading-02">{pageName(page)}</span>
    </span>
  );
}

/** One page as it's updated: its place in line, its step, then how it went (or why not). */
function ProgressRow({
  page,
  refused,
  retrying,
  onRetry,
}: {
  page: OfferPage;
  refused: string | null;
  retrying: boolean;
  onRetry: () => void;
}) {
  const job = page.job;
  // Refused because nothing changed for it: not a failure.
  const upToDate = refused?.toLowerCase().includes("up to date") ?? false;
  const failed = (refused !== null && !upToDate) || job?.status === "failed";
  const checks = job?.checks ?? 0;
  const changed = job?.changed ?? 0;
  const status = upToDate
    ? "Up to date"
    : refused
      ? refused
      : !job
        ? "Not started"
        : job.status === "queued"
          ? job.waiting
            ? `Waiting · ${ordinal(job.waiting)} in line`
            : "Waiting"
          : job.status === "running"
            ? stepText(job.step)
            : job.status === "succeeded"
              ? updatedText(changed, checks)
              : (job.error ?? "Didn’t update");
  return (
    <li className={cn(tile(false), "items-center")}>
      {job && isActive(page) && !refused ? (
        <Spinner className="size-3.5" label={`Updating ${page.key}`} />
      ) : null}
      <PageLabel page={page} />
      <span
        className={cn(
          "flex min-w-0 shrink items-center gap-1.5 text-right",
          failed ? "text-text-danger" : "text-heading-02",
        )}
      >
        <span className="min-w-0 truncate">{status}</span>
        {failed ? (
          <Button
            type="button"
            variant="outline"
            size="compact"
            disabled={retrying}
            onClick={onRetry}
            className="h-6 px-2 text-type-caption-2"
          >
            Try again
          </Button>
        ) : null}
        {job?.status === "succeeded" && checks > 0 && !refused ? (
          <Link
            href={`/pages/${page.build_id}`}
            className="shrink-0 font-medium text-heading-01 underline-offset-2 hover:underline"
          >
            Check it
          </Link>
        ) : null}
      </span>
    </li>
  );
}
