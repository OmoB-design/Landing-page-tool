import { z } from "zod";

/**
 * The preview check (BUILD_SPEC §11.1, B3.3a, D111; worker /builds/{id}/qa): the page's
 * full-length screenshots at desktop and phone widths, its share image (the picture apps show
 * when the page's link is shared) and the text beside it, the page version they show, and
 * whether a check is under way.
 */
const shot = z.object({
  url: z.string(),
  width: z.number().int(),
  height: z.number().int(),
});

export const qaStateSchema = z.object({
  version: z.number().int().nullable(),
  page_version: z.number().int(),
  taken_at: z.string().nullable(),
  desktop: shot.nullable(),
  phone: shot.nullable(),
  share: z.string().nullable(),
  title: z.string().nullable(),
  description: z.string().nullable(),
  running: z.string().nullable(),
  /** The phone check with the screenshots (B3.3b, D112): wide, small_text, tap, overlap. */
  phone_check: z
    .object({
      passed: z.boolean(),
      issues: z.array(
        z.object({
          kind: z.string(),
          title: z.string(),
          detail: z.string(),
          count: z.number().int(),
          examples: z.array(
            z.object({ text: z.string(), section: z.string().nullable() }),
          ),
        }),
      ),
    })
    .nullable()
    .catch(null),
  /** Fix for phone under way (a job). */
  fixing: z.string().nullable().catch(null),
});
export type QaState = z.infer<typeof qaStateSchema>;
export type PhoneCheck = NonNullable<QaState["phone_check"]>;

export const qaStartedSchema = z.object({ job_id: z.string() });
export type QaStarted = z.infer<typeof qaStartedSchema>;
