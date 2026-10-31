"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useRef, useState } from "react";

import { toast } from "@/components/app/toaster";
import { BuildStepIcon, RetryFigmaIcon } from "@/components/ui/lp-icons";
import { apiFetch } from "@/lib/api/client";
import {
  LOCATE_SECTION_EVENT,
  sectionAnchor,
} from "@/lib/builds/preview-anchors";
import { buildStepsFor } from "@/lib/builds/steps";
import { jobStepStates } from "@/lib/jobs/steps";
import { useJob } from "@/lib/queries/jobs";
import { cn } from "@/lib/utils";
import { buildCreatedSchema } from "@/lib/validators/build";

import { BuildingIllustration } from "./building-illustration";
import { useDeskOptional } from "./desk-context";

type Viewport = "desktop" | "phone";

const VIEWPORTS: [Viewport, string][] = [
  ["desktop", "Desktop"],
  ["phone", "Phone"],
];

/** The preview toolbar's buttons (Figma Build/Fail): 31 px, Surface-Primary in a 0.5 px
 * Stroke-Strong line in light, Dashboard in a 0.5 px Stroke line in dark, Shadow/Light, 8 px
 * corners, 12 px medium labels (Heading-02, Heading-01 in dark). */
const TOOL =
  "flex items-center rounded-md border-(length:--line-hairline) border-stroke-strong bg-surface-primary py-0.5 text-type-caption-1 font-medium text-heading-02 shadow-light outline-none transition-colors duration-150 ease-out focus-visible:ring-2 focus-visible:ring-ring dark:border-stroke dark:bg-dashboard dark:text-heading-01";

/**
 * The built page (Figma Build, the preview column): the Desktop / Phone switch, then Retry build
 * (a failed build only) and Open in new tab (unavailable until there is a page), above a
 * Foreground-02 well that runs to the foot of the view. With a page, the well holds it on
 * Surface-Modal with a 0.8 px left line, 390 px wide and centred at Phone; the page runs in a
 * sandboxed frame (no scripts, no access to the app), reloading when `version` changes, and a
 * claim's section button jumps it to that section, outlined. While the build runs, the well shows
 * the build illustration over "The preview appears when the build finishes." (BuildingIllustration);
 * when it failed (Figma Build/Fail), a dashed card
 * says so and names the step that failed. The well fades in as it changes from one to another. `failedStep` names it directly; otherwise it is read from
 * the build's job. `onRetry` replaces the real retry (the demo).
 */
