"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  type ReactNode,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";

import { PAGE_ASIDE } from "@/components/app/page-aside";
import { ListRow } from "@/components/app/grouped-list";
import { PageBody } from "@/components/app/page-body";
import { PageHeader } from "@/components/app/page-header";
import {
  CostLabel,
  OriginBadge,
  PersonAvatar,
  RelativeTime,
  ScoreChip,
} from "@/components/app/row-meta";
import { toast } from "@/components/app/toaster";
import { TypeGlyph } from "@/components/app/type-glyph";
import { Button } from "@/components/ui/button";
import { CloseIcon } from "@/components/ui/icons";
import { BuildSpinnerIcon } from "@/components/ui/lp-icons";
import { Spinner } from "@/components/ui/spinner";
import { MorphText } from "@/components/ui/text-morph";
import { apiFetch } from "@/lib/api/client";
import { RESIDUE_MIN_SCORE } from "@/lib/pages/list";
import { cn } from "@/lib/utils";
import {
  type BatchPage,
  batchStateSchema,
  buildCreatedSchema,
} from "@/lib/validators/build";

import { BuildStepsCard, useBuildSteps } from "./build-steps";
import { PageRowMenu } from "../pages/page-row-menu";

const POLL_MS = 3000;
const READY = new Set(["needs_review", "approved", "published"]);
const ACTIVE = new Set(["queued", "building"]);
// The side panel: the page editor's Buddy panel width, 6 px from the page panel.
const SHEET_GAP = 6;

const noSubscribe = () => () => {};

function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
}

