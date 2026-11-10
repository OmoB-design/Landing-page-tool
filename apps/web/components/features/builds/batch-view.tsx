"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  type ReactNode,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";

import { PAGE_ASIDE } from "@/components/app/page-aside";
import { ListRow } from "@/components/app/grouped-list";
import { PageHeader } from "@/components/app/page-header";
import {
  CostLabel,
  OriginBadge,
  PersonAvatar,
  RelativeTime,
  ScoreChip,
} from "@/components/app/row-meta";
import { toast } from "@/components/app/toaster";
import { StatusGlyph } from "@/components/app/status-glyph";
import { TypeGlyph } from "@/components/app/type-glyph";
import { Button } from "@/components/ui/button";
import { FolderColorPicker, FolderTile } from "@/components/ui/folder-icon";
import { CloseIcon } from "@/components/ui/icons";
import { BuildSpinnerIcon } from "@/components/ui/lp-icons";
import { Spinner } from "@/components/ui/spinner";
import { MorphText } from "@/components/ui/text-morph";
import { apiFetch } from "@/lib/api/client";
import { RESIDUE_MIN_SCORE } from "@/lib/pages/list";
import { cn } from "@/lib/utils";
import {
  type BatchPage,
  type BatchState,
  type FolderColor,
  batchFolderSchema,
  batchStateSchema,
  buildCreatedSchema,
} from "@/lib/validators/build";

import { BatchFrameCard, ordinal } from "./batch-frame";
import { useBuildSteps } from "./build-steps";
import { PageRowMenu } from "../pages/page-row-menu";

const POLL_MS = 3000;
const READY = new Set(["needs_review", "approved", "published"]);
const ACTIVE = new Set(["queued", "building"]);
// The side panel: the page editor's Buddy panel width, 6 px from the page panel.
const SHEET_GAP = 6;

const noSubscribe = () => () => {};

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
 * Laid out as the Pages page (owner, 2026-11-06): its 1100 px column 48 px under the header, the
 * product as the serif title where Pages has its own, over the brand and how many are ready; then,
 * centred, the batch's folder on its black tile with circles to pick its colour for the whole team;
 * then the list on a hairline.
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
      <div className="mx-auto box-content flex w-full max-w-pages flex-col gap-2 px-6 py-12">
        {batch.isError ? (
          <p className="text-type-caption-1 text-text-danger">
            {batch.error instanceof Error
              ? batch.error.message
              : "Couldn’t load the batch."}
          </p>
        ) : !data ? (
          <BatchTopSkeleton />
        ) : (
          <>
            <BatchTop batch={data} ready={ready} />
            <div className="flex h-9 items-center gap-1.5 divider-b-thin">
              <span className="text-type-body-small font-medium text-heading-01">
                Pages
              </span>
              <span className="rounded-xsm bg-foreground-02 px-1 text-type-caption-2 text-heading-05 tabular-nums">
                {pages.length}
              </span>
            </div>
            <ul aria-label="Pages in this batch" className="mt-3 flex flex-col">
              {families(pages).map(({ page, copies }) => (
                <BatchRow
                  key={page.id}
                  page={page}
                  creator={page.created_by === me.id ? me.name : "A teammate"}
                  onChanged={() => void batch.refetch()}
                  copies={copies.length}
                >
                  {copies.length > 0
                    ? copies.map((copy, index) => (
                        <BatchRow
                          key={copy.id}
                          page={copy}
                          creator={
                            copy.created_by === me.id ? me.name : "A teammate"
                          }
                          onChanged={() => void batch.refetch()}
                          branch={{
                            first: index === 0,
                            last: index === copies.length - 1,
                          }}
                        />
                      ))
                    : null}
                </BatchRow>
              ))}
            </ul>
          </>
        )}
      </div>
      <BatchSheet
        open={Boolean(data) && sheetOpen}
        pages={pages}
        ready={ready}
        onClose={() => setChosen(false)}
      />
    </>
  );
}

/**
 * The top of the batch page: the product as the serif title over the brand and how many pages are
 * ready; then, centred, the folder on its tile (hovered, it straightens and its frames rise) and
 * the colour circles under it, which colour it at once and save it for the whole workspace (back to
 * the old colour, with a toast, if that fails).
 */
