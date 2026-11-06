import { z } from "zod";

/** The client review link (B3.6, D119): the page's live link, if any. */
export const shareLinkSchema = z.object({
  token: z.string(),
  created_at: z.string(),
  expires_at: z.string(),
  expired: z.boolean(),
  views: z.number().int(),
  last_viewed_at: z.string().nullable(),
});

/** What the review desk's Client link shows (worker GET/POST/DELETE /builds/{id}/share). */
export const shareStateSchema = z.object({
  /** The page has an approved version a link can show. */
  can_share: z.boolean(),
  approved_version: z.number().int().nullable(),
  approved_at: z.string().nullable(),
  page_version: z.number().int(),
  /** Changed since that approval: the link shows the approved version until it's approved again. */
  changed_since: z.boolean(),
  link: shareLinkSchema.nullable(),
});

export type ShareState = z.infer<typeof shareStateSchema>;

/** The web route's answer: the worker's state with the link's address, always on the production
 * domain (the one Vercel doesn't put behind its login). */
export const shareAnswerSchema = shareStateSchema.extend({
  url: z.string().nullable(),
});

export type ShareAnswer = z.infer<typeof shareAnswerSchema>;

/** The client's page (worker GET /review/{token}, no sign-in). */
export const reviewInfoSchema = z.object({
  title: z.string(),
  approved_at: z.string(),
});

export type ReviewInfo = z.infer<typeof reviewInfoSchema>;