export function BuildPreview({
  buildId,
  version,
  ready,
  failed = false,
  jobId = null,
  failedStep,
  progress: progressOverride,
  onRetry,
  origin = "owned",
}: {
  buildId: string;
  version: string;
  ready: boolean;
  failed?: boolean;
  jobId?: string | null;
  failedStep?: string;
  /** How far the build has got (0–1), for the illustration; otherwise read from the job. */
  progress?: number;
  onRetry?: () => void;
  /** A cloned build counts the clone-only steps too (B2.3). */
  origin?: string;
}) {
  const router = useRouter();
  const [viewport, setViewport] = useState<Viewport>("desktop");
  const [hash, setHash] = useState("");
  const frame = useRef<HTMLDivElement>(null);
  const iframe = useRef<HTMLIFrameElement>(null);
  const src = `/preview/${buildId}?v=${encodeURIComponent(version)}`;
  // On the review desk (D84) the frame shows the proof: every sentence clickable, our bridge
  // script running (allowed by a nonce), the page's own scripts still off.
  const desk = useDeskOptional();
  // The page's version changes with every edit and the build's last update with every rebuild, so
  // together they name one version of the proof, which the browser may keep (see the route).
  const editSrc = desk
    ? `/preview/${buildId}?mode=edit&v=${desk.desk.build.page_version}&u=${encodeURIComponent(version)}`
    : null;
  const frameSrc = editSrc ?? src;
  const focus = desk?.focus ?? null;
  const open = desk?.open;
  // The same query the steps poll (one request): the failed step's name, or the build's progress.
  const { data: job } = useJob(ready ? null : jobId);
  const steps = job ? jobStepStates(buildStepsFor(origin), job) : null;
  const stepName =
    failedStep ?? steps?.find((step) => step.status === "failed")?.label;
  const progress =
    progressOverride ??
    (job && steps && (job.status === "queued" || job.status === "running")
      ? (steps.filter((step) => step.done).length +
          (job.status === "running" &&
          steps.some((step) => step.status === "running")
            ? 0.5
            : 0)) /
        steps.length
      : undefined);
  const retry = useMutation({
    mutationFn: () =>
      apiFetch(`/api/builds/${buildId}/retry`, buildCreatedSchema, {
        method: "POST",
      }),
    onSuccess: () => router.refresh(),
    onError: (error) => toast.error(error.message),
  });

  // The desk's preview: a click on a sentence opens it in the Copy tab; when the frame (re)loads,
  // the outlined paragraph is outlined again.
  const focusRef = useRef(focus);
  useEffect(() => {
    focusRef.current = focus;
  }, [focus]);
  useEffect(() => {
    if (!open) return;
    const onMessage = (event: MessageEvent) => {
      const target = iframe.current?.contentWindow;
      if (!target || event.source !== target) return;
      const data = event.data as {
        type?: unknown;
        id?: unknown;
        block?: unknown;
      } | null;
      if (data?.type === "lp-frag" && typeof data.id === "string") {
        open({ fragment: data.id }, { scroll: false });
      } else if (data?.type === "lp-block" && typeof data.block === "number") {
        open({ block: data.block }, { scroll: false });
      } else if (data?.type === "lp-ready" && focusRef.current) {
        target.postMessage(
          {
            type: "lp-block-select",
            block: focusRef.current.block,
            colour: outline(),
            scroll: true,
            instant: true,
          },
          "*",
        );
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [open]);
  useEffect(() => {
    iframe.current?.contentWindow?.postMessage(
      {
        type: "lp-block-select",
        block: focus?.block ?? null,
        colour: outline(),
        scroll: focus?.scroll ?? false,
      },
      "*",
    );
    if (focus?.scroll)
      frame.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [focus]);

  useEffect(() => {
    let raf = 0;
    const onLocate = (event: Event) => {
      const key = (event as CustomEvent<string>).detail;
      // The same fragment twice doesn't move the frame, so step through an empty one first
      // (both are jumps within the page: no reload).
      setHash("#_");
      raf = requestAnimationFrame(() => setHash(`#${sectionAnchor(key)}`));
      frame.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    };
    window.addEventListener(LOCATE_SECTION_EVENT, onLocate);
    return () => {
      window.removeEventListener(LOCATE_SECTION_EVENT, onLocate);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <>
      <div className="flex items-start justify-between gap-2.5">
        <div
          role="group"
          aria-label="Preview width"
          className="flex segmented-frame p-0.5"
        >
          {VIEWPORTS.map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={viewport === id}
              onClick={() => setViewport(id)}
              className="rounded-sm px-1.5 py-1 text-type-caption-1 font-medium text-heading-02 transition-colors duration-150 ease-out outline-none hover:text-heading-01 focus-visible:ring-2 focus-visible:ring-ring aria-pressed:bg-foreground-02"
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          {failed ? (
            <button
              type="button"
              disabled={retry.isPending}
              onClick={() => (onRetry ? onRetry() : retry.mutate())}
              className={cn(
                TOOL,
                "gap-1.5 px-3 enabled:hover:bg-foreground-01 enabled:active:scale-97 disabled:text-heading-06 dark:enabled:hover:bg-foreground-01",
              )}
            >
              <RetryFigmaIcon className="shrink-0 text-icon-system dark:text-icon-nav-active" />
              <span className="py-1">
                {retry.isPending ? "Retrying…" : "Retry build"}
              </span>
            </button>
          ) : null}
          {ready ? (
            <a
              href={src}
              target="_blank"
              rel="noreferrer"
              className={cn(TOOL, "px-1.5 hover:bg-foreground-01")}
            >
              <span className="py-1">Open in new tab</span>
            </a>
          ) : (
            <button
              type="button"
              disabled
              title="Available when the page is built"
              className={cn(
                TOOL,
                "px-1.5 text-heading-06 dark:text-heading-06",
              )}
            >
              <span className="py-1">Open in new tab</span>
            </button>
          )}
        </div>
      </div>
      {ready ? (
        <div className="flex min-h-0 flex-1 animate-step-in justify-center bg-foreground-02 p-2.5 motion-reduce:animate-none">
          <div
            ref={frame}
            className={cn(
              "divider-l-preview flex min-w-0 bg-surface-modal",
              viewport === "phone" ? "w-preview-mobile max-w-full" : "flex-1",
            )}
          >
            <iframe
              ref={iframe}
              key={frameSrc}
              src={`${frameSrc}${hash}`}
              title={
                editSrc
                  ? "Page preview: click a line to edit it"
                  : "Page preview"
              }
              sandbox={editSrc ? "allow-scripts" : ""}
              className="size-full border-0 bg-page-canvas"
            />
          </div>
        </div>
      ) : failed ? (
        <div className="flex min-h-0 flex-1 animate-step-in flex-col items-center bg-foreground-02 px-2.5 pt-50 pb-2.5 motion-reduce:animate-none">
          <DashedFrame className="flex w-70 flex-col items-center gap-1.5 p-6">
            <p className="text-type-caption-1 font-medium text-heading-01">
              This build failed.
            </p>
            {stepName ? (
              <p className="flex w-full items-center justify-center gap-1.5 rounded-item bg-foreground-03 p-2 dark:bg-surface-primary">
                <BuildStepIcon
                  state="failed"
                  className="size-3.5 shrink-0 text-step-failed"
                  dotClassName="fill-step-failed-dot"
                />
                <span className="text-type-caption-1 font-medium text-heading-06">
                  {stepName}
                </span>
              </p>
            ) : null}
          </DashedFrame>
        </div>
      ) : (
        <BuildingIllustration progress={progress} />
      )}
    </>
  );
}

/**
 * The preview column while the page loads (measured against the loaded page, 2026-10-31): the
 * same toolbar (Desktop chosen, Open in new tab waiting), out of reach, over the empty well.
 */
export function BuildPreviewSkeleton() {
  return (
    <>
      <div inert className="flex items-start justify-between gap-2.5">
        <div className="flex segmented-frame p-0.5">
          {VIEWPORTS.map(([id, label]) => (
            <span
              key={id}
              className={cn(
                "rounded-sm px-1.5 py-1 text-type-caption-1 font-medium text-heading-02",
                id === "desktop" && "bg-foreground-02",
              )}
            >
              {label}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className={cn(TOOL, "px-1.5 text-heading-06 dark:text-heading-06")}
          >
            <span className="py-1">Open in new tab</span>
          </span>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 bg-foreground-02" />
    </>
  );
}

/**
 * Figma's 1 px dashed line (8 px dashes, 8 px gaps) inside 24 px corners: an SVG, since a CSS
 * dashed border can't set its dash length. Stroke-Input-Hover in light, Icon-Explainer in dark.
 */
function DashedFrame({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("relative", className)}>
      <svg
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full overflow-visible text-stroke-input-hover dark:text-icon-explainer"
      >
        <rect
          x="0.5"
          y="0.5"
          rx="23.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
          strokeDasharray="8 8"
          // The frame's size less the line (CSS geometry, so it follows the content).
          style={{ width: "calc(100% - 1px)", height: "calc(100% - 1px)" }}
        />
      </svg>
      {children}
    </div>
  );
}

/** The outline colour for the selected sentence: the app's blue (Spot-500-Blue). */
function outline(): string {
  return (
    getComputedStyle(document.documentElement)
      .getPropertyValue("--color-spot-500-blue")
      .trim() || "Highlight"
  );
}
