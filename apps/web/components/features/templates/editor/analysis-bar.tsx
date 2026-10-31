"use client";

import { useEffect, useRef, useTransition } from "react";

import { toast } from "@/components/app/toaster";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useJob } from "@/lib/queries/jobs";
import { confirmAnalysis, reloadTemplate } from "@/lib/templates/actions";
import type { TemplateEditorState } from "@/lib/validators/template";

// Figma 722:14843: the strip's outline buttons have a quiet edge (0.6 px Stroke and an inner shade).
export const QUIET = "shadow-none ring-0 edge-quiet";

/**
 * A clone's analysis in the section editor (B2.2, D96; Figma 739:16700): a strip under the
 * top bar on the blue tint, 6 px above and below its 26 px buttons. While an analysis runs it shows its latest step; once one is saved,
 * it asks for a check of the sections and rules, with Analyse again and Confirm analysis; a
 * clone never analysed offers Analyse, and a failed attempt says why with Try again. A confirmed
 * clone shows nothing unless an analysis runs or fails (Analyse again is in Details then). When
 * an analysis finishes, the editor reloads the template. The editor holds the job, so Details
 * can start one too.
 */
export function AnalysisBar({
  state,
  jobId,
  earlierFailure,
  starting,
  onAnalyse,
  onFinished,
  onState,
}: {
  state: TemplateEditorState;
  /** The analysis being followed, if any. */
  jobId: string | null;
  /** Why the last analysis failed, from before this one was followed. */
  earlierFailure: string | null;
  starting: boolean;
  onAnalyse: () => void;
  onFinished: () => void;
  onState: (next: TemplateEditorState) => void;
}) {
  const { template } = state;
  const [pending, startTransition] = useTransition();
  const { data: job } = useJob(jobId);
  const settled = useRef<string | null>(null);

  useEffect(() => {
    if (!job || job.status !== "succeeded" || settled.current === job.id)
      return;
    settled.current = job.id;
    startTransition(async () => {
      const result = await reloadTemplate(template.id);
      if (result.state) onState(result.state);
      onFinished();
      toast.success(
        `Analysis saved: ${result.state?.sections.length ?? 0} sections to check`,
      );
    });
  }, [job, onFinished, onState, template.id]);

  if (template.origin !== "cloned") return null;
  const failed = job?.status === "failed" || job?.status === "cancelled";
  const running =
    starting || (jobId !== null && job?.status !== "succeeded" && !failed);
  const failure =
    jobId === null
      ? earlierFailure
      : failed
        ? (job?.error?.message ?? "The analysis didn’t finish.")
        : null;
  const toReview = Boolean(template.analysis && !template.analysis.reviewed_at);
  if (!running && !failure && !toReview && template.analysis && !pending)
    return null;

  const confirm = () =>
    startTransition(async () => {
      const result = await confirmAnalysis(template.id, template.version);
      if (result.state) {
        onState(result.state);
        toast.success("Analysis confirmed. You can build pages from it now.");
      } else {
        toast.error(result.error ?? "Couldn’t confirm the analysis.");
      }
    });
  const confirmButton = toReview ? (
    <Button size="compact" disabled={pending} onClick={confirm}>
      Confirm analysis
    </Button>
  ) : null;

  const latest = job?.events.at(-1)?.message;
  let message: string;
  let actions: React.ReactNode = null;
  if (running || (pending && jobId)) {
    message = `Analysing the page${latest ? `: ${latest}` : "…"}`;
  } else if (failure) {
    message = failure;
    actions = (
      <>
        <Button
          variant={toReview ? "outline" : "default"}
          size="compact"
          className={toReview ? QUIET : undefined}
          onClick={onAnalyse}
        >
          Try again
        </Button>
        {confirmButton}
      </>
    );
  } else if (!template.analysis) {
    message =
      "This clone hasn’t been analysed yet. Analysis finds its sections, colours and brand words (one Claude call, a few cents).";
    actions = (
      <Button size="compact" onClick={onAnalyse}>
        Analyse
      </Button>
    );
  } else {
    message = `Check the ${state.sections.length} sections and the rules, then confirm. Pages can be built from it after that.${
      template.analysis.ai === "mock"
        ? " This analysis ran in mock mode, without AI."
        : ""
    }`;
    actions = (
      <>
        <Button
          variant="outline"
          size="compact"
          className={QUIET}
          disabled={pending}
          onClick={onAnalyse}
        >
          Analyse again
        </Button>
        {confirmButton}
      </>
    );
  }
  return (
    <div
      role="status"
      className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 bg-tint-blue px-4 py-1.5 divider-b-half"
    >
      <p className="flex min-w-0 flex-1 items-center gap-2 text-type-caption-1 font-medium text-heading-01">
        {running || (pending && !actions) ? (
          <Spinner className="size-3.5 shrink-0" label="Analysing" />
        ) : null}
        <span className="min-w-0">{message}</span>
      </p>
      {actions ? (
        <div className="flex shrink-0 items-center gap-1.5">{actions}</div>
      ) : null}
    </div>
  );
}
