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
import { afterEach, describe, expect, it, vi } from "vitest";

import { archiveOffer, createOffer, updateOffer } from "@/lib/offers/actions";
import type { OfferRow } from "@/lib/offers/form";

import { OffersView } from "./offers-view";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/components/app/toaster", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/offers/actions", () => ({
  createOffer: vi.fn(async () => ({ ok: true, id: "new", isDefault: true })),
  updateOffer: vi.fn(async () => ({ ok: true, id: "o1" })),
  makeDefaultOffer: vi.fn(async () => ({ ok: true })),
  archiveOffer: vi.fn(async () => ({ ok: true })),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const OFFER: OfferRow = {
  id: "o1",
  name: "Autumn 20%",
  price_change: "percent",
  price_value: 20,
  checkout: "code",
  code: "AUTUMN20",
  promo_text: "Autumn edit: 20% off this week",
  details: null,
  is_default: true,
  pages: 3,
  outOfDate: 0,
  updating: 0,
};

const view = (offers: OfferRow[]) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <OffersView
        brandId="b1"
        brandName="Wrenfield"
        offers={offers}
        currency="USD"
      />
    </QueryClientProvider>,
  );

describe("The Offers tab (B7.2a)", () => {
  it("lists each offer with its default tag, price change, code and pages", () => {
    view([
      OFFER,
      {
        ...OFFER,
        id: "o2",
        name: "Free strap",
        price_change: "none",
        price_value: null,
        checkout: "none",
        code: null,
        is_default: false,
        pages: 1,
      },
    ]);
    expect(screen.getByText("2 offers")).toBeTruthy();
    const first = screen.getByRole("button", { name: "Edit Autumn 20%" });
    expect(first.textContent).toContain("Default");
    expect(first.textContent).toContain("Code AUTUMN20");
    expect(first.textContent).toContain("20% off");
    expect(first.textContent).toContain("3 pages");
    const second = screen.getByRole("button", { name: "Edit Free strap" });
    expect(second.textContent).toContain("No price change");
    expect(second.textContent).not.toContain("Default");
  });

  it("offers New offer when there are none, and the first is the default", async () => {
    view([]);
    expect(screen.getByRole("heading", { name: "No offers yet" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "New offer" }));
    const form = screen.getByRole("form", { name: "New offer" });
    expect(within(form).getByRole("switch").getAttribute("aria-checked")).toBe(
      "true",
    );
    // Nothing saved without a name.
    fireEvent.click(within(form).getByRole("button", { name: "Create offer" }));
    expect(
      await within(form).findByText("Give the offer a name."),
    ).toBeTruthy();
    expect(createOffer).not.toHaveBeenCalled();
    fireEvent.change(within(form).getByLabelText("Name"), {
      target: { value: "Free strap" },
    });
    fireEvent.change(within(form).getByLabelText("Promo line"), {
      target: { value: "A free strap this week" },
    });
    fireEvent.click(within(form).getByRole("button", { name: "Create offer" }));
    await waitFor(() =>
      expect(createOffer).toHaveBeenCalledWith(
        "b1",
        expect.objectContaining({
          name: "Free strap",
          promo_text: "A free strap this week",
          is_default: true,
        }),
      ),
    );
  });

  it("knows the first offer became the default before the list catches up", async () => {
    view([]);
    fireEvent.click(screen.getByRole("button", { name: "New offer" }));
    let form = screen.getByRole("form", { name: "New offer" });
    fireEvent.change(within(form).getByLabelText("Name"), {
      target: { value: "Autumn" },
    });
    fireEvent.click(within(form).getByRole("button", { name: "Create offer" }));
    await waitFor(() => expect(createOffer).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.queryByRole("form", { name: "New offer" })).toBeNull(),
    );
    // The list hasn't refreshed (the same props), yet the next offer isn't the default.
    fireEvent.click(screen.getByRole("button", { name: "New offer" }));
    form = screen.getByRole("form", { name: "New offer" });
    expect(within(form).getByRole("switch").getAttribute("aria-checked")).toBe(
      "false",
    );
  });

  it("edits an offer from its row with its values filled in", async () => {
    view([OFFER]);
    fireEvent.click(screen.getByRole("button", { name: "Edit Autumn 20%" }));
    const form = screen.getByRole("form", { name: "Edit offer" });
    expect(
      (within(form).getByLabelText("Name") as HTMLInputElement).value,
    ).toBe("Autumn 20%");
    expect(
      (within(form).getByLabelText("Percent off") as HTMLInputElement).value,
    ).toBe("20");
    expect(
      (within(form).getByLabelText("Discount code") as HTMLInputElement).value,
    ).toBe("AUTUMN20");
    fireEvent.change(within(form).getByLabelText("Percent off"), {
      target: { value: "25" },
    });
    fireEvent.click(within(form).getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(updateOffer).toHaveBeenCalledWith(
        "o1",
        expect.objectContaining({ price_value: "25" }),
      ),
    );
  });

  it("asks before archiving", async () => {
    view([OFFER]);
    fireEvent.pointerDown(
      screen.getByRole("button", { name: "Actions for Autumn 20%" }),
      { button: 0, ctrlKey: false },
    );
    expect(
      screen.getAllByRole("menuitem").map((item) => item.textContent),
    ).toEqual(["Edit", "Update pages…", "Archive"]);
    fireEvent.click(screen.getByRole("menuitem", { name: "Archive" }));
    expect(screen.getByText("Archive Autumn 20%?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Archive" }));
    await waitFor(() => expect(archiveOffer).toHaveBeenCalledWith("o1"));
  });

  it("says how many pages are out of date, and after an edit offers to update them (B7.4)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ offer_id: "o1", name: "Autumn 20%", pages: [] }),
          ),
      ),
    );
    vi.mocked(updateOffer).mockResolvedValueOnce({
      ok: true,
      id: "o1",
      outOfDate: 2,
    });
    view([
      { ...OFFER, outOfDate: 2 },
      { ...OFFER, id: "o2", name: "Ten off", is_default: false, updating: 1 },
    ]);
    expect(screen.getByText("· 2 out of date", { exact: false })).toBeTruthy();
    expect(screen.getByText("Updating 1 page…")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Edit Autumn 20%" }));
    const form = screen.getByRole("form", { name: "Edit offer" });
    fireEvent.click(within(form).getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Pages using Autumn 20%")).toBeTruthy();
    vi.unstubAllGlobals();
  });
});
