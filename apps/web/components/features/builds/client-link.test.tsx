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

import type { DeskState } from "@/lib/validators/desk";
import type { ShareAnswer } from "@/lib/validators/share";

import { ClientLink } from "./client-link";
import { DeskProvider } from "./desk-context";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

const DESK: DeskState = {
  build: {
    id: "b1",
    status: "needs_review",
    page_version: 3,
    approved_at: null,
    approved_by: null,
  },
  fragments: [
    {
      id: "f0001",
      text: "Glow in 7 days",
      section: "hero",
      locked: false,
      edited: false,
      block: 1,
      kind: "Headline",
    },
    {
      id: "f0002",
      text: "$29",
      section: "hero",
      locked: true,
      edited: false,
      block: 2,
      kind: "Text",
    },
    {
      id: "f0003",
      text: "Is it gentle?",
      section: "faq",
      locked: false,
      edited: true,
      block: 3,
      kind: "Question",
    },
  ],
  paragraphs: [
    {
      number: 1,
      kind: "Headline",
      section: "hero",
      text: "Glow in 7 days",
      locked: false,
      locked_parts: [],
      edited: false,
      fragments: ["f0001"],
    },
    {
      number: 2,
      kind: "Text",
      section: "hero",
      text: "$29",
      locked: true,
      locked_parts: ["$29"],
      edited: false,
      fragments: ["f0002"],
    },
    {
      number: 3,
      kind: "Question",
      section: "faq",
      text: "Is it gentle?",
      locked: false,
      locked_parts: [],
      edited: true,
      fragments: ["f0003"],
    },
  ],
  sections: { hero: "Hero", faq: "FAQ" },
  snapshots: [
    {
      seq: 2,
      reason: "Edited a line in faq",
      created_at: new Date().toISOString(),
      created_by: "me",
    },
  ],
  redraft: null,
  layout: [],
  can_redo: false,
  colors: {
    page: {
      primary: "#2f6fde",
      dark: "#1d4ea6",
      tint: "#eaf1fd",
      accent: "#2f6fde",
    },
    brand: {
      primary: "#7a2e8f",
      dark: "#4a1c57",
      tint: "#f4eaf6",
      accent: "#7a2e8f",
    },
  },
};

const APPROVED: DeskState = {
  ...DESK,
  build: {
    ...DESK.build,
    status: "approved",
    approved_at: "2026-11-06T10:00:00Z",
  },
};

const NONE: ShareAnswer = {
  can_share: true,
  approved_version: 3,
  approved_at: "2026-11-06T10:00:00Z",
  page_version: 3,
  changed_since: false,
  link: null,
  url: null,
};

const LIVE: ShareAnswer = {
  ...NONE,
  link: {
    token: "t".repeat(46),
    created_at: "2026-11-06T10:05:00Z",
    expires_at: "2026-12-06T10:05:00Z",
    expired: false,
    views: 3,
    last_viewed_at: "2026-11-06T11:00:00Z",
  },
  url: `https://lp-platform-tan.vercel.app/review/${"t".repeat(46)}`,
};

function respond(...answers: ShareAnswer[]) {
  const fetchMock = vi.fn();
  for (const answer of answers)
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(answer), { status: 200 }),
    );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderLink(initial: DeskState = APPROVED) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <DeskProvider buildId="b1" meId="me" initial={initial} onChange={vi.fn()}>
        <ClientLink />
      </DeskProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ClientLink (B3.6)", () => {
  it("isn't offered for a page that has never been approved", async () => {
    const fetchMock = respond({
      ...NONE,
      can_share: false,
      approved_version: null,
      approved_at: null,
    });
    renderLink(DESK);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: "Client link" })).toBeNull();
  });

  it("makes the link and copies it", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    const fetchMock = respond(NONE, LIVE);
    renderLink();
    fireEvent.click(await screen.findByRole("button", { name: "Client link" }));
    fireEvent.click(await screen.findByRole("button", { name: "Make link" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(LIVE.url));
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/builds/b1/share",
      expect.objectContaining({ method: "POST" }),
    );
    expect(await screen.findByText(/Opened 3 times/)).toBeTruthy();
    expect(screen.getByText(/Expires on 6 Dec/)).toBeTruthy();
  });

  it("says when the page changed since approval, and turns the link off after asking", async () => {
    const fetchMock = respond(
      { ...LIVE, changed_since: true, page_version: 4 },
      NONE,
    );
    renderLink();
    fireEvent.click(await screen.findByRole("button", { name: "Client link" }));
    expect(
      await screen.findByText(/changed since it was approved/),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Turn off link" }));
    fireEvent.click(screen.getByRole("button", { name: "Turn off" }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenLastCalledWith(
        "/api/builds/b1/share",
        expect.objectContaining({ method: "DELETE" }),
      ),
    );
    expect(
      await screen.findByRole("button", { name: "Make link" }),
    ).toBeTruthy();
  });
});
