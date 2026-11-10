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
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { copyLabel } from "@/lib/pages/list";
import type { BatchState } from "@/lib/validators/build";

import { BatchOfferDialog } from "./batch-offer-dialog";
import { ChangeOfferDialog } from "./change-offer-dialog";
import { VariantsDialog } from "./variants-dialog";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock("@/components/app/toaster", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const OFFERS = [
  { id: "o1", name: "Autumn 20%", label: "20% off", is_default: true },
  { id: "o2", name: "Ten off", label: "$10 off", is_default: false },
  { id: "o3", name: "Free strap", label: "No price change", is_default: false },
];
const RESULT = {
  reason: "Changed the offer to Ten off",
  offer: "Ten off",
  price: "$135.00",
  changed: [
    { section: "Hero", before: "Save 20% today", after: "Save $10 today" },
  ],
  leftovers: [],
  invented: [],
  hints: [{ section: "Body", text: "Our summer sale is long gone." }],
  failed_chunks: 0,
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
        if (url.endsWith("/offer") && url.includes("/batch/"))
          return json(
            {
              pages: [
                { build_id: "p1", key: "WRN-1", job_id: "j1", error: null },
                {
                  build_id: "p2",
                  key: "WRN-2",
                  job_id: null,
                  error: "It's still building, or it failed.",
                },
              ],
            },
            202,
          );
        if (url.endsWith("/offer")) return json({ job_id: "j1" }, 202);
        if (url.endsWith("/variants"))
          return json(
            {
              copies: [
                {
                  id: "c1",
                  key: "WRN-5",
                  title: "x",
                  status: "needs_review",
                  job_id: "j2",
                  offer_id: "o2",
                },
              ],
            },
            201,
          );
      }
      if (url.includes("/offers")) return json({ offers: OFFERS });
      if (url.startsWith("/api/jobs/"))
        return json({
          id: "j1",
          kind: "offer_apply",
          status: "succeeded",
          attempts: 1,
          max_attempts: 1,
          result: RESULT,
          error: null,
          created_by: "me",
          created_at: "2026-11-10T10:00:00Z",
          started_at: null,
          finished_at: null,
          events: [],
        });
      return json({}, 404);
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const withQuery = (ui: ReactNode) =>
  render(
    <QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>,
  );

describe("Change offer (B7.3a)", () => {
  it("picks another offer, starts the change and shows what it did", async () => {
    const started = vi.fn();
    withQuery(
      <ChangeOfferDialog
        open
        onOpenChange={() => {}}
        buildId="b1"
        brandId="br1"
        currentOfferId="o1"
        baseVersion={4}
        onStarted={started}
      />,
    );
    const now = await screen.findByRole("radio", { name: /Autumn 20%/ });
    expect(now.getAttribute("aria-checked")).toBe("true");
    expect(now.textContent).toContain("Now");
    const change = screen.getByRole("button", { name: "Change offer" });
    expect(change.hasAttribute("disabled")).toBe(true); // the page's own offer: nothing to change
    fireEvent.click(screen.getByRole("radio", { name: /Ten off/ }));
    fireEvent.click(change);
    await waitFor(() =>
      expect(posts).toEqual([
        {
          url: "/api/builds/b1/offer",
          body: { offer_id: "o2", base_version: 4 },
        },
      ]),
    );
    expect(started).toHaveBeenCalled();
    expect(
      await screen.findByText("Changed the offer to Ten off"),
    ).toBeTruthy();
    const lines = screen.getByRole("list", { name: "Lines changed" });
    expect(within(lines).getByText("Save 20% today")).toBeTruthy();
    expect(within(lines).getByText("Save $10 today")).toBeTruthy();
    expect(
      within(screen.getByRole("list", { name: "Lines to look at" })).getByText(
        "Our summer sale is long gone.",
      ),
    ).toBeTruthy();
  });

  it("can take the offer off the page", async () => {
    withQuery(
      <ChangeOfferDialog
        open
        onOpenChange={() => {}}
        buildId="b1"
        brandId="br1"
        currentOfferId="o1"
        baseVersion={2}
      />,
    );
    fireEvent.click(await screen.findByRole("radio", { name: /No offer/ }));
    fireEvent.click(screen.getByRole("button", { name: "Change offer" }));
    await waitFor(() =>
      expect(posts[0]?.body).toEqual({ offer_id: null, base_version: 2 }),
    );
  });
});

describe("Duplicate with offers (B7.3a)", () => {
  it("offers the brand's other offers and makes a copy for each ticked", async () => {
    withQuery(
      <VariantsDialog
        open
        onOpenChange={() => {}}
        buildId="b1"
        pageKey="WRN-1"
        brandId="br1"
        currentOfferId="o1"
      />,
    );
    const group = await screen.findByRole("group", { name: "Offers" });
    expect(within(group).queryByText("Autumn 20%")).toBeNull(); // the page's own
    fireEvent.click(within(group).getByLabelText(/Ten off/));
    fireEvent.click(within(group).getByLabelText(/Free strap/));
    fireEvent.click(screen.getByRole("button", { name: "Make 2 copies" }));
    await waitFor(() =>
      expect(posts).toEqual([
        { url: "/api/builds/b1/variants", body: { offer_ids: ["o2", "o3"] } },
      ]),
    );
  });
});

describe("Change offer on a batch (B7.3a)", () => {
  const page = {
    template_id: "t",
    template_type: "advertorial",
    job_id: null,
    step: null,
    waiting: null,
    error: null,
    origin: "owned" as const,
    residue_score: null,
    cost_usd: 0,
    created_by: null,
    updated_at: "2026-11-10T10:00:00Z",
    started_at: null,
    finished_at: null,
    status: "needs_review",
  };
  const BATCH: BatchState = {
    batch_id: "bt1",
    brand: "Wrenfield",
    brand_id: "br1",
    product: "Saddle Bag",
    created_at: "2026-11-10T10:00:00Z",
    folder_color: "red",
    pages: [
      {
        ...page,
        id: "p1",
        key: "WRN-1",
        title: "A",
        template_name: "Advertorial",
        parent_id: null,
        copy_number: null,
        offer_id: "o1",
        offer_name: "Autumn 20%",
      },
      {
        ...page,
        id: "p2",
        key: "WRN-2",
        title: "B",
        template_name: "Listicle",
        parent_id: null,
        copy_number: null,
        offer_id: "o1",
        offer_name: "Autumn 20%",
      },
      {
        ...page,
        id: "p3",
        key: "WRN-3",
        title: "C",
        template_name: "Advertorial",
        parent_id: "p1",
        copy_number: 1,
        offer_id: "o2",
        offer_name: "Ten off",
      },
    ],
  };

  it("ticks every page but variants, and shows each page's change", async () => {
    withQuery(
      <BatchOfferDialog
        open
        onOpenChange={() => {}}
        batch={BATCH}
        onChanged={() => {}}
      />,
    );
    await screen.findByRole("radio", { name: /Free strap/ });
    fireEvent.click(screen.getByRole("radio", { name: /Free strap/ }));
    const pages = screen.getByRole("group", { name: "Pages to change" });
    expect(
      (within(pages).getByLabelText(/WRN-3/) as HTMLInputElement).checked,
    ).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Change 2 pages" }));
    await waitFor(() =>
      expect(posts[0]).toEqual({
        url: "/api/builds/batch/bt1/offer",
        body: { offer_id: "o3", build_ids: ["p1", "p2"] },
      }),
    );
    const started = await screen.findByRole("list", { name: "Pages" });
    expect(await within(started).findByText("1 line rewritten")).toBeTruthy();
    expect(
      within(started).getByText("It's still building, or it failed."),
    ).toBeTruthy();
  });
});

describe("copyLabel (B7.3a)", () => {
  it("names the offer only when it isn't the original's", () => {
    expect(copyLabel(2, "Autumn", "Autumn")).toBe("Copy 2");
    expect(copyLabel(2, "Ten off", "Autumn")).toBe("Copy 2 · Ten off");
    expect(copyLabel(3, null, "Autumn")).toBe("Copy 3 · No offer");
  });
});
