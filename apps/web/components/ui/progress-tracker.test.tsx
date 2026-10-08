// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ProgressTracker } from "@/components/ui/progress-tracker";

// Covers the LP read-only mode added to the vendored AffectUI component.
describe("ProgressTracker (read-only)", () => {
  const steps = [
    {
      id: "brand",
      label: "Create your first brand",
      done: true,
      href: "/brands",
    },
    { id: "product", label: "Add a product", done: false, href: "/brands" },
    { id: "publish", label: "Publish a page", done: false },
  ];

  it("shows progress from the given state and links each step", () => {
    render(<ProgressTracker title="Getting started" readOnly steps={steps} />);
    expect(
      screen.getByRole("heading", { level: 2, name: "Getting started" }),
    ).toBeTruthy();
    const bar = screen.getByRole("progressbar", { name: "Getting started" });
    expect(bar.getAttribute("aria-valuenow")).toBe("1");
    expect(bar.getAttribute("aria-valuetext")).toBe("1 of 3 done");

    const done = screen.getByRole("link", {
      name: "Done: Create your first brand",
    });
    expect(done.getAttribute("href")).toBe("/brands");
    expect(done.hasAttribute("data-checked")).toBe(true);
    expect(
      screen.getByRole("link", { name: "To do: Add a product" }),
    ).toBeTruthy();
    // A step without a link is plain text, and nothing can be ticked by hand.
    expect(screen.getByText("Publish a page").closest("a")).toBeNull();
    expect(screen.queryAllByRole("checkbox")).toEqual([]);
  });
});