/** m:ss since a moment, ticking while `live`. */
function useElapsed(from: string | null, live: boolean): string | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!live) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [live]);
  if (!from) return null;
  const seconds = Math.max(0, Math.floor((now - Date.parse(from)) / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/**
 * A batch of pages (B3.5, D115; B3.5b, owner 2026-11-06: "a more organized feel"): the header is
 * the product and brand; the pages are rows as the Pages list draws them (the template's glyph
 * and the key, the template's name, then its status as a pill whose words morph as the build moves
 * on, the residue score and origin, the cost so far, the time it's been building or when it last
 * changed, who started it, and the row menu). While pages build, a side panel beside the page
 * panel (as the page editor's Buddy panel) holds each page's build steps; it opens by itself while
 * anything is building, closes with ×, and Progress in the header opens it again.
 */
export function BatchView({
  batchId,
  me,
}: {
  batchId: string;
  me: { id: string; name: string };
}) {
  const batch = useQuery({
    queryKey: ["batch", batchId],
    queryFn: () => apiFetch(`/api/builds/batch/${batchId}`, batchStateSchema),
    refetchInterval: (query) =>
      query.state.data?.pages.some((p) => ACTIVE.has(p.status))
        ? POLL_MS
        : false,
  });
  const data = batch.data;
  const pages = data?.pages ?? [];
  const active = pages.some((p) => ACTIVE.has(p.status));
  const ready = pages.filter((p) => READY.has(p.status)).length;
  // Open by itself while anything builds; × and Progress decide after that.
  const [chosen, setChosen] = useState<boolean | null>(null);
  const sheetOpen = chosen ?? active;

  return (
    <>
      <PageHeader
        title={data ? `${data.product} · ${data.brand}` : "Batch"}
        crumb={{ label: "Pages", href: "/pages" }}
        actions={
          data ? (
            <Button
              variant="ghost"
              size="compact"
              aria-pressed={sheetOpen}
              onClick={() => setChosen(!sheetOpen)}
              className="h-7 gap-1.5 px-2 text-type-caption-1 text-heading-02"
            >
              {active ? (
                <BuildSpinnerIcon className="size-3.5 animate-step-spin text-icon-nav-active motion-reduce:animate-step-spin-slow" />
              ) : null}
              Progress
              <span className="text-heading-06 tabular-nums">
                <MorphText>{`${ready}/${pages.length}`}</MorphText>
              </span>
            </Button>
          ) : null
        }
      />
      <PageBody width="lg" className="gap-3 px-0 py-0">
        {batch.isError ? (
          <p className="px-6 py-6 text-type-caption-1 text-text-danger">
            {batch.error instanceof Error
              ? batch.error.message
              : "Couldn’t load the batch."}
          </p>
        ) : !data ? (
          <BatchRowsSkeleton />
        ) : (
          <ul aria-label="Pages in this batch" className="flex flex-col">
            {pages.map((page) => (
              <BatchRow
                key={page.id}
                page={page}
                creator={page.created_by === me.id ? me.name : "A teammate"}
                onRetried={() => void batch.refetch()}
              />
            ))}
          </ul>
        )}
      </PageBody>
      <BatchSheet
        open={Boolean(data) && sheetOpen}
        pages={pages}
        ready={ready}
        onClose={() => setChosen(false)}
      />
    </>
  );
}

function BatchRowsSkeleton() {
  return (
    <ul aria-hidden className="flex flex-col">
      {[0, 1, 2, 3].map((i) => (
        <li
          key={i}
          className="flex h-12 items-center gap-3 px-4 divider-b-thin"
        >
          <span className="h-3.5 w-20 animate-pulse rounded-sm bg-foreground-02" />
          <span className="h-3.5 w-48 animate-pulse rounded-sm bg-foreground-02" />
        </li>
      ))}
    </ul>
  );
}

/** While the batch screen's address is read (the page's Suspense fallback). */
export function BatchViewSkeleton() {
  return (
    <>
      <PageHeader title="Batch" crumb={{ label: "Pages", href: "/pages" }} />
      <PageBody width="lg" className="px-0 py-0">
        <BatchRowsSkeleton />
      </PageBody>
    </>
  );
}

function BatchRow({
  page,
  creator,
  onRetried,
}: {
  page: BatchPage;
  creator: string;
  onRetried: () => void;
}) {
  const queryClient = useQueryClient();
  const [retrying, setRetrying] = useState(false);
  const isReady = READY.has(page.status);
  const building = page.status === "building";
  const { steps, done } = useBuildSteps(
    building ? page.job_id : null,
    isReady,
    page.origin,
    page.template_type,
  );
  const elapsed = useElapsed(page.started_at, building);
  const retry = async () => {
    setRetrying(true);
    try {
      await apiFetch(`/api/builds/${page.id}/retry`, buildCreatedSchema, {
        method: "POST",
      });
      await queryClient.invalidateQueries({ queryKey: ["batch"] });
      onRetried();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Couldn’t try again.",
      );
    } finally {
      setRetrying(false);
    }
  };
  const href = `/pages/${page.id}`;
  return (
    <ListRow
      href={href}
      title={page.template_name}
      leading={
        <span className="flex w-23.75 shrink-0 items-center gap-1.5">
          <TypeGlyph type={page.template_type} size="md" />
          <span className="text-type-body-small font-medium text-heading-01">
            {page.key}
          </span>
        </span>
      }
      meta={
        <>
          <StatusPill
            page={page}
            progress={building ? `${done} of ${steps.length}` : null}
          />
          {page.residue_score !== null ? (
            <ScoreChip score={page.residue_score} min={RESIDUE_MIN_SCORE} />
          ) : null}
          <OriginBadge origin={page.origin} />
          <span className="text-type-caption-1 text-sub-text tabular-nums">
            {building ? (
              <MorphText>{`$${page.cost_usd.toFixed(2)}`}</MorphText>
            ) : (
              <CostLabel costUsd={page.cost_usd} />
            )}
          </span>
          {building && elapsed ? (
            <span className="w-10 text-right text-type-caption-1 text-sub-text tabular-nums">
              <MorphText>{elapsed}</MorphText>
            </span>
          ) : page.status === "queued" ? null : (
            <RelativeTime date={new Date(page.updated_at)} />
          )}
          <PersonAvatar name={creator} />
        </>
      }
      actions={
        <span className="flex items-center gap-1">
          {page.status === "failed" ? (
            <Button
              variant="outline"
              size="compact"
              disabled={retrying}
              onClick={() => void retry()}
              className="h-7 px-2 text-type-caption-1"
            >
              {retrying ? <Spinner className="size-3.5" /> : null}
              Try again
            </Button>
          ) : null}
          <PageRowMenu buildId={page.id} pageKey={page.key} href={href} />
        </span>
      }
    />
  );
}

const PILL: Record<string, string> = {
  queued: "bg-foreground-02 text-heading-05",
  building: "bg-foreground-02 text-heading-02",
  needs_review: "bg-highlight-blue-50 text-highlight-blue-500",
  approved: "bg-highlight-purple-50 text-highlight-purple-500",
  published: "bg-highlight-green-50 text-highlight-green-500",
  failed: "bg-highlight-red-50 text-highlight-red-500",
};

/**
 * A page's status as a pill (owner, 2026-11-06): its colour follows the Pages status glyphs, and
 * its words morph as the build moves on (torph): "Waiting · 2nd in line", "Building · 3 of 8",
 * "Ready to review", "Approved", "Published", "Failed".
 */
function StatusPill({
  page,
  progress,
}: {
  page: BatchPage;
  progress: string | null;
}) {
  const label =
    page.status === "queued"
      ? page.waiting
        ? `Waiting · ${ordinal(page.waiting)} in line`
        : "Waiting"
      : page.status === "building"
        ? progress
          ? `Building · ${progress}`
          : "Building"
        : page.status === "needs_review"
          ? "Ready to review"
          : page.status === "approved"
            ? "Approved"
            : page.status === "published"
              ? "Published"
              : page.status === "failed"
                ? "Failed"
                : page.status;
  return (
    <span
      title={page.status === "failed" ? (page.error ?? undefined) : undefined}
      className={cn(
        "flex h-5.5 items-center gap-1 rounded-full px-2 text-type-caption-2 font-medium whitespace-nowrap transition-colors duration-300 ease-out",
        PILL[page.status] ?? PILL.queued,
      )}
    >
      {page.status === "building" ? (
        <BuildSpinnerIcon className="size-3 animate-step-spin motion-reduce:animate-step-spin-slow" />
      ) : page.status === "queued" ? (
        <span aria-hidden className="size-1.5 rounded-full bg-meta-dot" />
      ) : null}
      <MorphText>{label}</MorphText>
    </span>
  );
}

/**
 * The batch's side panel (B3.5b; no Figma frame yet, drawn as the page editor's Buddy panel): a
 * white panel 6 px right of the page panel, which narrows to make room, 356 px; its 48 px header
 * says how many are ready over a ×; then each page's build steps (the build page's Build steps
 * card, titled with the template), building first, then waiting, failed and ready. It opens by
 * widening (0.5 s on the editor's settle) as the panel fades in, and closes faster.
 */
function BatchSheet({
  open,
  pages,
  ready,
  onClose,
}: {
  open: boolean;
  pages: BatchPage[];
  ready: number;
  onClose: () => void;
}) {
  const reduced = useReducedMotion() ?? false;
  // The shell's side slot, once on the client (none while the server renders).
  const slot = useSyncExternalStore(
    noSubscribe,
    () => document.getElementById(PAGE_ASIDE),
    () => null,
  );
  if (!slot) return null;
  const order = (p: BatchPage) =>
    p.status === "building"
      ? 0
      : p.status === "queued"
        ? 1
        : p.status === "failed"
          ? 2
          : 3;
  const sorted = [...pages].sort((a, b) => order(a) - order(b));
  return createPortal(
    <AnimatePresence initial={false}>
      {open ? (
        <motion.div
          key="sheet"
          className="relative shrink-0"
          initial={{ width: 0 }}
          animate={{
            width: `calc(var(--spacing-lander-panel) + ${SHEET_GAP}px)`,
            transition: reduced
              ? { duration: 0 }
              : { duration: 0.5, ease: [0.2, 0.8, 0, 1] },
          }}
          exit={{
            width: 0,
            transition: reduced
              ? { duration: 0 }
              : { duration: 0.35, ease: [0.2, 0.8, 0, 1] },
          }}
        >
          <motion.aside
            aria-label="Builds"
            className="absolute inset-y-0 right-0 flex w-lander-panel flex-col overflow-hidden rounded-panel bg-surface-primary edge"
            initial={{ opacity: 0, scale: reduced ? 1 : 0.98 }}
            animate={{ opacity: 1, scale: 1, transition: { duration: 0.35 } }}
            exit={{ opacity: 0, transition: { duration: 0.15 } }}
            style={{ transformOrigin: "right center" }}
          >
            <header className="flex h-12 shrink-0 items-center gap-2 pr-2 pl-4 divider-b-thin">
              <h2 className="min-w-0 flex-1 text-type-body-small font-medium text-heading-01">
                Builds
              </h2>
              <span className="text-type-caption-1 text-sub-text tabular-nums">
                <MorphText>{`${ready} of ${pages.length} ready`}</MorphText>
              </span>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Close builds"
                onClick={onClose}
                className="size-7"
              >
                <CloseIcon aria-hidden className="size-3.5" />
              </Button>
            </header>
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
              {sorted.map((page) => (
                <BatchFrame key={page.id} page={page} />
              ))}
            </div>
          </motion.aside>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    slot,
  );
}

/** One page's build steps in the side panel: the build page's card, titled with the template. */
function BatchFrame({ page }: { page: BatchPage }): ReactNode {
  const isReady = READY.has(page.status);
  const { steps, done } = useBuildSteps(
    page.status === "queued" ? null : page.job_id,
    isReady,
    page.origin,
    page.template_type,
  );
  return (
    <div className="flex flex-col gap-1">
      <span className="px-0.5 text-type-caption-2 font-medium text-heading-06">
        {page.key}
        {page.status === "queued" && page.waiting
          ? ` · waiting, ${ordinal(page.waiting)} in line`
          : ""}
      </span>
      <BuildStepsCard
        title={page.template_name}
        steps={steps}
        done={page.status === "queued" ? 0 : done}
      />
    </div>
  );
}
