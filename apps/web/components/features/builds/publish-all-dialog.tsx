"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { UploadIcon } from "@/components/ui/icons";
import { Spinner } from "@/components/ui/spinner";
import { apiFetch } from "@/lib/api/client";
import { isActive } from "@/lib/jobs/progress";
import { useJob } from "@/lib/queries/jobs";
import { cn } from "@/lib/utils";
import {
  type PublishAllPage,
  type PublishAllStarted,
  publishAllPlanSchema,
  publishAllStartedSchema,
  publishingStateSchema,
} from "@/lib/validators/publishing";

import {
  CancelButton,
  LIST,
  ListName,
  OfferCard,
  OfferModal,
  WELL,
  tile,
} from "../offers/offer-modal";

const PLACES: Record<string, string> = {
  vercel: "Vercel",
  shopify_page: "Shopify",
  shopify_editable: "Shopify (editable)",
};
const ACTS = new Set(["approve_and_publish", "approve", "publish"]);

function places(destinations: string[]): string {
  return destinations.map((d) => PLACES[d] ?? d).join(" and ");
}

/** What will happen to a page, in a few words. */
export function planLabel(page: PublishAllPage): string {
  switch (page.action) {
    case "approve_and_publish":
      return `Approve, live again on ${places(page.destinations)}`;
    case "publish":
      return `Live again on ${places(page.destinations)}`;
    case "approve":
      return page.reason ? "Approve only" : "Approve · never live";
    default:
      return page.reason ?? "Nothing to do";
  }
}

function pageName(page: PublishAllPage): string {
  return page.copy_number
    ? `Copy ${page.copy_number}`
    : (page.title.split(" · ")[0] ?? page.title);
}

/** Whose pages: a batch's (its screen, B7.3b) or an offer's (after it's edited, B7.4). */
export type PublishAllScope = { kind: "batch" | "offer"; id: string };

function scopeUrl(scope: PublishAllScope): string {
  return scope.kind === "batch"
    ? `/api/builds/batch/${scope.id}/publish-all`
    : `/api/offers/${scope.id}/publish-all`;
}

/**
 * Approve and publish all (B7.3b, D148; the batch screen, and the pages of an offer once they're
 * updated, B7.4), drawn as the offer windows: the pages in their well, each saying what will happen (approve it and put it live again where it
 * was, approve it only when it was never live, or why not), the ones that can be acted on ticked;
 * one "Publish anyway" for checks that may be passed. Then each page's approval and its publish
 * as it runs, a failed publish with Try again.
 */
export function PublishAllDialog({
  open,
  onOpenChange,
  scope,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scope: PublishAllScope;
  onChanged: () => void;
}) {
  return (
    <OfferModal open={open} onOpenChange={onOpenChange}>
      {open ? (
        <PublishAllCard
          scope={scope}
          onChanged={onChanged}
          onClose={() => onOpenChange(false)}
        />
      ) : null}
    </OfferModal>
  );
}