function BatchTop({ batch, ready }: { batch: BatchState; ready: number }) {
  const queryClient = useQueryClient();
  const [hovered, setHovered] = useState(false);
  const key = ["batch", batch.batch_id];
  const router = useRouter();
  const colour = useMutation({
    mutationFn: (folder_color: FolderColor) =>
      apiFetch(`/api/builds/batch/${batch.batch_id}`, batchFolderSchema, {
        method: "PATCH",
        body: JSON.stringify({ folder_color }),
      }),
    // The folder takes the colour at once (nothing awaited first); a refresh in flight is
    // dropped, not put back, so it can't undo the pick.
    onMutate: (folder_color) => {
      void queryClient.cancelQueries({ queryKey: key }, { revert: false });
      const before = queryClient.getQueryData<BatchState>(key);
      queryClient.setQueryData<BatchState>(key, (old) =>
        old ? { ...old, folder_color } : old,
      );
      return { before };
    },
    // The Pages list is a server page the browser keeps for Back: drop it so the folder there
    // shows the new colour straight away.
    onSuccess: () => router.refresh(),
    onError: (error, _colour, context) => {
      if (context?.before) queryClient.setQueryData(key, context.before);
      toast.error(
        error instanceof Error
          ? error.message
          : "Couldn’t change the folder’s colour.",
      );
    },
  });
  const stills = batch.pages
    .slice(0, 3)
    .map((p) => `/thumbs/template/${p.template_id}`);
  const total = batch.pages.length;
  return (
    <>
      {/* The title where the Pages page has its own (owner, 2026-11-06). */}
      <div className="flex flex-col gap-1.5 pr-1 pb-6">
        <h1 className="font-serif text-type-title font-medium text-button-secondary-text">
          {batch.product}
        </h1>
        <p className="text-type-body-small leading-5 font-medium text-sub-text tabular-nums">
          {batch.brand} · {total} page{total === 1 ? "" : "s"},{" "}
          <MorphText>{`${ready} ready`}</MorphText>
        </p>
      </div>
      <div className="flex flex-col items-center gap-4 pb-8">
        <span
          // A mouse only: touch fires hover on tap.
          onPointerEnter={(e) => e.pointerType === "mouse" && setHovered(true)}
          onPointerLeave={(e) => e.pointerType === "mouse" && setHovered(false)}
        >
          <FolderTile
            tone={batch.folder_color}
            stills={stills}
            hovered={hovered}
          />
        </span>
        <FolderColorPicker
          value={batch.folder_color}
          onValueChange={(tone) => colour.mutate(tone)}
        />
      </div>
    </>
  );
}

/** The top and the rows while the batch loads: the title and its line, the tile, the circles. */
function BatchTopSkeleton() {
  return (
    <div aria-hidden className="flex flex-col gap-2">
      <div className="flex flex-col gap-1.5 pb-6">
        <span className="h-8 w-72 animate-pulse rounded-sm bg-foreground-02" />
        <span className="h-4 w-48 animate-pulse rounded-sm bg-foreground-02" />
      </div>
      <div className="flex flex-col items-center gap-4 pb-8">
        <span className="h-33 w-32.25 animate-pulse rounded-panel bg-foreground-02" />
        <span className="h-5 w-29 animate-pulse rounded-full bg-foreground-02" />
      </div>
      <div className="h-9 divider-b-thin" />
      <div className="mt-3">
        <BatchRowsSkeleton />
      </div>
    </div>
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
      <div className="mx-auto box-content flex w-full max-w-pages flex-col gap-2 px-6 py-12">
        <BatchTopSkeleton />
      </div>
    </>
  );
}

/**
 * The batch's pages as families (B7.1, D144): each copy under the page it was copied from, in
 * the order made; one whose original isn't in the batch any more stands on its own.
 */
export function families(
  pages: BatchPage[],
): { page: BatchPage; copies: BatchPage[] }[] {
  const ids = new Set(pages.map((page) => page.id));
  const nested = (page: BatchPage) =>
    page.parent_id !== null && ids.has(page.parent_id);
  return pages
    .filter((page) => !nested(page))
    .map((page) => ({
      page,
      copies: pages
        .filter((copy) => copy.parent_id === page.id)
        .sort((a, b) => (a.copy_number ?? 0) - (b.copy_number ?? 0)),
    }));
}

