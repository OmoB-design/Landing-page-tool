import { z } from "zod";

/** Analytics (B1.6b; worker app/models/analytics.py). Money arrives as decimal strings. */
const usd = z.union([z.string(), z.number()]).transform(Number);

export const analyticsRangeSchema = z.enum(["30d", "90d", "12m"]);
export type AnalyticsRange = z.infer<typeof analyticsRangeSchema>;

const shareSchema = z.object({
  key: z.string(),
  label: z.string(),
  spend_usd: usd,
});
export type Share = z.infer<typeof shareSchema>;

export const analyticsSchema = z.object({
  range: analyticsRangeSchema,
  since: z.string(),
  bucket: z.enum(["day", "week", "month"]),
  spend_usd: usd,
  pages_built: z.number(),
  average_page_cost_usd: usd.nullable(),
  pages_published: z.number(),
  spend_over_time: z.array(z.object({ start: z.string(), spend_usd: usd })),
  by_brand: z.array(shareSchema),
  by_template: z.array(shareSchema),
  by_kind: z.array(shareSchema),
  pages_by_status: z.array(z.object({ status: z.string(), count: z.number() })),
});
export type Analytics = z.infer<typeof analyticsSchema>;
