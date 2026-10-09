// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { BrandForm } from "@/components/features/brands/brand-form";
import { EMPTY_BRAND_FORM } from "@/lib/brands/form";

vi.mock("@/lib/brands/actions", () => ({}));

describe("BrandForm", () => {
  it("checks required fields in the browser before saving", async () => {
    const onSubmit = vi.fn();
    render(
      <BrandForm
        defaultValues={EMPTY_BRAND_FORM}
        submitLabel="Save brand"
        onSubmit={onSubmit}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Save brand" }));
    expect(await screen.findByText("Enter the brand name.")).toBeTruthy();
    expect(
      screen.getByText("Use 2 to 4 capital letters, e.g. LUM."),
    ).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("derives the dark shade and tint from a new primary colour", () => {
    render(
      <BrandForm
        defaultValues={EMPTY_BRAND_FORM}
        submitLabel="Save"
        onSubmit={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText("Primary colour"), {
      target: { value: "#e4572e" },
    });
    expect(
      (screen.getByLabelText("Dark shade") as HTMLInputElement).value,
    ).toBe("#922f13");
    expect((screen.getByLabelText("Tint") as HTMLInputElement).value).toBe(
      "#f8efed",
    );
  });

  it("shows a server-side error on its field", async () => {
    const onSubmit = vi.fn(async () => ({
      fieldErrors: {
        prefix: ["Another brand already uses LUM. Pick other letters."],
      },
    }));
    render(
      <BrandForm
        defaultValues={{ ...EMPTY_BRAND_FORM, name: "Lumé", prefix: "LUM" }}
        submitLabel="Save"
        onSubmit={onSubmit}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(
      await screen.findByText(
        "Another brand already uses LUM. Pick other letters.",
      ),
    ).toBeTruthy();
  });
});
