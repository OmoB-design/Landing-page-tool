// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { QaState } from "@/lib/validators/qa";

import { PreviewCheck } from "./preview-check";

vi.mock("./desk-context", () => ({
  useDesk: () => ({
    buildId: "b1",
    desk: { build: { page_version: 3 } },
    reload: vi.fn(async () => {}),
    undo: vi.fn(),
  }),
}));

const STATE: QaState = {
  version: 2,
  page_version: 2,
  taken_at: new Date().toISOString(),
  desktop: {
    url: "https://store.test/d.jpg?token=x",
    width: 1280,
    height: 2400,
  },
  phone: { url: "https://store.test/p.jpg?token=x", width: 390, height: 5200 },
  share: "https://store.test/public/share.jpg",
  title: "I Found My Forever Sneaker",
  description: "Here's what I learned after years of shoe regrets.",
  running: null,
  phone_check: {
    passed: false,
    issues: [
      {
        kind: "wide",
        title: "Wider than the screen",
        detail: "Runs off the right edge by up to 210 px.",
        count: 1,
        examples: [{ text: "Clara Bennett", section: "Headline and byline" }],
      },
    ],
  },
  fixing: null,
};

function respond(state: QaState | null, posts: string[] = []) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        posts.push("post");
        return new Response(JSON.stringify({ job_id: "j1" }), { status: 200 });
      }
      return new Response(JSON.stringify(state), { status: 200 });
    }),
  );
}

function renderCheck() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <PreviewCheck />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("preview check (B3.3a)", () => {
  it("shows the page at desktop and phone widths and its link preview", async () => {
    const posts: string[] = [];
    respond(STATE, posts);
    renderCheck();
    expect(await screen.findByAltText("The page at 1280 px wide")).toBeTruthy();
    // The desk is on version 3: the screenshots show version 2.
    expect(
      screen.getByText("The page has changed since (version 3)."),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Phone, 1 to fix" }));
    expect(screen.getByAltText("The page at 390 px wide")).toBeTruthy();
    expect(screen.getByText("Phone check: 1 thing to fix")).toBeTruthy();
    expect(
      screen.getByText("“Clara Bennett” in Headline and byline"),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Fix for phone/ }));
    await waitFor(() => expect(posts).toEqual(["post"]));
    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    expect(screen.getByAltText("The page's share image")).toBeTruthy();
    expect(screen.getByText("I Found My Forever Sneaker")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Refresh/ }));
    await waitFor(() => expect(posts).toEqual(["post", "post"]));
  });

  it("offers a first check when there's none yet", async () => {
    respond({
      ...STATE,
      version: null,
      taken_at: null,
      desktop: null,
      phone: null,
      share: null,
    });
    renderCheck();
    expect(
      await screen.findByRole("button", { name: "Run the check" }),
    ).toBeTruthy();
  });
});
