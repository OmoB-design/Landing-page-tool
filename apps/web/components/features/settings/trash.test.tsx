// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TrashSettings } from "@/components/features/settings/trash";
import type { TrashState } from "@/lib/validators/trash";

const restoreItem = vi.fn();
const deleteItemForGood = vi.fn();
vi.mock("@/lib/trash/actions", () => ({
  restoreItem: (...args: unknown[]) => restoreItem(...args) as unknown,
  deleteItemForGood: (...args: unknown[]) =>
    deleteItemForGood(...args) as unknown,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const page = {
  kind: "page" as const,
  id: "0b6f1a0e-5d1c-4c7e-9a52-6f3a2d1b9c11",
  name: "LUM-12 · Calm skin in a week",
  detail: "Lumé",
  deleted_at: "2026-10-28T10:00:00Z",
  deleted_by: "Ada Lovelace",
  expires_at: "2026-11-04T10:00:00Z",
};
const brand = {
  ...page,
  kind: "brand" as const,
  id: "6a1c3e2b-0d4f-4b8a-8e7c-2f9d1a3b5c77",
  name: "Bré",
  detail: "With 3 pages and 2 products",
  deleted_by: null,
};

function state(canDelete: boolean): TrashState {
  return { items: [page, brand], can_permanently_delete: canDelete };
}

describe("TrashSettings", () => {
  beforeEach(() => {
    restoreItem.mockReset();
    deleteItemForGood.mockReset();
  });

  it("lists what was deleted with its type, who and when, and the owner's actions", () => {
    render(<TrashSettings initial={state(true)} />);
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows).toHaveLength(2);
    expect(
      within(rows[0]!).getByText("LUM-12 · Calm skin in a week"),
    ).toBeTruthy();
    expect(within(rows[0]!).getByText(/Lumé/)).toBeTruthy();
    expect(within(rows[0]!).getByText("Page")).toBeTruthy();
    expect(within(rows[0]!).getByText("Ada Lovelace")).toBeTruthy();
    expect(within(rows[1]!).getByText("A workspace member")).toBeTruthy();
    expect(
      within(rows[1]!).getByText(/With 3 pages and 2 products/),
    ).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Restore" })).toHaveLength(2);
    expect(
      screen.getAllByRole("button", { name: "Permanently delete" }),
    ).toHaveLength(2);
  });

  it("lets a member restore but not delete for good", () => {
    render(<TrashSettings initial={state(false)} />);
    expect(screen.getAllByRole("button", { name: "Restore" })).toHaveLength(2);
    expect(
      screen.queryByRole("button", { name: "Permanently delete" }),
    ).toBeNull();
  });

  it("asks before deleting for good, then deletes and updates the list", async () => {
    deleteItemForGood.mockResolvedValue({
      ok: true,
      state: { items: [brand], can_permanently_delete: true },
    });
    render(<TrashSettings initial={state(true)} />);
    fireEvent.click(
      screen.getAllByRole("button", { name: "Permanently delete" })[0]!,
    );
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText(
        "Permanently delete LUM-12 · Calm skin in a week?",
      ),
    ).toBeTruthy();
    expect(within(dialog).getByText(/This cannot be undone/)).toBeTruthy();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Permanently delete" }),
    );
    await vi.waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(2));
    expect(deleteItemForGood).toHaveBeenCalledWith("page", page.id);
  });

  it("shows the empty, loading and failed states", () => {
    const { rerender } = render(
      <TrashSettings initial={{ items: [], can_permanently_delete: true }} />,
    );
    expect(screen.getByText("Trash is empty")).toBeTruthy();
    rerender(<TrashSettings key="loading" loading />);
    expect(screen.getByText("Loading Trash…")).toBeTruthy();
    rerender(<TrashSettings key="failed" initial={null} />);
    expect(
      screen.getByText("We couldn’t load Trash. Refresh and try again."),
    ).toBeTruthy();
  });
});
