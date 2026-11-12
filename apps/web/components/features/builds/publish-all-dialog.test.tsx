// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PublishAllDialog } from "./publish-all-dialog";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

const page = (over: Record<string, unknown>) => ({
  title: "Listicle: 10 reasons · The Market Tote",
  copy_number: null,
  status: "needs_review",
  page_version: 3,
  destinations: [],
  reason: null,
  gate: [],
  ...over,
});
const PLAN = {
  needs_override: true,
  pages: [
    page({ build_id: "a", key: "FRN-1", action: "approve_and_publish", destinations: ["vercel"],
           gate: [{ code: "claims", message: "1 claim is marked Fix in the claim check.", overridable: true }] }), // prettier-ignore
    page({ build_id: "b", key: "FRN-2", action: "approve" }),
    page({ build_id: "c", key: "FRN-3", action: "skip", reason: "Still building.", status: "building" }), // prettier-ignore
    page({ build_id: "d", key: "FRN-4", action: "none", reason: "Live and up to date.", status: "published" }), // prettier-ignore
  ],
};
let posts: { url: string; body: unknown }[] = [];

beforeEach(() => {
  posts = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const json = (data: unknown, status = 200) =>
        new Response(JSON.stringify(data), { status });
      if (init?.method === "POST") {
        posts.push({ url, body: JSON.parse(String(init.body)) });
        return json(
          {
            pages: [
              {
                build_id: "a",
                key: "FRN-1",
                approved: true,
                jobs: { vercel: "j1" },
                error: null,
              },
              {
                build_id: "b",
                key: "FRN-2",
                approved: true,
                jobs: {},
                error: null,
              },
            ],
          },
          202,
        );
      }
      if (url.endsWith("/publish-all")) return json(PLAN);
      if (url.startsWith("/api/jobs/"))
        return json({
          id: "j1", kind: "publish_vercel", status: "succeeded", attempts: 1, max_attempts: 1,
          result: {}, error: null, created_by: "me", created_at: "2026-11-10T10:00:00Z",
          started_at: null, finished_at: null, events: [],
        }); // prettier-ignore
      return json({}, 404);
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Approve and publish all (B7.3b)", () => {
  it("says what happens to each page, ticks what it can act on, and asks for Publish anyway", async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <PublishAllDialog
          open
          onOpenChange={() => {}}
          scope={{ kind: "batch", id: "bt1" }}
          onChanged={() => {}}
        />
      </QueryClientProvider>,
    );
    const list = await screen.findByRole("list", { name: "Pages" });
    const row = (key: string) => within(list).getByText(key).closest("label")!;
    expect(row("FRN-1").textContent).toContain("Approve, live again on Vercel");
    expect(row("FRN-1").textContent).toContain("1 claim is marked Fix");
    expect(row("FRN-2").textContent).toContain("Approve · never live");
    expect(row("FRN-3").textContent).toContain("Still building.");
    expect(row("FRN-4").textContent).toContain("Live and up to date.");
    const box = (key: string) =>
      within(row(key)).getByRole("checkbox") as HTMLInputElement;
    expect([box("FRN-1").checked, box("FRN-2").checked]).toEqual([true, true]);
    expect([box("FRN-3").disabled, box("FRN-4").disabled]).toEqual([
      true,
      true,
    ]);

    fireEvent.click(screen.getByLabelText(/Publish anyway/));
    fireEvent.click(
      screen.getByRole("button", { name: "Approve and publish 2 pages" }),
    );
    await waitFor(() =>
      expect(posts).toEqual([
        {
          url: "/api/builds/batch/bt1/publish-all",
          body: { build_ids: ["a", "b"], override: true },
        },
      ]),
    );
    const done = await screen.findByRole("list", { name: "Pages" });
    expect(await within(done).findByText("Live on Vercel")).toBeTruthy();
    expect(within(done).getAllByText("Approved")).toHaveLength(2);
  });
});
