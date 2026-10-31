// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { BudgetMeter, resetsOn } from "./budget-meter";

describe("BudgetMeter", () => {
  it("shows the spend against the budget with a bar and when it resets", () => {
    render(<BudgetMeter spentUsd={12.4} budgetUsd={50} resets="1 Nov" />);
    expect(screen.getByText("$12.40 of $50.00")).toBeTruthy();
    const bar = screen.getByRole("progressbar");
    expect(bar.getAttribute("aria-valuenow")).toBe("12.4");
    expect(screen.getByText("Resets 1 Nov")).toBeTruthy();
  });

  it("says when the budget is reached", () => {
    render(<BudgetMeter spentUsd={52} budgetUsd={50} resets="1 Nov" />);
    expect(screen.getByText(/Budget reached/)).toBeTruthy();
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe(
      "50",
    );
  });

  it("without a budget shows the spend and how to set one", () => {
    render(<BudgetMeter spentUsd={3} budgetUsd={null} resets="1 Nov" />);
    expect(screen.getByText("$3.00 spent")).toBeTruthy();
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(
      screen.getByText(/Set a monthly AI budget in Brand DNA/),
    ).toBeTruthy();
  });

  it("resets on the 1st of next month, in UTC", () => {
    expect(resetsOn(new Date("2026-10-31T23:30:00Z"))).toBe("1 Nov");
    expect(resetsOn(new Date("2026-12-15T12:00:00Z"))).toBe("1 Jan");
  });
});
