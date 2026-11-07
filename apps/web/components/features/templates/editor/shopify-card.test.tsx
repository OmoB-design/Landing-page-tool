// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render as renderDom,
  screen,
  waitFor,
} from "@testing-library/react";
import { type ReactElement, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { LayoutCheck, ShopifyMap } from "@/lib/validators/template";

import { ShopifyCard } from "./shopify-card";

const actions = vi.hoisted(() => ({
  startLayoutCheck: vi.fn(async () => ({ jobId: "job-1" })),
  reloadTemplate: vi.fn(async () => ({})),
}));
vi.mock("@/lib/templates/actions", () => actions);

function render(ui: ReactElement) {
  return renderDom(
    <QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>,
  );
}

const CHECKED: LayoutCheck = {
  version: 3,
  checked_at: "2026-11-06T22:00:00Z",
  matched: true,
  mode: "grouped",
  sections: 5,
  kept_together: ["The problem", "The discovery", "Product card", "Questions"],
  widths: { desktop: true, tablet: true, phone: true },
  differences: [],
};

const MAP: ShopifyMap = {
  sections: [
    {
      key: "hero",
      name: "Headline and byline",
      texts: 4,
      images: 2,
      media: 0,
      loose: false,
    },
    {
      key: "faq",
      name: "Questions",
      texts: 6,
      images: 0,
      media: 1,
      loose: false,
    },
    {
      key: "loose-1",
      name: "After Questions",
      texts: 1,
      images: 0,
      media: 0,
      loose: true,
    },
  ],
  texts: 11,
  images: 2,
  media: 1,
  static: 1,
  unclear: 0,
  issues: [
    {
      level: "info",
      message:
        "1 text outside the marked sections gets a Shopify section of its own, “After Questions”.",
    },
  ],
  ready: true,
  layout: null,
  layout_stale: false,
};

afterEach(cleanup);

describe("ShopifyCard (B4.1)", () => {
  it("sums up what becomes editable, section by section", () => {
    render(<ShopifyCard map={MAP} />);
    expect(
      screen.getByText(/3 sections · 11 texts · 2 pictures · 1 video editable/),
    ).toBeTruthy();
    expect(screen.getByText(/1 can’t be edited in Shopify/)).toBeTruthy();
    expect(screen.getByText(/They still show on the page/)).toBeTruthy();
    expect(screen.getByText("4 texts · 2 pictures")).toBeTruthy();
    expect(screen.getByText("6 texts · 1 video")).toBeTruthy();
    expect(screen.getByText("Added")).toBeTruthy();
    expect(screen.getByText("Note:")).toBeTruthy();
  });

  it("says when pages can't go to Shopify as editable sections yet", () => {
    render(
      <ShopifyCard
        map={{
          ...MAP,
          sections: [],
          texts: 0,
          images: 0,
          media: 0,
          static: 0,
          ready: false,
          issues: [
            {
              level: "error",
              message: "No sections are marked on the page yet.",
            },
          ],
        }}
      />,
    );
    expect(
      screen.getByText(/can’t go to Shopify as editable sections yet/),
    ).toBeTruthy();
    expect(screen.getByText("Problem:")).toBeTruthy();
    expect(screen.queryByText(/can’t be edited in Shopify/)).toBeNull();
  });

  it("offers the layout check before one has run (B4.3)", async () => {
    render(<ShopifyCard map={MAP} templateId="t-1" />);
    expect(screen.getByText("Layout not checked yet")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Check layout" }));
    await waitFor(() =>
      expect(actions.startLayoutCheck).toHaveBeenCalledWith("t-1"),
    );
  });

  it("sums up a matching check, with what was kept together", () => {
    render(<ShopifyCard map={{ ...MAP, layout: CHECKED }} templateId="t-1" />);
    expect(
      screen.getByText("The layout matches at desktop, tablet and phone"),
    ).toBeTruthy();
    expect(
      screen.getByText(
        /5 Shopify sections; parts side by side or sticky are kept together in one: The problem, The discovery, Product card and 1 more\./,
      ),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Check again" })).toBeTruthy();
  });

  it("says where the layout differs, and when the page changed since", () => {
    render(
      <ShopifyCard
        map={{
          ...MAP,
          layout: {
            ...CHECKED,
            matched: false,
            mode: "coarse",
            widths: { desktop: true, tablet: true, phone: false },
            differences: ["“Product card” sits 40 px lower at phone."],
          },
          layout_stale: true,
        }}
      />,
    );
    expect(
      screen.getByText("The layout differs in Shopify at phone"),
    ).toBeTruthy();
    expect(screen.getByText(/sits 40 px lower at phone/)).toBeTruthy();
    expect(
      screen.getByText(/changed since this check \(version 3\)/),
    ).toBeTruthy();
    // Without the template (a read-only view) there's no button.
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("keeps a layout check under way across a tab switch (B5.4)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              id: "job-1",
              kind: "shopify_layout_check",
              status: "running",
              attempts: 1,
              max_attempts: 1,
              result: null,
              error: null,
              created_by: "me",
              created_at: "2026-11-07T10:00:00Z",
              started_at: "2026-11-07T10:00:01Z",
              finished_at: null,
              events: [],
            }),
            { status: 200 },
          ),
      ),
    );
    // The editor holds the check; the card goes away with its tab and comes back.
    function Editor() {
      const [tab, setTab] = useState<"details" | "content">("details");
      const [job, setJob] = useState<string | null>(null);
      return (
        <>
          <button type="button" onClick={() => setTab("content")}>
            Content
          </button>
          <button type="button" onClick={() => setTab("details")}>
            Details
          </button>
          {tab === "details" ? (
            <ShopifyCard
              map={MAP}
              templateId="t-1"
              layoutJobId={job}
              onLayoutJob={setJob}
            />
          ) : null}
        </>
      );
    }
    render(<Editor />);
    fireEvent.click(screen.getByRole("button", { name: "Check layout" }));
    expect(await screen.findByText("Checking the layout…")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Content" }));
    expect(screen.queryByText("Checking the layout…")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Details" }));
    expect(screen.getByText("Checking the layout…")).toBeTruthy();
    vi.unstubAllGlobals();
  });
});
