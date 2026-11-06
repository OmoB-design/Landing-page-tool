// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PAGE_ASIDE } from "@/components/app/page-aside";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { BatchState } from "@/lib/validators/build";

import { BatchView } from "./batch-view";

vi.mock("@/components/app/page-header", () => ({
  PageHeader: ({ title, actions }: { title: string; actions?: unknown }) => (
    <header>
      <h1>{title}</h1>
      {actions as never}
    </header>
  ),
}));
vi.mock("@/lib/trash/actions", () => ({
  trashItem: vi.fn(),
  restoreItem: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

const now = new Date().toISOString();
const page = {
  template_type: "advertorial",
  job_id: null,
  step: null,
  waiting: null,
  error: null,
  origin: "owned" as const,
  residue_score: null,
  cost_usd: 0.12,
  created_by: "me",
  updated_at: now,
  started_at: null,
  finished_at: null,
};
const STATE: BatchState = {
  batch_id: "b1",
  brand: "Lume",
  product: "Calm Serum",
  created_at: now,
  pages: [
    {
      ...page,
      id: "p1",
      key: "BTC-1",
      title: "A",
      template_id: "t1",
      template_name: "Story",
      status: "needs_review",
    },
    {
      ...page,
      id: "p2",
      key: "BTC-2",
      title: "B",
      template_id: "t2",
      template_name: "Listicle",
      status: "building",
      started_at: now,
    },
    {
      ...page,
      id: "p3",
      key: "BTC-3",
      title: "C",
      template_id: "t3",
      template_name: "Top 5",
      status: "queued",
      waiting: 2,
    },
    {
      ...page,
      id: "p4",
      key: "BTC-4",
      title: "D",
      template_id: "t4",
      template_name: "Clone",
      status: "failed",
      error: "The copy didn't fit.",
      origin: "cloned" as const,
      residue_score: 91,
    },
  ],
};

beforeEach(() => {
  const slot = document.createElement("div");
  slot.id = PAGE_ASIDE;
  document.body.appendChild(slot);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      String(url).includes("/api/builds/batch/")
        ? new Response(JSON.stringify(STATE), { status: 200 })
        : new Response(JSON.stringify({ error: "nope" }), { status: 404 }),
    ),
  );
});

afterEach(() => {
  cleanup();
  document.getElementById(PAGE_ASIDE)?.remove();
  vi.unstubAllGlobals();
});

describe("batch page (B3.5b)", () => {
  it("lists the pages with live status pills and opens the builds panel while one builds", async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <TooltipProvider>
          <BatchView batchId="b1" me={{ id: "me", name: "Ada" }} />
        </TooltipProvider>
      </QueryClientProvider>,
    );
    expect(await screen.findByText("Calm Serum · Lume")).toBeTruthy();
    const rows = within(
      screen.getByRole("list", { name: "Pages in this batch" }),
    );
    expect(rows.getByText("Ready to review")).toBeTruthy();
    expect(rows.getByText(/^Building/)).toBeTruthy();
    expect(rows.getByText("Waiting · 2nd in line")).toBeTruthy();
    expect(rows.getByText("Failed")).toBeTruthy();
    expect(rows.getByRole("button", { name: /Try again/ })).toBeTruthy();
    expect(
      rows.getAllByRole("link").map((a) => a.getAttribute("href")),
    ).toEqual(["/pages/p1", "/pages/p2", "/pages/p3", "/pages/p4"]);

    // The builds panel opened by itself (a page is building), with a frame per page.
    const panel = within(
      await screen.findByRole("complementary", { name: "Builds" }),
    );
    expect(panel.getByText("1 of 4 ready")).toBeTruthy();
    expect(panel.getByText("Listicle")).toBeTruthy();
    fireEvent.click(panel.getByRole("button", { name: "Close builds" }));
    fireEvent.click(screen.getByRole("button", { name: /Progress/ }));
    expect(
      await screen.findByRole("complementary", { name: "Builds" }),
    ).toBeTruthy();
  });
});
