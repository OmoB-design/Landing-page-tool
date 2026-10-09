import { z } from "zod";

import { jobSchema } from "@/lib/validators/jobs";

// Builds (BUILD_SPEC §10): the worker's POST /builds response and the parts of `builds.report`
// (services/worker/app/pipeline/nodes/write_report.py) the build page shows.

export const buildCreatedSchema = z.object({
  build: z.object({
    id: z.string(),
    key: z.string(),
    status: z.string(),
    title: z.string(),
  }),
  job: jobSchema.loose(),
});
export type BuildCreated = z.infer<typeof buildCreatedSchema>;

const counts = z.record(z.string(), z.number()).catch({});

export const complianceFindingSchema = z.object({
  rule: z.string(),
  category: z.string(),
  severity: z.enum(["high", "medium", "low"]),
  text: z.string(),
  location: z.string(),
  reason: z.string(),
});
export type ComplianceFinding = z.infer<typeof complianceFindingSchema>;

export const buildReportSchema = z.object({
  mode: z.enum(["owned", "cloned"]),
  template: z.object({ name: z.string(), slug: z.string() }).loose(),
  layout: z
    .object({
      removed: z.array(z.string()).catch([]),
      duplicated: z.array(z.string()).catch([]),
    })
    .loose()
    .catch({ removed: [], duplicated: [] }),
  brand: z
    .object({
      recolor: z
        .object({
          exact: z.number().catch(0),
          hue_shifted: z.number().catch(0),
          fonts: z.array(z.string()).catch([]),
        })
        .loose()
        .optional(),
      logos: z
        .object({ slots: z.number(), logos_missing: z.number() })
        .optional(),
      variants: z.object({ units: z.number() }).loose().optional(),
    })
    .loose()
    .catch({}),
  copy: z
    .object({
      rewritten_ratio: z.number().catch(0),
      skipped: z.string().optional(),
      error: z.string().nullish(),
      warnings: z.array(z.string()).catch([]),
      purged_terms: z
        .array(z.object({ term: z.string(), removed: z.string() }).loose())
        .catch([]),
    })
    .loose()
    .catch({ rewritten_ratio: 0, warnings: [], purged_terms: [] }),
  images: z
    .object({
      plan_stats: counts,
      product_photos: z.number().catch(0),
      mock_images: z.number().catch(0),
      warning: z.string().nullish(),
    })
    .loose()
    .catch({ plan_stats: {}, product_photos: 0, mock_images: 0 }),
  compliance: z
    .object({
      findings: z.array(complianceFindingSchema).catch([]),
      high_risk_count: z.number().catch(0),
      clean: z.boolean().catch(true),
    })
    .loose()
    .catch({ findings: [], high_risk_count: 0, clean: true }),
  cost: z
    .object({ total_usd: z.number().catch(0) })
    .loose()
    .catch({ total_usd: 0 }),
  mock_images: z.boolean().catch(false),
  warnings: z.array(z.string()).catch([]),
});
export type BuildReport = z.infer<typeof buildReportSchema>;
