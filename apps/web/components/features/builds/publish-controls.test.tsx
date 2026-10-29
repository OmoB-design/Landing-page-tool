// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { DeskState } from "@/lib/validators/desk";
import type { PublishingState } from "@/lib/validators/publishing";

import { DeskProvider } from "./desk-context";
import { PublishProvider } from "./publish-context";
import { LiveButton, PublishButton, PublishedModal } from "./publish-controls";
import { StatusActions } from "./status-actions";

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
  shopify_domain: null,
  shopify_draft: null,
};

const LIVE = {
  id: "p1",
  destination: "vercel",
  action: "publish" as const,
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
  onUnpublish = vi.fn(),
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
          onUnpublish={onUnpublish}
          page={{
            brandId: "brand-1",
            key: "LUM-1",
            title: "Calm skin",
            brand: "Lumé",
            product: "Serum",
            template: "Advertorial",
          }}
        >
          <StatusActions fixCount={0} />
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
    expect(onPublish).toHaveBeenCalledWith(true, "vercel");
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

  it("opens the published modal from Live with where it's published", () => {
    renderPublish(
      { ...BASE, status: "published", live: LIVE, publications: [LIVE] },
      vi.fn(),
      "published",
    );
    fireEvent.click(screen.getByRole("button", { name: "Live" }));
    expect(screen.getByText("Your page is live")).toBeTruthy();
    expect(
      screen.getByText("LUM-1 · Calm skin · Lumé · Serum · Advertorial"),
    ).toBeTruthy();
    expect(screen.getByText("Live · lp-lum")).toBeTruthy();
    expect(screen.getByTitle("The live page").getAttribute("src")).toBe(
      LIVE.url,
    );
    fireEvent.click(screen.getByRole("button", { name: "Phone" }));
    expect(screen.getByTitle("The live page").className).toContain("w-97.5");
    expect(screen.getByText("Not connected")).toBeTruthy();
  });

  it("connects Shopify from the modal, for this page's brand", () => {
    renderPublish(
      { ...BASE, status: "published", live: LIVE, publications: [LIVE] },
      vi.fn(),
      "published",
    );
    fireEvent.click(screen.getByRole("button", { name: "Live" }));
    fireEvent.click(screen.getByRole("button", { name: "Connect Shopify" }));
    expect(screen.getByText("Connect Lumé’s Shopify store")).toBeTruthy();
    expect(screen.getByLabelText("Client secret")).toBeTruthy();
  });

  it("sends the page to Shopify, asking first when there are reasons", () => {
    const onPublish = vi.fn();
    const live = {
      ...BASE,
      status: "published",
      live: LIVE,
      publications: [LIVE],
      shopify_domain: "lume.myshopify.com",
    };
    renderPublish(live, onPublish, "published");
    fireEvent.click(screen.getByRole("button", { name: "Live" }));
    fireEvent.click(screen.getByRole("button", { name: "Publish to Shopify" }));
    expect(onPublish).toHaveBeenCalledWith(false, "shopify_page");
    cleanup();

    const gated = vi.fn();
    renderPublish(
      {
        ...live,
        gate: [
          {
            code: "claims",
            message: "1 claim is marked Fix in the claim check.",
            overridable: true,
          },
        ],
      },
      gated,
      "published",
    );
    fireEvent.click(screen.getByRole("button", { name: "Live" }));
    fireEvent.click(screen.getByRole("button", { name: "Publish to Shopify" }));
    expect(gated).not.toHaveBeenCalled();
    expect(
      screen.getByText("1 claim is marked Fix in the claim check."),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Send anyway" }));
    expect(gated).toHaveBeenCalledWith(true, "shopify_page");
  });

  it("shows a Shopify draft with Open in admin and Update draft", () => {
    const draft = {
      ...LIVE,
      id: "p2",
      destination: "shopify_page",
      url: "https://lume.myshopify.com/pages/lum-1",
      admin_url: "https://admin.shopify.com/store/lume/pages/77",
      project: null,
      full_width: true,
    };
    renderPublish(
      {
        ...BASE,
        status: "published",
        live: LIVE,
        publications: [draft, LIVE],
        shopify_domain: "lume.myshopify.com",
        shopify_draft: draft,
      },
      vi.fn(),
      "published",
    );
    fireEvent.click(screen.getByRole("button", { name: "Live" }));
    expect(screen.getByText("Draft · lum-1")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Open in admin" }).getAttribute("href"),
    ).toBe(draft.admin_url);
    expect(screen.getByRole("button", { name: "Update draft" })).toBeTruthy();
    expect(
      screen.queryByRole("button", {
        name: "Set up full width for an exact fit",
      }),
    ).toBeNull();
  });

  it("offers the full-width setup when the draft uses the theme's layout", () => {
    const draft = {
      ...LIVE,
      id: "p2",
      destination: "shopify_page",
      url: "https://lume.myshopify.com/pages/lum-1",
      admin_url: "https://admin.shopify.com/store/lume/pages/77",
      project: null,
      full_width: false,
    };
    renderPublish(
      {
        ...BASE,
        status: "published",
        live: LIVE,
        publications: [draft, LIVE],
        shopify_domain: "lume.myshopify.com",
        shopify_draft: draft,
      },
      vi.fn(),
      "published",
    );
    fireEvent.click(screen.getByRole("button", { name: "Live" }));
    expect(screen.getByText(/Fitted into the theme’s page/)).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Set up full width for an exact fit",
      }),
    );
    expect(screen.getByText("Show pages full width")).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "Online Store → Themes" })
        .getAttribute("href"),
    ).toBe("https://lume.myshopify.com/admin/themes");
  });

  it("unpublishes only after asking", () => {
    const onUnpublish = vi.fn();
    renderPublish(
      { ...BASE, status: "published", live: LIVE, publications: [LIVE] },
      vi.fn(),
      "published",
      onUnpublish,
    );
    fireEvent.click(screen.getByRole("button", { name: "Live" }));
    fireEvent.click(screen.getByRole("button", { name: "Unpublish" }));
    expect(screen.getByText(/Take LUM-1 down from/)).toBeTruthy();
    expect(onUnpublish).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Keep it live" }));
    expect(screen.queryByText(/Take LUM-1 down from/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Unpublish" }));
    fireEvent.click(
      screen.getAllByRole("button", { name: "Unpublish" }).at(-1)!,
    );
    expect(onUnpublish).toHaveBeenCalledOnce();
  });

  it("removes the Shopify draft only after asking", () => {
    const draft = {
      ...LIVE,
      id: "p2",
      destination: "shopify_page",
      url: "https://lume.myshopify.com/pages/lum-1",
      admin_url: "https://admin.shopify.com/store/lume/pages/77",
      project: null,
      full_width: true,
    };
    const onUnpublish = vi.fn();
    renderPublish(
      {
        ...BASE,
        status: "published",
        live: LIVE,
        publications: [draft, LIVE],
        shopify_domain: "lume.myshopify.com",
        shopify_draft: draft,
      },
      vi.fn(),
      "published",
      onUnpublish,
    );
    fireEvent.click(screen.getByRole("button", { name: "Live" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove draft" }));
    expect(
      screen.getByText("Remove LUM-1’s draft from lume.myshopify.com?"),
    ).toBeTruthy();
    expect(onUnpublish).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Keep it" }));
    expect(screen.queryByText(/draft from lume/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Remove draft" }));
    fireEvent.click(
      screen.getAllByRole("button", { name: "Remove draft" }).at(-1)!,
    );
    expect(onUnpublish).toHaveBeenCalledWith("shopify_page");
  });

  it("shows Live, with its pulsing dot, instead of the Published chip", () => {
    renderPublish(
      { ...BASE, status: "published", live: LIVE, publications: [LIVE] },
      vi.fn(),
      "published",
    );
    expect(screen.queryByText("Published")).toBeNull();
    const live = screen.getByRole("button", { name: "Live" });
    expect(
      live.querySelector(".motion-safe\\:animate-live-pulse"),
    ).toBeTruthy();
  });

  it("keeps the status chip while the page isn't live", () => {
    renderPublish(BASE);
    expect(screen.getByText("Approved")).toBeTruthy();
  });
});
