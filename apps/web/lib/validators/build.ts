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
  /** The sentence it sits in (D84), for the desk to open and outline; null for alt text or older
   * reports. Ids are for the page as it was when scanned. */
  fragment: z.string().nullish(),
  reason: z.string(),
});
export type ComplianceFinding = z.infer<typeof complianceFindingSchema>;

export const residueFindingSchema = z.object({
  kind: z.enum(["brand", "images", "links", "claims"]),
  text: z.string(),
  where: z.string(),
});
export type ResidueFinding = z.infer<typeof residueFindingSchema>;

/** A clone build's residue scan (worker app/engines/residue.py); `score` is null when the build
 * ran before the scan existed. */
export const residueSchema = z.object({
  score: z.number().nullable().catch(null),
  clean: z.boolean().nullable().catch(null),
  counts: counts,
  findings: z.array(residueFindingSchema).catch([]),
});
export type Residue = z.infer<typeof residueSchema>;

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
      rewritten: z.number().catch(0),
      eligible: z.number().catch(0),
      failed_chunks: z.number().catch(0),
      mock: z.boolean().catch(false),
      skipped: z.string().optional(),
      error: z.string().nullish(),
      warnings: z.array(z.string()).catch([]),
      purged_terms: z
        .array(z.object({ term: z.string(), removed: z.string() }).loose())
        .catch([]),
      review: z
        .array(
          z.object({
            original: z.string(),
            replacement: z.string(),
            where: z.string(),
          }),
        )
        .catch([]),
    })
    .loose()
    .catch({
      rewritten_ratio: 0,
      rewritten: 0,
      eligible: 0,
      failed_chunks: 0,
      mock: false,
      warnings: [],
      purged_terms: [],
      review: [],
    }),
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
  /** Clones only (B2.3): what's left of the source page, scored (BUILD_SPEC §13.2). */
  residue: residueSchema.nullish().catch(null),
  source: z
    .object({ host: z.string().nullish(), name: z.string().nullish() })
    .loose()
    .nullish()
    .catch(null),
});
export type BuildReport = z.infer<typeof buildReportSchema>;

const emphasisList = z.array(z.string().trim().min(1).max(200)).max(3);

/** The create wizard's payload (BUILD_SPEC §9; worker app/models/build.py BuildRequest). */
export const createPageSchema = z.object({
  template_id: z.uuid(),
  brand_id: z.uuid(),
  product_id: z.uuid(),
  wizard: z.object({
    author_type: z.enum(["writer", "customer", "influencer", "expert"]),
    ai_images: z.boolean(),
    image_styles: z
      .array(
        z.enum([
          "editorial",
          "ugc",
          "studio",
          "macro",
          "illustration",
          "anatomical",
          "diagram",
          "render",
        ]),
      )
      .max(8),
    audience: z.string().trim().max(300).nullable(),
    audience_gender: z.enum(["any", "women", "men"]),
    audience_age: z.string().max(20).nullable(),
    emphasis: z.object({
      benefits: emphasisList,
      features: emphasisList,
      objections: emphasisList,
    }),
  }),
});
export type CreatePageInput = z.infer<typeof createPageSchema>;
