import { z } from "zod";

/** The review desk's view of a finished build (worker GET /builds/{id}/desk, D84). */
export const deskStateSchema = z.object({
  build: z.object({
    id: z.string(),
    status: z.string(),
    page_version: z.number().int(),
    approved_at: z.string().nullable(),
    approved_by: z.string().nullable(),
  }),
  /** Every sentence of the page, in order, with the id a save is checked against. */
  fragments: z.array(
    z.object({
      id: z.string(),
      text: z.string(),
      section: z.string().nullable(),
      /** Filled from brand or product data (names, prices): shown, not editable. */
      locked: z.boolean(),
      /** Changed on the desk. */
      edited: z.boolean(),
      /** The paragraph, heading, list item or button it belongs to (shared by its lines). */
      block: z.number().int(),
      kind: z.string(),
    }),
  ),
  /** What the Copy tab edits: each paragraph (or heading, list item, button…) as one text, even
   * when bold words, a link or a price split it into several fragments. */
  paragraphs: z.array(
    z.object({
      number: z.number().int(),
      kind: z.string(),
      section: z.string().nullable(),
      text: z.string(),
      /** Every part is filled from data (a price, the product name): shown, not editable. */
      locked: z.boolean(),
      /** Parts filled from data that stay as they are when the rest is edited. */
      locked_parts: z.array(z.string()),
      edited: z.boolean(),
      fragments: z.array(z.string()),
    }),
  ),
  /** The template's name for each section key. */
  sections: z.record(z.string(), z.string()),
  /** Newest first: Undo puts back the first. `reason` names the change made after it. */
  snapshots: z.array(
    z.object({
      seq: z.number().int(),
      reason: z.string(),
      created_at: z.string(),
      created_by: z.string().nullable(),
    }),
  ),
});

export type DeskState = z.infer<typeof deskStateSchema>;
export type DeskFragment = DeskState["fragments"][number];
export type DeskParagraph = DeskState["paragraphs"][number];
export type DeskSnapshot = DeskState["snapshots"][number];

const base = z.object({ base_version: z.number().int().min(1) });

/** The desk's changes, as the browser sends them (the route adds the org). */
export const deskActionSchemas = {
  copy: base.extend({
    edits: z
      .array(
        z.object({
          block: z.number().int().min(1),
          original: z.string().max(10000),
          text: z.string().trim().min(1, "Write something first.").max(10000),
        }),
      )
      .min(1)
      .max(50),
  }),
  status: base.extend({ status: z.enum(["approved", "needs_review"]) }),
  undo: base,
  restore: base.extend({ seq: z.number().int().min(1) }),
} as const;

export type DeskAction = keyof typeof deskActionSchemas;

export function isDeskAction(value: string): value is DeskAction {
  return Object.hasOwn(deskActionSchemas, value);
}
