import { z } from "zod";

const hex = z.string().regex(/^#[0-9a-f]{6}$/i, "Use a colour like #1f6feb.");

/** The page's four brand colours (worker DeskPalette). */
export const deskPaletteSchema = z.object({
  primary: hex,
  dark: hex,
  tint: hex,
  accent: hex,
});

export const REDRAFT_SCOPES = [
  "page",
  "section",
  "paragraph",
  "unwritten",
] as const;

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
  /** A redraft queued or running (D86): the desk's other changes wait until it's done. */
  redraft: z
    .object({
      job_id: z.string(),
      status: z.string(),
      scope: z.enum(REDRAFT_SCOPES),
      section: z.string().nullable(),
      block: z.number().int().nullable(),
    })
    .nullable(),
  /** The colours on the page now and the brand's (null when not known). */
  colors: z.object({
    page: deskPaletteSchema.nullable(),
    brand: deskPaletteSchema.nullable(),
  }),
  /** The page's sections in order, with what the editor may do to each (B3.1a, D104). */
  layout: z
    .array(
      z.object({
        key: z.string(),
        label: z.string(),
        removable: z.boolean(),
        duplicable: z.boolean(),
        /** Sections in different parts of the page can't swap places. */
        group: z.number().int().catch(0),
      }),
    )
    .catch([]),
  /** Redo (B3.1a): the newest undone change, kept until the next new change. */
  can_redo: z.boolean().catch(false),
  redo_reason: z.string().nullish().catch(null),
});

export type DeskState = z.infer<typeof deskStateSchema>;
export type DeskFragment = DeskState["fragments"][number];
export type DeskParagraph = DeskState["paragraphs"][number];
export type DeskSnapshot = DeskState["snapshots"][number];
export type DeskSection = DeskState["layout"][number];
export type DeskPalette = z.infer<typeof deskPaletteSchema>;
export type DeskRedraft = NonNullable<DeskState["redraft"]>;
export type RedraftScope = (typeof REDRAFT_SCOPES)[number];

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
    /** The page editor's saves while typing (D104): one line's saves share an undo step. */
    typing: z.boolean().optional(),
  }),
  status: base.extend({ status: z.enum(["approved", "needs_review"]) }),
  undo: base,
  redo: base,
  restore: base.extend({ seq: z.number().int().min(1) }),
  redraft: base.extend({
    scope: z.enum(REDRAFT_SCOPES),
    section: z.string().max(100).optional(),
    block: z.number().int().min(1).optional(),
    note: z
      .string()
      .trim()
      .max(200, "Keep the note under 200 characters.")
      .optional(),
  }),
  recolor: base.extend({ colors: deskPaletteSchema }),
  /** The page editor's section changes (B3.1a): move, copy or remove, by the template's rules. */
  sections: base.extend({
    action: z.discriminatedUnion("type", [
      z.object({
        type: z.literal("reorder"),
        keys: z.array(z.string().max(100)).min(1).max(100),
        moved: z.string().max(100).optional(),
      }),
      z.object({ type: z.literal("remove"), key: z.string().max(100) }),
      z.object({ type: z.literal("duplicate"), key: z.string().max(100) }),
    ]),
  }),
} as const;

export type SectionAction = z.infer<
  (typeof deskActionSchemas)["sections"]
>["action"];

export type DeskAction = keyof typeof deskActionSchemas;

export function isDeskAction(value: string): value is DeskAction {
  return Object.hasOwn(deskActionSchemas, value);
}
