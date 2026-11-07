// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { JobDetail } from "@/lib/validators/jobs";

import { useFollowedJob } from "./jobs";

function job(id: string, status: JobDetail["status"]): JobDetail {
  return {
    id,
    kind: "export",
    status,
    attempts: 1,
    max_attempts: 1,
    result: null,
    error:
      status === "failed"
        ? { code: "boom", message: "The export broke." }
        : null,
    created_by: "me",
    created_at: "2026-11-07T10:00:00Z",
    started_at: "2026-11-07T10:00:01Z",
    finished_at: status === "running" ? null : "2026-11-07T10:00:02Z",
    events: [],
  };
}

function serve(statuses: Record<string, JobDetail["status"]>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const id = url.split("/").at(-1) ?? "";
      return new Response(JSON.stringify(job(id, statuses[id] ?? "running")), {
        status: 200,
      });
    }),
  );
}

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={new QueryClient()}>
      {children}
    </QueryClientProvider>
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("useFollowedJob (B5.4)", () => {
  it("is running from the moment there's an id, and idle without one", () => {
    serve({});
    const idle = renderHook(() => useFollowedJob(null), { wrapper });
    expect(idle.result.current.running).toBe(false);
    const started = renderHook(() => useFollowedJob("j1"), { wrapper });
    // Before the first poll lands.
    expect(started.result.current.running).toBe(true);
  });

  it("calls each ending once, even across renders", async () => {
    serve({ ok: "succeeded", bad: "failed", gone: "cancelled" });
    const on = { succeeded: vi.fn(), failed: vi.fn(), cancelled: vi.fn() };
    const { result, rerender } = renderHook(
      ({ id }: { id: string }) => useFollowedJob(id, on),
      { wrapper, initialProps: { id: "ok" } },
    );
    await waitFor(() => expect(on.succeeded).toHaveBeenCalledOnce());
    rerender({ id: "ok" });
    rerender({ id: "bad" });
    await waitFor(() => expect(on.failed).toHaveBeenCalledOnce());
    expect(result.current.running).toBe(false);
    expect(result.current.failure).toBe("The export broke.");
    rerender({ id: "gone" });
    await waitFor(() => expect(on.cancelled).toHaveBeenCalledOnce());
    // A cancelled job isn't running, and isn't a failure.
    expect(result.current.running).toBe(false);
    expect(result.current.cancelled).toBe(true);
    expect(result.current.failure).toBeNull();
    expect(on.succeeded).toHaveBeenCalledOnce();
    expect(on.failed).toHaveBeenCalledOnce();
  });
});
