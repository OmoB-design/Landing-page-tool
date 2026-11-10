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

import { toast } from "@/components/app/toaster";

import { DeskProvider } from "./desk-context";
import { PageMenu } from "./page-menu";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock("@/lib/trash/actions", () => ({
  trashItem: vi.fn(async () => ({ ok: true })),
  restoreItem: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/components/app/toaster", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
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
  layout: [],
  can_redo: false,
  colors: { page: null, brand: null },
};

function renderMenu({
  status,
  ready = true,
  onChange = vi.fn(),
}: {
  status?: string;
  ready?: boolean;
  onChange?: () => void;
}) {
  const menu = <PageMenu buildId="b1" buildKey="LUM-1" ready={ready} />;
  render(
    <QueryClientProvider client={new QueryClient()}>
      {status ? (
        <DeskProvider
          buildId="b1"
          meId="me"
          initial={{ ...DESK, build: { ...DESK.build, status } }}
          onChange={onChange}
        >
          {menu}
        </DeskProvider>
      ) : (
        menu
      )}
    </QueryClientProvider>,
  );
  // Radix opens its menu on pointer down (left button) or the keyboard.
  fireEvent.pointerDown(screen.getByRole("button", { name: "More" }), {
    button: 0,
    ctrlKey: false,
  });
}

const items = () =>
  screen.getAllByRole("menuitem").map((item) => item.textContent);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("The build page's ⋯ (D141)", () => {
  it("has Back to review once the page is approved, then Duplicate, Export, Copy key, Move to Trash", async () => {
    const onChange = vi.fn();
    renderMenu({ status: "approved", onChange });
    expect(items()).toEqual([
      "Back to review",
      "Duplicate",
      "Export",
      "Copy key",
      "Move to Trash",
    ]);
    fireEvent.click(screen.getByRole("menuitem", { name: "Back to review" }));
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith("status", {
        base_version: 3,
        status: "needs_review",
      }),
    );
  });

  it("has no Back to review while the page needs review, or without the desk", () => {
    renderMenu({ status: "needs_review" });
    expect(items()).toEqual([
      "Duplicate",
      "Export",
      "Copy key",
      "Move to Trash",
    ]);
    cleanup();
    renderMenu({});
    expect(items()).toEqual([
      "Duplicate",
      "Export",
      "Copy key",
      "Move to Trash",
    ]);
  });

  it("can't export or duplicate before the page is built", () => {
    renderMenu({ ready: false });
    for (const name of ["Export", "Duplicate"])
      expect(
        screen.getByRole("menuitem", { name }).hasAttribute("data-disabled"),
      ).toBe(true);
  });

  it("duplicates the page and offers to open the copy (B7.1)", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            id: "b9",
            key: "LUM-9",
            status: "needs_review",
            title: "Page · Copy 1",
          }),
          { status: 201 },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);
    renderMenu({});
    fireEvent.click(screen.getByRole("menuitem", { name: "Duplicate" }));
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        "LUM-9 made",
        expect.objectContaining({
          description: "Page · Copy 1",
          action: expect.objectContaining({ label: "Open" }),
        }),
      ),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/builds/b1/duplicate",
      expect.objectContaining({ method: "POST" }),
    );
    vi.unstubAllGlobals();
  });

  it("copies the page's key", async () => {
    const writeText = vi.fn(async () => {});
    Object.assign(navigator, { clipboard: { writeText } });
    renderMenu({});
    fireEvent.click(screen.getByRole("menuitem", { name: "Copy key" }));
    expect(writeText).toHaveBeenCalledWith("LUM-1");
  });

  it("asks before moving the page to Trash", () => {
    renderMenu({});
    fireEvent.click(screen.getByRole("menuitem", { name: "Move to Trash" }));
    expect(screen.getByText("Move LUM-1 to Trash?")).toBeTruthy();
  });
});
