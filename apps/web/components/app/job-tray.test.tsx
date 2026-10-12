// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { JobTray } from "@/components/app/job-tray";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useJobs } from "@/lib/queries/jobs";
import type { JobSummary } from "@/lib/validators/jobs";

vi.mock("@/lib/queries/jobs", () => ({
  useJobs: vi.fn(),
  useMarkJobsSeen: () => ({ mutate: vi.fn() }),
}));
vi.mock("@/components/app/toaster", () => ({
  toast: {
    loading: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    dismiss: vi.fn(),
  },
}));

const job = (overrides: Partial<JobSummary>): JobSummary => ({
  id: "j1",
  kind: "noop_demo",
  status: "running",
  attempts: 1,
  max_attempts: 2,
  result: null,
  error: null,
  created_by: "me",
  created_at: new Date().toISOString(),
  started_at: null,
  finished_at: null,
  latest: null,
  ...overrides,
});

function renderTray(jobs: JobSummary[], seenAt: string | null = null) {
  vi.mocked(useJobs).mockReturnValue({ data: { jobs, seenAt } } as ReturnType<
    typeof useJobs
  >);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={new QueryClient()}>
      <TooltipProvider>{children}</TooltipProvider>
    </QueryClientProvider>
  );
  return render(<JobTray />, { wrapper });
}

describe("JobTray", () => {
  it("shows how many jobs are running", () => {
    renderTray([
      job({ id: "a", status: "running" }),
      job({ id: "b", status: "queued" }),
      job({ id: "c", status: "succeeded" }),
    ]);
    const button = screen.getByRole("button", { name: "Jobs, 2 running" });
    expect(button.querySelector("[data-dot]")).toBeTruthy();
  });

  it("counts jobs that finished since you last marked them read", () => {
    const finished = "2026-10-11T10:00:00Z";
    renderTray(
      [job({ status: "succeeded", finished_at: finished })],
      "2026-10-11T09:00:00Z",
    );
    const button = screen.getByRole("button", { name: "Jobs, 1 unread" });
    expect(button.querySelector("[data-dot]")).toBeTruthy();
  });

  it("drops the dot once jobs are marked read", () => {
    renderTray(
      [job({ status: "succeeded", finished_at: "2026-10-11T10:00:00Z" })],
      "2026-10-11T11:00:00Z",
    );
    expect(
      screen.getByRole("button", { name: "Jobs" }).querySelector("[data-dot]"),
    ).toBeNull();
  });

  it("has no count when nothing is running", () => {
    renderTray([job({ status: "failed" })]);
    expect(
      screen.getByRole("button", { name: "Jobs" }).querySelector("[data-dot]"),
    ).toBeNull();
  });
});
