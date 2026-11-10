// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { buildReportSchema } from "@/lib/validators/build";

import { BuildReport } from "./build-report";

afterEach(cleanup);

const report = (extra: Record<string, unknown> = {}) =>
  buildReportSchema.parse({
    mode: "owned",
    template: { name: "Advertorial", slug: "advertorial" },
    cost: { total_usd: 0.18 },
    ...extra,
  });

/** The value beside a fact's label in Details. */
const fact = (label: string) =>
  screen
    .getByText(`${label}:`)
    .parentElement?.textContent?.replace(`${label}:`, "");

describe("BuildReport's Details", () => {
  it("shows the build's cost for a page built here", () => {
    render(<BuildReport report={report()} costUsd={0.42} />);
    expect(fact("Cost")).toBe("$0.18");
    expect(screen.queryByText("Copied from:")).toBeNull();
  });

  it("shows a copy's own cost and where it came from (B7.1a)", () => {
    render(
      <BuildReport
        report={report({ copied_from: { id: "b1", key: "WRN-1", version: 3 } })}
        costUsd={0}
      />,
    );
    expect(fact("Cost")).toBe("$0.00");
    expect(fact("Copied from")).toBe("WRN-1");
  });

  it("names the offer the page sells, or None (B7.2b)", () => {
    render(<BuildReport report={report()} offer="Autumn 20%" />);
    expect(fact("Offer")).toBe("Autumn 20%");
    cleanup();
    render(<BuildReport report={report()} offer={null} />);
    expect(fact("Offer")).toBe("None");
  });
});
