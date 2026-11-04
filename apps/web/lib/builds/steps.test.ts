import { describe, expect, it } from "vitest";

import {
  CLONED_BUILD_STEPS,
  OWNED_BUILD_STEPS,
  buildStepsFor,
} from "@/lib/builds/steps";
import { buildReportSchema } from "@/lib/validators/build";

// services/worker/app/pipeline/graph.py ORDER["cloned"] (B2.3).
const WORKER_CLONED_ORDER = [
  "load_inputs",
  "apply_section_layout",
  "recolor",
  "swap_logos",
  "regenerate_variants",
  "copy_rewrite",
  "purge_terms",
  "strip_chrome",
  "prepare_media_slots",
  "image_pass",
  "finalize_common",
  "scrub_source_brand",
  "scrub_scripts",
  "rewrite_links",
  "purge_foreign_assets",
  "product_fidelity",
  "residue_scan",
  "compliance_scan",
  "write_report",
];

describe("build steps", () => {
  it("lists a cloned build's steps in the worker's order", () => {
    expect(CLONED_BUILD_STEPS.map((step) => step.id)).toEqual(
      WORKER_CLONED_ORDER,
    );
    expect(buildStepsFor("cloned")).toBe(CLONED_BUILD_STEPS);
    expect(buildStepsFor("owned")).toBe(OWNED_BUILD_STEPS);
    expect(buildStepsFor(undefined)).toBe(OWNED_BUILD_STEPS);
  });

  it("reads a clone's residue from the report, and older reports without it", () => {
    const base = { mode: "cloned", template: { name: "Cardio", slug: "c" } };
    const report = buildReportSchema.parse({
      ...base,
      residue: {
        score: 79,
        clean: false,
        counts: { brand: 1, images: 0, links: 0, claims: 2 },
        findings: [{ kind: "brand", text: "Vitalis", where: "hero > p" }],
      },
      source: { host: "try.vitalis.test", name: "Vitalis" },
    });
    expect(report.residue?.score).toBe(79);
    expect(report.residue?.findings[0]?.kind).toBe("brand");
    expect(buildReportSchema.parse(base).residue ?? null).toBeNull();
    const old = buildReportSchema.parse({
      ...base,
      residue: { score: null, clean: null, counts: {}, findings: [] },
    });
    expect(old.residue?.score).toBeNull();
  });

  it("adds the competitor step to a ranking build, after loading (B2.4a)", () => {
    const ids = buildStepsFor("owned", "top5_ranking").map((step) => step.id);
    expect(ids.slice(0, 3)).toEqual([
      "load_inputs",
      "pull_competitors",
      "apply_section_layout",
    ]);
    expect(ids).toHaveLength(OWNED_BUILD_STEPS.length + 1);
    expect(buildStepsFor("owned", "listicle")).toBe(OWNED_BUILD_STEPS);
  });

  it("reads a ranking build's competitors from the report", () => {
    const report = buildReportSchema.parse({
      mode: "owned",
      template: { name: "Top 5", slug: "top5-ranking" },
      competitors: [
        {
          rank: 2,
          label: "Brand B",
          name: "Daily Greens",
          url: "https://vitality.test/p",
          status: "pulled",
          price: "59.00",
          currency: "USD",
          rating: "4.4",
          rating_count: 1203,
          claims: 3,
          reviews: 2,
          photo: false,
          warnings: [],
        },
        {
          rank: 5,
          label: "Brand E",
          url: "https://blocked.test/p",
          status: "failed",
          error: "The site blocked the request.",
        },
      ],
    });
    expect(report.competitors?.map((c) => c.status)).toEqual([
      "pulled",
      "failed",
    ]);
    expect(report.competitors?.[1]?.claims).toBe(0);
  });
});
