import { z } from "zod";

/** Trash (D92; worker app/models/trash.py). */
export const trashKindSchema = z.enum(["page", "brand", "product", "template"]);
export type TrashKind = z.infer<typeof trashKindSchema>;

export const trashItemSchema = z.object({
  kind: trashKindSchema,
  id: z.uuid(),
  name: z.string(),
  /** The page's or product's brand; what went to Trash with a brand. */
  detail: z.string().nullable(),
  deleted_at: z.string(),
  deleted_by: z.string().nullable(),
  /** Deleted for good after this (7 days on). */
  expires_at: z.string(),
});
export type TrashItem = z.infer<typeof trashItemSchema>;

export const trashStateSchema = z.object({
  items: z.array(trashItemSchema),
  /** Owners and admins delete for good; everyone can restore. */
  can_permanently_delete: z.boolean(),
});
export type TrashState = z.infer<typeof trashStateSchema>;