function BatchRow({
  page,
  creator,
  onChanged,
  copies = 0,
  branch,
  children,
}: {
  page: BatchPage;
  creator: string;
  onChanged: () => void;
  /** How many copies hang under it (B7.1). */
  copies?: number;
  branch?: { first: boolean; last: boolean };
  children?: ReactNode;
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
      onChanged();
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
      title={
        branch && page.copy_number ? (
          `Copy ${page.copy_number}`
        ) : copies > 0 ? (
          <>
            {page.template_name}
            <span className="ml-2 text-type-caption-1 font-normal text-sub-text tabular-nums">
              {copies === 1 ? "1 copy" : `${copies} copies`}
            </span>
          </>
        ) : (
          page.template_name
        )
      }
      level={branch ? 1 : 0}
      branch={branch}
      fold={
        copies > 0
          ? {
              show: `Show the pages under ${page.key}`,
              hide: `Hide the pages under ${page.key}`,
            }
          : undefined
      }
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
          <PageRowMenu
            buildId={page.id}
            pageKey={page.key}
            href={href}
            built={isReady}
            onDuplicated={onChanged}
          />
        </span>
      }
    >
      {children}
    </ListRow>
  );
}

const GLYPH = {
  needs_review: "needs_review",
  approved: "approved",
  published: "published",
  failed: "failed",
} as const;

/**
 * A page's status as a neutral pill (owner, 2026-11-06: no coloured chip), drawn as the row's
 * Owned badge: the Pages list's status icon at 12 px carries the colour (a spinner while it builds,
 * a dot while it waits), and its words morph as the build moves on (torph): "Waiting · 2nd in
 * line", "Building · 3 of 8", "Ready to review", "Approved", "Published", "Failed".
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
  const glyph =
    page.status in GLYPH ? GLYPH[page.status as keyof typeof GLYPH] : null;
  return (
    <span
      title={page.status === "failed" ? (page.error ?? undefined) : undefined}
      className={cn(
        "flex shrink-0 items-center gap-1 rounded-sm px-1.5 text-type-caption-1 whitespace-nowrap text-heading-03 ring-thin ring-stroke",
        page.status === "queued" && "text-sub-text",
      )}
    >
      {page.status === "building" ? (
        <BuildSpinnerIcon className="size-3 animate-step-spin text-icon-nav-active motion-reduce:animate-step-spin-slow" />
      ) : page.status === "queued" ? (
        <span aria-hidden className="size-1.5 rounded-full bg-meta-dot" />
      ) : glyph ? (
        <StatusGlyph status={glyph} className="size-3" iconClassName="size-3" />
      ) : null}
      <MorphText>{label}</MorphText>
    </span>
  );
}

/**
 * The batch's side panel (B3.5b; no Figma frame yet, drawn as the page editor's Buddy panel): a
 * white panel 6 px right of the page panel, which narrows to make room, 356 px; its 48 px header
 * says how many are ready over a ×; then a frame per page (BatchFrame: the build happening, its
 * step in words, every step a click away), building first, then waiting, failed and ready. It opens by
 * widening (0.36 s on the editor's settle) as the panel fades in, and closes faster (0.24 s).
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
              : { duration: 0.36, ease: [0.2, 0.8, 0, 1] },
          }}
          exit={{
            width: 0,
            transition: reduced
              ? { duration: 0 }
              : { duration: 0.24, ease: [0.2, 0.8, 0, 1] },
          }}
        >
          <motion.aside
            aria-label="Builds"
            className="absolute inset-y-0 right-0 flex w-lander-panel flex-col overflow-hidden rounded-panel bg-surface-primary edge"
            initial={{ opacity: 0, scale: reduced ? 1 : 0.98 }}
            animate={{
              opacity: 1,
              scale: 1,
              transition: { duration: 0.2, ease: [0.23, 1, 0.32, 1] },
            }}
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
            {/* Room kept for the scrollbar, so the frames don't narrow when one unfolds into a
                scroll (where scrollbars take space). */}
            <div className="flex min-h-0 flex-1 scrollbar-stable flex-col gap-3 overflow-y-auto p-3">
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

/** One page in the Builds panel: its frame, from its job's steps (BatchFrameCard). */
function BatchFrame({ page }: { page: BatchPage }): ReactNode {
  const { steps, done } = useBuildSteps(
    page.status === "queued" ? null : page.job_id,
    READY.has(page.status),
    page.origin,
    page.template_type,
  );
  return <BatchFrameCard page={page} steps={steps} done={done} />;
}
