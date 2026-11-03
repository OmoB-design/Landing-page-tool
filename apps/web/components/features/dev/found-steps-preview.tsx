"use client";

import { useEffect, useState } from "react";

import { JobSteps } from "@/components/app/job-steps";
import { FETCH_STEPS } from "@/components/features/brands/new-brand-flow";
import {
  ANALYSIS_STEPS,
  CLONE_STEPS,
} from "@/components/features/templates/clone-flow";
import { Button } from "@/components/ui/button";
import {
  SAMPLE_BRAND,
  SAMPLE_CLONE_SOURCE,
} from "@/lib/illustrations/sample-brand";
import type { JobDetail, JobStatus } from "@/lib/validators/jobs";

/*
 * /dev/loaders (development only): the brand fetch and clone checklists played through with
 * made-up progress, so what each step found (I3) can be reviewed without running a job. The
 * events and their timing are invented; the components and step lists are the real ones.
 */

type Beat = {
  at: number;
  job: "brand" | "clone" | "analysis";
  step?: number;
  found?: { text?: string; colors?: string[] };
  status?: JobStatus;
};

const SCRIPT: Beat[] = [
  // Add a brand.
  { at: 0, job: "brand", status: "running" },
  { at: 700, job: "brand", step: 1 },
  { at: 1500, job: "brand", step: 2, found: { text: SAMPLE_BRAND.name } },
  { at: 2600, job: "brand", step: 3 },
  {
    at: 3300,
    job: "brand",
    step: 4,
    found: {
      text: `${SAMPLE_BRAND.fonts.heading} · ${SAMPLE_BRAND.fonts.body}`,
      colors: [...SAMPLE_BRAND.palette],
    },
  },
  { at: 4800, job: "brand", status: "succeeded" },
  // Clone a page, then its analysis.
  { at: 0, job: "clone", status: "running" },
  {
    at: 900,
    job: "clone",
    step: 1,
    found: {
      text: `${SAMPLE_CLONE_SOURCE.platform} · ${SAMPLE_CLONE_SOURCE.title}`,
    },
  },
  { at: 1500, job: "clone", step: 2 },
  { at: 2200, job: "clone", step: 3 },
  { at: 2800, job: "clone", step: 4 },
  { at: 3300, job: "clone", status: "succeeded" },
  { at: 3400, job: "analysis", status: "running" },
  {
    at: 4100,
    job: "analysis",
    step: 1,
    found: { text: "214 blocks · 31 images" },
  },
  {
    at: 6100,
    job: "analysis",
    step: 2,
    found: {
      text: SAMPLE_CLONE_SOURCE.brandWords.join(" · "),
      colors: [...SAMPLE_CLONE_SOURCE.palette],
    },
  },
  { at: 6900, job: "analysis", step: 3, found: { text: "9 sections" } },
  { at: 7500, job: "analysis", status: "succeeded" },
];

function jobAt(name: Beat["job"], elapsed: number): JobDetail | null {
  const beats = SCRIPT.filter((b) => b.job === name && b.at <= elapsed);
  if (beats.length === 0) return null;
  const status = beats.findLast((b) => b.status)?.status ?? "running";
  return {
    id: name,
    kind: name,
    status,
    attempts: 1,
    max_attempts: 3,
    result: null,
    error: null,
    created_by: null,
    created_at: "2026-11-03T12:00:00Z",
    started_at: "2026-11-03T12:00:00Z",
    finished_at: null,
    events: beats
      .filter((b) => b.step !== undefined)
      .map((b) => ({
        id: b.at,
        ts: "2026-11-03T12:00:00Z",
        level: "info" as const,
        message: `Step ${b.step}`,
        data: {
          step: b.step,
          total: 5,
          ...(b.found ? { found: b.found } : {}),
        },
      })),
  };
}

const END = Math.max(...SCRIPT.map((b) => b.at));

export function FoundStepsPreview() {
  const [run, setRun] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    // Polled like the real screens: the checklists see progress in steps, not continuously.
    const started = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now() - started;
      setElapsed(now);
      if (now > END) window.clearInterval(timer);
    }, 250);
    return () => window.clearInterval(timer);
  }, [run]);

  const brand = jobAt("brand", elapsed);
  const clone = jobAt("clone", elapsed);
  const analysis = jobAt("analysis", elapsed);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Button
          variant="secondary"
          size="compact"
          onClick={() => {
            setElapsed(0);
            setRun((n) => n + 1);
          }}
        >
          Replay
        </Button>
      </div>
      <div className="flex flex-wrap items-start gap-4" key={run}>
        <JobSteps
          title="Fetching brand details"
          steps={FETCH_STEPS}
          job={brand}
          className="w-75 [&_.ui-progress]:pb-6.5"
        />
        <JobSteps
          title="Cloning the page"
          steps={CLONE_STEPS.url}
          job={clone}
          className="w-75 [&_.ui-progress]:pb-6.5"
        />
        {analysis ? (
          <JobSteps
            title="Analysing it"
            steps={ANALYSIS_STEPS}
            job={analysis}
            className="w-75 [&_.ui-progress]:pb-6.5"
          />
        ) : null}
      </div>
    </div>
  );
}
