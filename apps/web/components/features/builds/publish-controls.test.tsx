// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { DeskState } from "@/lib/validators/desk";
import type { PublishingState } from "@/lib/validators/publishing";

import { DeskProvider } from "./desk-context";
import { PublishProvider } from "./publish-context";
import { LiveButton, PublishButton, PublishedModal } from "./publish-controls";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

const DESK: DeskState = {
  build: {
    id: "b1",
    status: "approved",
    page_version: 3,
    approved_at: null,
    approved_by: null,
  },
  fragments: [],
  paragraphs: [],
  sections: {},
  snapshots: [],
  redraft: null,
  colors: { page: null, brand: null },
};

const BASE: PublishingState = {
  build_id: "b1",
  status: "approved",
  page_version: 3,
  gate: [],
  vercel_connected: true,
  live: null,
  running: null,
  job_id: null,
  publications: [],
};

const LIVE = {
  id: "p1",
  destination: "vercel",
  status: "succeeded" as const,
  url: "https://lp-lum.vercel.app/lum-1",
  created_at: "2026-10-25T09:00:00.000Z",
  created_by: "me",
  gate_overridden: false,
  override_reasons: [],
  error: null,
  page_version: 3,
  project: "lp-lum",
  seconds: 12,
};

function renderPublish(
  publishing: PublishingState,
  onPublish = vi.fn(),
  status = "approved",
) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <DeskProvider
        buildId="b1"
        meId="me"
        initial={{ ...DESK, build: { ...DESK.build, status } }}
        onChange={vi.fn()}
      >
        <PublishProvider
          buildId="b1"
          initial={publishing}
          onPublish={onPublish}
          page={{
            key: "LUM-1",
            title: "Calm skin",
            brand: "Lumé",
            product: "Serum",
            template: "Advertorial",
          }}
        >
          <PublishButton />
          <LiveButton />
          <PublishedModal />
        </PublishProvider>
      </DeskProvider>
    </QueryClientProvider>,
  );
  return onPublish;
}

afterEach(cleanup);

describe("Publish", () => {
  it("passes the gate's reasons only after Publish anyway", () => {
    const onPublish = renderPublish({
      ...BASE,
      gate: [
        {
          code: "claims",
          message: "1 claim is marked Fix in the claim check.",
          overridable: true,
        },
      ],
    });
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    const publish = screen.getAllByRole("button", { name: "Publish" }).at(-1)!;
    expect((publish as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByLabelText(/Publish anyway/));
    fireEvent.click(publish);
    expect(onPublish).toHaveBeenCalledWith(true);
  });

  it("can't pass placeholder images without the testing switch", () => {
    renderPublish({
      ...BASE,
      gate: [
        {
          code: "placeholder_images",
          message: "The page still has placeholder images.",
          overridable: false,
        },
      ],
    });
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    expect(screen.queryByLabelText(/Publish anyway/)).toBeNull();
    const publish = screen.getAllByRole("button", { name: "Publish" }).at(-1)!;
    expect((publish as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows nothing to publish until the page is approved", () => {
    renderPublish(BASE, vi.fn(), "needs_review");
    expect(screen.queryByRole("button", { name: "Publish" })).toBeNull();
  });

  it("opens the published modal from Live with the page's details", () => {
    renderPublish(
      { ...BASE, status: "published", live: LIVE, publications: [LIVE] },
      vi.fn(),
      "published",
    );
    fireEvent.click(screen.getByRole("button", { name: "Live" }));
    expect(screen.getByText("Your page is live")).toBeTruthy();
    expect(screen.getByText("LUM-1 · Calm skin")).toBeTruthy();
    expect(screen.getByText("lp-lum")).toBeTruthy();
    expect(screen.getByTitle("The live page").getAttribute("src")).toBe(
      LIVE.url,
    );
    expect(
      (
        screen.getByRole("button", {
          name: "Publish to Shopify",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });
});
