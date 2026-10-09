import { describe, expect, it } from "vitest";

import { jobStepStates } from "@/lib/jobs/steps";
import type { JobEvent } from "@/lib/validators/jobs";

const steps = [
  { id: "a", label: "Load" },
  { id: "b", label: "Read" },
  { id: "c", label: "Write" },
];
const event = (step?: number): JobEvent => ({
  id: step ?? 0,
  ts: "2026-10-08T12:00:00Z",
  level: "info",
  message: "x",
  data: step === undefined ? null : { step, total: 3 },
});

describe("jobStepStates", () => {
  it("shows every step as to-do before the job exists", () => {
    expect(jobStepStates(steps, null).map((s) => s.done)).toEqual([
      false,
      false,
      false,
    ]);
  });

  it("marks finished steps done and the next one running", () => {
    const states = jobStepStates(steps, {
      status: "running",
      events: [event(), event(1)],
      error: null,
    });
    expect(states.map((s) => [s.done, s.status])).toEqual([
      [true, undefined],
      [false, "running"],
      [false, undefined],
    ]);
  });

  it("shows a queued job's first step as running", () => {
    expect(
      jobStepStates(steps, { status: "queued", events: [], error: null })[0]
        ?.status,
    ).toBe("running");
  });

  it("marks the failed step with the error", () => {
    const states = jobStepStates(steps, {
      status: "failed",
      events: [event(1), event(2)],
      error: { code: "x", message: "Couldn't reach the site." },
    });
    expect(states[2]).toMatchObject({
      status: "failed",
      note: "Couldn't reach the site.",
    });
  });

  it("marks everything done when the job succeeded", () => {
    expect(
      jobStepStates(steps, {
        status: "succeeded",
        events: [],
        error: null,
      }).every((s) => s.done),
    ).toBe(true);
  });
});