/** The window's card, for a window that turns into it (Update the pages, B7.4). */
export function PublishAllCard({
  scope,
  onChanged,
  onClose,
}: {
  scope: PublishAllScope;
  onChanged: () => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const overrideId = useId();
  const plan = useQuery({
    queryKey: ["publish-all", scope.kind, scope.id],
    queryFn: () => apiFetch(scopeUrl(scope), publishAllPlanSchema),
  });
  const [ticked, setTicked] = useState<string[] | null>(null);
  const [anyway, setAnyway] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState<PublishAllStarted | null>(null);
  const pages = plan.data?.pages ?? [];
  const actionable = pages.filter((p) => ACTS.has(p.action));
  const chosen = ticked ?? actionable.map((p) => p.build_id);
  const chosenPages = pages.filter((p) => chosen.includes(p.build_id));
  const publishing = chosenPages.filter((p) => p.destinations.length > 0);
  const approving = chosenPages.filter((p) => p.action.startsWith("approve"));
  const passable = publishing.some((p) => p.gate.some((b) => b.overridable));
  const verb =
    publishing.length > 0 && approving.length > 0
      ? "Approve and publish"
      : publishing.length > 0
        ? "Publish"
        : "Approve";
  const close = () => {
    if (started) {
      onChanged();
      router.refresh();
    }
    onClose();
  };
  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      setStarted(
        await apiFetch(scopeUrl(scope), publishAllStartedSchema, {
          method: "POST",
          body: JSON.stringify({ build_ids: chosen, override: anyway }),
        }),
      );
      onChanged();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Couldn’t approve and publish the pages.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <OfferCard
      icon={UploadIcon}
      title="Approve and publish all"
      description={
        started
          ? "Approved pages go live again where they were live."
          : "Approve the pages and put the live ones live again. Pages never live stay unpublished."
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
              disabled={busy || chosen.length === 0 || plan.isPending}
              onClick={() => void start()}
            >
              {busy ? <Spinner className="size-3.5" label="Starting" /> : null}
              {actionable.length === 0
                ? "Nothing to do"
                : `${verb} ${chosen.length} ${chosen.length === 1 ? "page" : "pages"}`}
            </Button>
          </>
        )
      }
    >
      {plan.isPending ? (
        <p className="flex items-center gap-2 text-type-caption-1 text-heading-05">
          <Spinner className="size-3.5" label="Reading the pages" />
          Reading the pages…
        </p>
      ) : plan.isError ? (
        <p
          role="alert"
          className="text-type-caption-1 font-medium text-text-danger"
        >
          {plan.error instanceof Error
            ? plan.error.message
            : "Couldn’t read the pages."}
        </p>
      ) : (
        <div className="flex flex-col gap-1.5">
          <ListName>Pages</ListName>
          <ul aria-label="Pages" className={`${WELL} ${LIST}`}>
            {pages.map((page) => {
              const result = started?.pages.find(
                (p) => p.build_id === page.build_id,
              );
              return started ? (
                result ? (
                  <StartedRow
                    key={page.build_id}
                    page={page}
                    approved={result.approved}
                    jobs={result.jobs}
                    error={result.error}
                    override={anyway}
                  />
                ) : null
              ) : (
                <li key={page.build_id}>
                  <label
                    className={cn(
                      tile(chosen.includes(page.build_id)),
                      ACTS.has(page.action) ? "cursor-pointer" : "opacity-60",
                    )}
                  >
                    <input
                      type="checkbox"
                      disabled={!ACTS.has(page.action)}
                      checked={chosen.includes(page.build_id)}
                      onChange={(event) =>
                        setTicked(
                          event.target.checked
                            ? [...chosen, page.build_id]
                            : chosen.filter((id) => id !== page.build_id),
                        )
                      }
                      className="size-3.5 accent-spot-500-blue"
                    />
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="w-14 shrink-0 font-medium text-heading-01">
                          {page.key}
                        </span>
                        <span className="min-w-0 truncate text-heading-02">
                          {pageName(page)}
                        </span>
                      </span>
                      {page.reason && ACTS.has(page.action) ? (
                        <span className="text-type-caption-2 text-heading-05">
                          {page.reason}
                        </span>
                      ) : null}
                      {page.gate.map((b) => (
                        <span
                          key={b.code}
                          className="text-type-caption-2 text-heading-05"
                        >
                          {b.message}
                        </span>
                      ))}
                    </span>
                    <span className="shrink-0 text-right text-sub-text">
                      {planLabel(page)}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
          {passable && !started ? (
            <label
              htmlFor={overrideId}
              className="mt-2 flex items-start gap-2 text-type-caption-1 text-heading-02"
            >
              <input
                id={overrideId}
                type="checkbox"
                checked={anyway}
                onChange={(event) => setAnyway(event.target.checked)}
                className="mt-0.5 size-3.5 accent-spot-500-blue"
              />
              Publish anyway. I’ve checked these; this is recorded with my name.
            </label>
          ) : null}
        </div>
      )}
    </OfferCard>
  );
}

/** One page after starting: approved or not, then each place it's going live, as it runs. */
function StartedRow({
  page,
  approved,
  jobs,
  error,
  override,
}: {
  page: PublishAllPage;
  approved: boolean;
  jobs: Record<string, string>;
  error: string | null;
  override: boolean;
}) {
  const entries = Object.entries(jobs);
  return (
    <li className={cn(tile(false), "items-start")}>
      <span className="w-14 shrink-0 font-medium text-heading-01">
        {page.key}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        {approved ? <span className="text-heading-02">Approved</span> : null}
        {entries.map(([destination, jobId]) => (
          <PublishStatus
            key={destination}
            page={page}
            destination={destination}
            jobId={jobId}
            override={override}
          />
        ))}
        {error ? <span className="text-text-danger">{error}</span> : null}
        {!approved && entries.length === 0 && !error ? (
          <span className="text-sub-text">{planLabel(page)}</span>
        ) : null}
      </span>
    </li>
  );
}

/** A page's publish to one place: its step, then Live, or why not with Try again. */
function PublishStatus({
  page,
  destination,
  jobId,
  override,
}: {
  page: PublishAllPage;
  destination: string;
  jobId: string;
  override: boolean;
}) {
  const [retryJob, setRetryJob] = useState<string | null>(null);
  const [retryError, setRetryError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const job = useJob(retryJob ?? jobId);
  const done = job.data && !isActive(job.data.status) ? job.data : null;
  const place = PLACES[destination] ?? destination;
  const retry = async () => {
    setRetrying(true);
    setRetryError(null);
    try {
      const state = await apiFetch(
        `/api/builds/${page.build_id}/publish`,
        publishingStateSchema,
        {
          method: "POST",
          body: JSON.stringify({
            base_version: page.page_version,
            destination,
            override,
          }),
        },
      );
      if (state.job_id) setRetryJob(state.job_id);
    } catch (failure) {
      setRetryError(
        failure instanceof Error ? failure.message : "Couldn’t try again.",
      );
    } finally {
      setRetrying(false);
    }
  };
  if (!done)
    return (
      <span className="flex items-center gap-1.5 text-heading-02">
        <Spinner className="size-3" label={`Publishing to ${place}`} />
        {job.data?.events.at(-1)?.message ?? `Publishing to ${place}`}
      </span>
    );
  if (done.status === "succeeded")
    return <span className="text-heading-02">{`Live on ${place}`}</span>;
  return (
    <span className="flex flex-wrap items-center gap-1.5 text-text-danger">
      {retryError ?? done.error?.message ?? `Couldn’t publish to ${place}.`}
      <Button
        type="button"
        variant="outline"
        size="compact"
        disabled={retrying}
        onClick={() => void retry()}
        className="h-6 px-2 text-type-caption-2"
      >
        Try again
      </Button>
    </span>
  );
}
