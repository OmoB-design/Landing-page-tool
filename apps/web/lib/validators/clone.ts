import { z } from "zod";

import { jobSchema } from "@/lib/validators/jobs";

// The clone path (BUILD_SPEC §8.4, B2.1): its terms, starting a clone, and what the clone job
// returns. Mirrors services/worker/app/models/clone.py and jobs/kinds/template_clone.py.

/** The template types a clone can be filed as (the worker accepts more; these have glyphs). */
export const CLONE_TYPES = [
  { value: "advertorial", label: "Advertorial" },
  { value: "listicle", label: "Listicle" },
  { value: "versus", label: "Versus" },
  { value: "comparison", label: "Comparison" },
  { value: "long_form", label: "Long form" },
  { value: "other", label: "Other" },
] as const;
export type CloneType = (typeof CLONE_TYPES)[number]["value"];

/** The web app's request limit is 4.5 MB on Vercel; HTML up to 4 million characters fits. */
export const MAX_PASTE_CHARS = 4_000_000;

export const cloneTermsStateSchema = z.object({
  clone_enabled: z.boolean(),
  accepted_at: z.string().nullable(),
  accepted_by: z.string().nullable(),
  can_accept: z.boolean(),
});
export type CloneTermsState = z.infer<typeof cloneTermsStateSchema>;

const address = z
  .string()
  .trim()
  .max(2000)
  .refine(
    (value) => value === "" || /^(https?:\/\/)?[^\s/]+\.[^\s]+$/i.test(value),
    "Enter a web address, e.g. https://example.com/pages/offer",
  );

/** Browser → POST /api/templates/clone: a page's address, or its HTML. */
export const cloneRequestSchema = z
  .object({
    url: address.optional(),
    html: z
      .string()
      .max(MAX_PASTE_CHARS, "That HTML is too long to paste (4 MB at most).")
      .optional(),
    source_url: address.optional(),
    name: z.string().trim().max(120).optional(),
    type: z.enum(CLONE_TYPES.map((t) => t.value)),
  })
  .refine((value) => Boolean(value.url) !== Boolean(value.html?.trim()), {
    message: "Give the page's address or its HTML.",
  });
export type CloneRequest = z.infer<typeof cloneRequestSchema>;

export const cloneStartedSchema = z.object({ job: jobSchema });

/** The clone job's result (template_clone.run). */
export const cloneResultSchema = z.object({
  template_id: z.string(),
  name: z.string(),
  source_url: z.string(),
  source_host: z.string(),
  source_name: z.string().nullable(),
  platform: z.string(),
  verdict: z.string().nullable(),
  warnings: z.array(z.string()),
  /** The analysis it queued (B2.2), unless the hourly cap was reached. */
  analysis_job_id: z.string().nullable().default(null),
});
export type CloneResult = z.infer<typeof cloneResultSchema>;
