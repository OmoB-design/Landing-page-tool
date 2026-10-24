"use client";

import { useEffect, useState } from "react";

import { PageHeader } from "@/components/app/page-header";
import { PagesIcon } from "@/components/ui/icons";
import { OWNED_BUILD_STEPS } from "@/lib/builds/steps";
import { useJob } from "@/lib/queries/jobs";
import type { BuildReport as Report } from "@/lib/validators/build";

import { BuildPreview } from "./build-preview";
import { BuildReport } from "./build-report";
import { type BuildStep, BuildLog, BuildStepsCard } from "./build-steps";
import { BuildWorkspace } from "./build-workspace";
import { ExportButton } from "./export-button";

/** Waiting in the queue before the first step starts. */
const QUEUED_MS = 1600;
/** Each step's time in the demo, in order; the copy and the images take longest, as in a real build. */
const STEP_MS = [
  1400, 900, 1600, 1000, 1200, 3200, 900, 1100, 2200, 1300, 1000, 1400, 900,
];
/** After the last step, the moment before the page shows its preview and report. */
const REVEAL_MS = 700;

/** The log line each step writes when it finishes, where the build's own log has none. */
const DONE_LINE: Record<string, string> = {
  load_inputs: "Loaded the template, brand and product",
  apply_section_layout: "Arranged the sections",
  recolor: "Applied the brand colours and fonts",
  swap_logos: "Swapped in the logo",
  regenerate_variants: "Built the product options",
  copy_rewrite: "Rewrote the copy",
  purge_terms: "Removed forbidden terms",
  prepare_media_slots: "Prepared the image slots",
  image_pass: "Placed the images",
  finalize_common: "Finished the page",
  product_fidelity: "Matched the product photos",
  compliance_scan: "Checked the claims",
  write_report: "Wrote the report",
};

/**
 * A replay of a build (development only, `?demo` on a page's URL): the page as it looks from the
 * moment the build is queued, every step at rest; then each step starts (the loader turns), finishes
 * (it turns blue) and writes its log line; the count chip turns blue when all are done; then the
 * preview and the report appear, as the page does when a real build finishes. Nothing runs and
 * nothing is saved: it plays back this build's own log over a fixed timeline. With `failAt` it
 * fails at that step until Retry, which runs it again and carries on. Replay starts again.
 */
export function BuildDemo({
  build,
  failAt,
}: {
  /** Fail at this step (1-based), until Retry. */
  failAt?: number;
  build: {
    id: string;
    key: string;
    title: string;
    updatedAt: string;
    jobId: string | null;
    report: Report | null;
    hasPage: boolean;
  };
}) {
  // 0: queued; 1–13: step n running; 14: every step done; 15: the page shows its result.
  const [phase, setPhase] = useState(0);
  const [run, setRun] = useState(0);
  const [failed, setFailed] = useState(false);
  const [retried, setRetried] = useState(false);
  const { data: job } = useJob(build.jobId);
  const last = OWNED_BUILD_STEPS.length + 2;

  useEffect(() => {
    if (phase >= last || failed) return;
    const wait =
      phase === 0
        ? QUEUED_MS
        : phase <= OWNED_BUILD_STEPS.length
          ? (STEP_MS[phase - 1] ?? 1000)
          : REVEAL_MS;
    const timer = setTimeout(() => {
      if (failAt !== undefined && !retried && phase === failAt) setFailed(true);
      else setPhase((value) => value + 1);
    }, wait);
    return () => clearTimeout(timer);
  }, [phase, run, last, failed, retried, failAt]);

  const finished = Math.max(0, Math.min(phase - 1, OWNED_BUILD_STEPS.length));
  const steps: BuildStep[] = OWNED_BUILD_STEPS.map((step, index) => ({
    ...step,
    state:
      index < finished || phase > OWNED_BUILD_STEPS.length
        ? "done"
        : index === phase - 1
          ? failed
            ? "failed"
            : "running"
          : "idle",
    note:
      failed && index === phase - 1
        ? "The brand’s logo couldn’t be downloaded."
        : undefined,
  }));
  const own = (n: number) =>
    job?.events.find((event) => event.data?.step === n)?.message;
  const log =
    phase === 0
      ? []
      : [
          { id: "start", message: "Started (attempt 1 of 3)" },
          ...OWNED_BUILD_STEPS.slice(0, finished).map((step, index) => ({
            id: step.id,
            message: own(index + 1) ?? DONE_LINE[step.id] ?? step.label,
          })),
        ];
  const revealed = phase >= last;
  const ready = revealed && build.hasPage;

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        icon={PagesIcon}
        title={`${build.key} · ${build.title}`}
        actions={
          <ExportButton buildId={build.id} buildKey={build.key} ready={ready} />
        }
      />
      <BuildWorkspace
        preview={
          <BuildPreview
            buildId={build.id}
            version={build.updatedAt}
            ready={ready}
            failed={failed}
            failedStep={
              failed ? OWNED_BUILD_STEPS[phase - 1]?.label : undefined
            }
            // The steps' progress, half a step for the one running, as on a real build.
            progress={
              (finished +
                (steps.some((step) => step.state === "running") ? 0.5 : 0)) /
              OWNED_BUILD_STEPS.length
            }
            onRetry={() => {
              // Like a real retry: the failed step runs again, then the rest.
              setFailed(false);
              setRetried(true);
            }}
          />
        }
        panel={
          <>
            <BuildStepsCard
              steps={steps}
              done={steps.filter((step) => step.state === "done").length}
            />
            {log.length > 0 ? <BuildLog messages={log} /> : null}
            {revealed && build.report ? (
              <BuildReport report={build.report} />
            ) : null}
          </>
        }
      />
      <div
        role="status"
        className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-lg bg-surface-modal py-1.5 pr-1.5 pl-3 text-type-caption-1 font-medium text-heading-02 shadow-float edge-hairline"
      >
        <span>
          Demo build ·{" "}
          {failed
            ? `Failed at step ${phase}`
            : phase === 0
              ? "Queued"
              : revealed
                ? "Finished"
                : phase > OWNED_BUILD_STEPS.length
                  ? "Finishing"
                  : `Step ${phase} of ${OWNED_BUILD_STEPS.length}`}
        </span>
        <button
          type="button"
          onClick={() => {
            setPhase(0);
            setFailed(false);
            setRetried(false);
            setRun((value) => value + 1);
          }}
          className="rounded-sm px-2 py-1 text-text-link outline-none hover:bg-foreground-01 focus-visible:ring-2 focus-visible:ring-ring"
        >
          Replay
        </button>
      </div>
    </div>
  );
}
