// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LibraryTable, type LibraryTableRow } from "./library-table";

const ROW: LibraryTableRow = {
  id: "0b6f1a0e-5d1c-4c7e-9a52-6f3a2d1b9c11",
  key: "LUM-1",
  title: "Calm skin in a week",
  status: "needs_review",
  origin: "owned",
  costUsd: 0.6,
  created: "29 Oct 2026",
  brand: "Lumé",
  template: "Advertorial",
};

function renderTable() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <LibraryTable rows={[ROW]} />
    </QueryClientProvider>,
  );
}

describe("LibraryTable", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("lists the page with its brand, template, status, origin, cost and date", () => {
    renderTable();
    expect(
      screen.getByRole("link", { name: /LUM-1/ }).getAttribute("href"),
    ).toBe(`/pages/${ROW.id}`);
    for (const text of [
      "Lumé",
      "Advertorial",
      "Needs review",
      "Owned",
      "$0.60",
      "29 Oct 2026",
    ])
      expect(screen.getByText(text)).toBeTruthy();
  });

  it("opens a row to its paid calls", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          entries: [
            {
              id: 1,
              created_at: "2026-10-28T10:00:00Z",
              node: "qa",
              kind: "vision",
              provider: "anthropic",
              model: "claude-haiku-5-5",
              input_tokens: 9100,
              output_tokens: 300,
              units: null,
              cost_usd: 0.05,
            },
            {
              id: 2,
              created_at: "2026-10-28T10:01:00Z",
              node: "image_pass",
              kind: "image",
              provider: "fal",
              model: "fal-ai/flux",
              input_tokens: null,
              output_tokens: null,
              units: 6,
              cost_usd: 0.24,
            },
          ],
        }),
      ),
    );
    renderTable();
    const toggle = screen.getByRole("button", { name: "Show what LUM-1 cost" });
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(await screen.findByText("QA")).toBeTruthy();
    expect(screen.getByText("Image pass")).toBeTruthy();
    expect(screen.getByText("9,100 in · 300 out")).toBeTruthy();
    expect(screen.getByText("6 images")).toBeTruthy();
    expect(screen.getByText("$0.24")).toBeTruthy();
  });
});
