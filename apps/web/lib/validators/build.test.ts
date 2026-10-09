import { describe, expect, it } from "vitest";

import { buildReportSchema } from "@/lib/validators/build";

// A report as write_report stores it (services/worker/app/pipeline/nodes/write_report.py).
const report = {
  mode: "owned",
  template: {
    id: "t1",
    slug: "advertorial-fixture",
    name: "Advertorial (test)",
    type: "advertorial",
    version: 1,
  },
  status: "needs_review",
  verdict: null,
  targeting: {},
  layout: {
    in_order: true,
    moved: 0,
    removed: [],
    duplicated: [],
    warnings: [],
  },
  brand: {
    recolor: {
      exact: 11,
      hue_shifted: 1,
      fonts: ["ITC Garamond Condensed"],
      vars_set: [],
    },
    logos: { slots: 1, logos_missing: 0 },
    variants: { pickers: 1, units: 4, collapsed: 0, truncated: 0 },
  },
  copy: {
    rewritten_ratio: 0,
    skipped:
      "The copy rewrite arrives in B0.6b; the template's own copy is kept.",
    warnings: [],
    drift_warnings: [],
    purged_terms: [
      {
        term: "Sample Labs",
        removed: "span",
        text: "As seen in Sample Labs Weekly",
      },
    ],
  },
  images: {
    media_slots: 1,
    plan_stats: { product: 1, scene: 2, person: 3, logo: 1, keep: 0, other: 0 },
    product_photos: 1,
    mock_images: 5,
    replaced: 6,
    dropped: 0,
    mock: true,
    warning: null,
    product_fix: { skipped: "mock_images" },
  },
  finalize: { prices: 2 },
  compliance: {
    findings: [
      {
        rule: "number_one",
        category: "superlative",
        severity: "medium",
        text: "The #1 olive oil",
        location: "hero > h1",
        reason: '"#1" needs a source.',
      },
    ],
    high_risk_count: 0,
    counts: { high: 0, medium: 1, low: 0 },
    clean: false,
  },
  cost: {
    total_usd: 0,
    breakdown_by_kind: { image: 0 },
    breakdown_by_node: { image_pass: 0 },
  },
  mock_images: true,
  warnings: [],
  nodes: ["load_inputs", "write_report"],
};

describe("build report", () => {
  it("reads what the worker writes", () => {
    const parsed = buildReportSchema.parse(report);
    expect(parsed.copy.skipped).toContain("B0.6b");
    expect(parsed.copy.purged_terms[0]?.term).toBe("Sample Labs");
    expect(parsed.images.mock_images).toBe(5);
    expect(parsed.brand.recolor?.fonts).toEqual(["ITC Garamond Condensed"]);
    expect(parsed.compliance.findings[0]?.severity).toBe("medium");
    expect(parsed.mock_images).toBe(true);
  });

  it("tolerates missing or damaged sections instead of failing the page", () => {
    const parsed = buildReportSchema.parse({
      mode: "owned",
      template: { name: "X", slug: "x" },
      images: "broken",
      compliance: { findings: [{ nope: true }] },
    });
    expect(parsed.images).toEqual({
      plan_stats: {},
      product_photos: 0,
      mock_images: 0,
    });
    expect(parsed.compliance.findings).toEqual([]);
    expect(parsed.warnings).toEqual([]);
    expect(parsed.cost.total_usd).toBe(0);
  });
});
