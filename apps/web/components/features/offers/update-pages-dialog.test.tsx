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

import { UpdatePagesDialog } from "./update-pages-dialog";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

type Job = {
  id: string;
  status: string;
  step?: string | null;
  waiting?: number | null;
  error?: string | null;
  changed?: number | null;
  checks?: number | null;
};
const page = (key: string, over: Record<string, unknown> = {}) => ({
  build_id: key.toLowerCase(),
  key,
  title: "Advertorial: 30-day wear test · Dome Bag",
  product: "Dome Bag",
  copy_number: null,
  status: "needs_review",
  out_of_date: true,
  reason: null,
  job: null as Job | null,
  ...over,
});
const job = (status: string, over: Partial<Job> = {}): Job => ({
  id: `j-${status}`,
  status,
  step: null,
  waiting: null,
  error: null,
  changed: null,
  checks: null,
  ...over,
});

let pages: ReturnType<typeof page>[] = [];
let posts: { url: string; body: unknown }[] = [];
// What the next reads of the pages return, after Update starts them.
let afterStart: ReturnType<typeof page>[][] = [];

beforeEach(() => {
  posts = [];
  afterStart = [];
  pages = [
    page("TBK-1"),
    page("TBK-2", { copy_number: 2 }),
    page("TBK-3", { out_of_date: false }),
    page("TBK-4", { reason: "Still building.", status: "building" }),
  ];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const json = (data: unknown, status = 200) =>
        new Response(JSON.stringify(data), { status });
      if (url === "/api/offers/o1/pages" && init?.method === "POST") {
        const body = JSON.parse(String(init.body)) as { build_ids: string[] };
        posts.push({ url, body });
        return json(
          {
            pages: body.build_ids.map((id) => ({
              build_id: id,
              key: id.toUpperCase(),
              job_id: `j-${id}`,
              error: null,
            })),
          },
          202,
        );
      }
      if (url === "/api/offers/o1/pages") {
        if (posts.length > 0 && afterStart.length > 0)
          pages = afterStart.shift()!;
        return json({ offer_id: "o1", name: "Ten off", pages });
      }
      if (url === "/api/offers/o1/publish-all")
        return json({ needs_override: false, pages: [] });
      return json({}, 404);
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const open = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <UpdatePagesDialog
        open
        onOpenChange={() => {}}
        offerId="o1"
        offerName="Ten off"
      />
    </QueryClientProvider>,
  );

describe("Update the pages that use an offer (B7.4)", () => {
  it("ticks the out-of-date pages, says why the others can't, and says what it costs", async () => {
    open();
    expect(
      await screen.findByText("Update the 2 pages that use it"),
    ).toBeTruthy();
    const list = screen.getByRole("list", { name: "Pages" });
    const row = (key: string) => within(list).getByText(key).closest("label")!;
    const box = (key: string) =>
      within(row(key)).getByRole("checkbox") as HTMLInputElement;
    expect(row("TBK-1").textContent).toContain("Out of date");
    expect(row("TBK-2").textContent).toContain("Copy 2");
    expect(row("TBK-3").textContent).toContain("Up to date");
    expect(row("TBK-4").textContent).toContain("Still building.");
    expect([box("TBK-1").checked, box("TBK-2").checked]).toEqual([true, true]);
    expect([box("TBK-3").disabled, box("TBK-4").disabled]).toEqual([
      true,
      true,
    ]);
    expect(screen.getByText("About 2¢ a page.")).toBeTruthy();
    fireEvent.click(box("TBK-2"));
    expect(screen.getByRole("button", { name: "Update 1 page" })).toBeTruthy();
  });

  it("follows each page to Updated, then offers Approve and publish all", async () => {
    afterStart = [
      [
        page("TBK-1", { job: job("running", { step: "Rewriting the lines" }) }),
        page("TBK-2", { copy_number: 2, job: job("queued", { waiting: 2 }) }),
      ],
      [
        page("TBK-1", {
          out_of_date: false,
          job: job("succeeded", { changed: 3, checks: 1 }),
        }),
        page("TBK-2", {
          copy_number: 2,
          job: job("failed", {
            error: "The page changed before the offer did.",
          }),
        }),
      ],
    ];
    open();
    fireEvent.click(
      await screen.findByRole("button", { name: "Update 2 pages" }),
    );
    await waitFor(() =>
      expect(posts).toEqual([
        {
          url: "/api/offers/o1/pages",
          body: { build_ids: ["tbk-1", "tbk-2"] },
        },
      ]),
    );
    expect(await screen.findByText("Updating the pages")).toBeTruthy();
    const list = screen.getByRole("list", { name: "Pages" });
    expect(within(list).getByText("Rewriting the lines")).toBeTruthy();
    expect(within(list).getByText("Waiting · 2nd in line")).toBeTruthy();

    // The next read: one updated (with a line to check), one failed.
    expect(
      await screen.findByText("Pages updated", undefined, { timeout: 4000 }),
    ).toBeTruthy();
    expect(
      within(list).getByText("Updated · 3 lines rewritten, 1 to check"),
    ).toBeTruthy();
    expect(within(list).getByRole("link", { name: "Check it" })).toBeTruthy();
    expect(
      within(list).getByText("The page changed before the offer did."),
    ).toBeTruthy();
    fireEvent.click(within(list).getByRole("button", { name: "Try again" }));
    await waitFor(() =>
      expect(posts.at(-1)).toEqual({
        url: "/api/offers/o1/pages",
        body: { build_ids: ["tbk-2"] },
      }),
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Approve and publish all" }),
    );
    expect(
      await screen.findByRole("heading", { name: "Approve and publish all" }),
    ).toBeTruthy();
  });

  it("reopened while pages update, it follows them", async () => {
    pages = [
      page("TBK-1", { job: job("queued", { waiting: 1 }) }),
      page("TBK-3", { out_of_date: false }),
    ];
    open();
    expect(await screen.findByText("Updating the pages")).toBeTruthy();
    const list = screen.getByRole("list", { name: "Pages" });
    expect(within(list).getByText("Waiting · 1st in line")).toBeTruthy();
    expect(within(list).queryByText("TBK-3")).toBeNull();
  });
});
