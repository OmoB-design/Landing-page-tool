import { describe, expect, it } from "vitest";

import { isActive, jobTitle, progressPercent } from "@/lib/jobs/progress";
import type { JobEvent } from "@/lib/validators/jobs";

const event = (data: JobEvent["data"]): JobEvent => ({
  id: 1,
  ts: "2026-10-08T12:00:00Z",
  level: "info",
  message: "Step",
  data,
});

describe("jobTitle", () => {
  it("names known kinds and humanises others", () => {
    expect(jobTitle("noop_demo")).toBe("Demo job");
    expect(jobTitle("brand_autofetch")).toBe("Brand autofetch");
  });
});

describe("isActive", () => {
  it("is true while queued or running", () => {
    expect(isActive("queued")).toBe(true);
    expect(isActive("running")).toBe(true);
    expect(isActive("succeeded")).toBe(false);
    expect(isActive("failed")).toBe(false);
  });
});

describe("progressPercent", () => {
  it("reads step and total from the event data", () => {
    expect(progressPercent(event({ step: 2, total: 5 }))).toBe(40);
    expect(progressPercent(event({ step: 5, total: 5 }))).toBe(100);
  });

  it("is null when the event does not report steps", () => {
    expect(progressPercent(null)).toBeNull();
    expect(progressPercent(event(null))).toBeNull();
    expect(progressPercent(event({ step: 1, total: 0 }))).toBeNull();
  });
});
