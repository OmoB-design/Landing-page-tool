import { z } from "zod";

/** A page's paid calls (BUILD_SPEC §6.3), for the Library. */
export const ledgerEntrySchema = z.object({
  id: z.number(),
  created_at: z.string(),
  node: z.string().nullable(),
  kind: z.string(),
  provider: z.string(),
  model: z.string(),
  input_tokens: z.number().nullable(),
  output_tokens: z.number().nullable(),
  units: z.number().nullable(),
  cost_usd: z.number().nullable(),
});
export type LedgerEntry = z.infer<typeof ledgerEntrySchema>;

export const ledgerSchema = z.object({ entries: z.array(ledgerEntrySchema) });
