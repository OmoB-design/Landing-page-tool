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

/** A batch started (B3.5, D115; worker POST /builds/batch): a page from each chosen template. */
export const batchCreatedSchema = z.object({
  batch_id: z.string(),
  builds: z.array(
    z.object({
      id: z.string(),
      key: z.string(),
      status: z.string(),
      title: z.string(),
    }),
  ),
});
export type BatchCreated = z.infer<typeof batchCreatedSchema>;

/** A batch's pages and how each is getting on (worker GET /builds/batch/{id}). */
export const batchStateSchema = z.object({
  batch_id: z.string(),
  brand: z.string(),
  product: z.string(),
  created_at: z.string(),
  pages: z.array(
    z.object({
      id: z.string(),
      key: z.string(),
      title: z.string(),
      template_id: z.string(),
      template_name: z.string(),
      template_type: z.string(),
      status: z.string(),
      job_id: z.string().nullable(),
      /** What its build is doing now, while it runs. */
      step: z.string().nullable(),
      /** Its place in line while it waits (1 is next). */
      waiting: z.number().int().nullable(),
      error: z.string().nullable(),
      // For the list (B3.5b), as the Pages list shows them.
      origin: z.enum(["owned", "cloned"]).catch("owned"),
      residue_score: z.number().nullable().catch(null),
      cost_usd: z.number().catch(0),
      created_by: z.string().nullable().catch(null),
      updated_at: z.string(),
      started_at: z.string().nullable().catch(null),
      finished_at: z.string().nullable().catch(null),
    }),
  ),
});
export type BatchState = z.infer<typeof batchStateSchema>;
export type BatchPage = BatchState["pages"][number];

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

/** A Top 5 ranking build's competitor as its report lists it (B2.4a; worker write_report). */
export const reportCompetitorSchema = z.object({
  rank: z.number(),
  label: z.string(),
  name: z.string().nullish(),
  url: z.string(),
  status: z.enum(["pulled", "failed"]),
  error: z.string().nullish(),
  price: z.union([z.string(), z.number()]).nullish(),
  currency: z.string().nullish(),
  rating: z.union([z.string(), z.number()]).nullish(),
  rating_count: z.number().nullish(),
  claims: z.number().catch(0),
  reviews: z.number().catch(0),
  photo: z.boolean().catch(false),
  warnings: z.array(z.string()).catch([]),
});
export type ReportCompetitor = z.infer<typeof reportCompetitorSchema>;

const sourcedSchema = z.object({
  text: z.string(),
  sources: z.array(z.string()).catch([]),
});

/** A ranking build's comparison (B2.4b, D103; worker compare_products): "Our take" on each
 * competitor and the points the table compares, each line citing the facts it rests on. */
export const reportComparisonSchema = z
  .object({
    takes: z
      .array(
        z.object({
          rank: z.number(),
          stands_out: sourcedSchema,
          worth_knowing: sourcedSchema,
        }),
      )
      .catch([]),
    axes: z
      .array(
        z.object({
          name: z.string(),
          cells: z
            .array(
              z.object({
                rank: z.number(),
                text: z.string(),
                sources: z.array(z.string()).catch([]),
              }),
            )
            .catch([]),
        }),
      )
      .catch([]),
  })
  .loose();
export type ReportComparison = z.infer<typeof reportComparisonSchema>;

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
  /** Top 5 ranking builds only (B2.4a): the competitors at ranks #2 to #5. */
  competitors: z.array(reportCompetitorSchema).nullish().catch(null),
  /** Top 5 ranking builds only (B2.4b): "Our take" and the comparison table. */
  comparison: reportComparisonSchema.nullish().catch(null),
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
    // A Top 5 ranking's competitors (B2.4a): four product pages, ranks #2 to #5.
    competitors: z
      .object({
        urls: z.array(z.string().trim().min(4).max(2000)).length(4),
        naming: z.enum(["neutral", "real"]),
      })
      .nullable(),
  }),
});
export type CreatePageInput = z.infer<typeof createPageSchema>;

/** The wizard's batch (B3.5): the same choices, a page from each of these templates. */
export const createBatchSchema = createPageSchema
  .omit({ template_id: true })
  .extend({ template_ids: z.array(z.uuid()).min(1).max(20) });
export type CreateBatchInput = z.infer<typeof createBatchSchema>;
