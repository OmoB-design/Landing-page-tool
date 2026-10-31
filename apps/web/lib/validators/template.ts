import { z } from "zod";

// The section editor (BUILD_SPEC §8.3): the worker's editor state
// (services/worker/app/models/template.py TemplateEditorState) and the edits it accepts.

export const editorSectionSchema = z.object({
  key: z.string(),
  role: z.string(),
  label: z.string(),
  removable: z.boolean(),
  duplicable: z.boolean(),
  number: z.string().nullable(),
  title: z.string(),
  fields: z.array(z.object({ label: z.string(), text: z.string() })),
  words: z.number(),
  images: z.number(),
  group: z.number(),
});
export type EditorSection = z.infer<typeof editorSectionSchema>;

export const templateIssueSchema = z.object({
  severity: z.enum(["error", "warning", "info"]),
  message: z.string(),
  section: z.string().nullable(),
});
export type TemplateIssue = z.infer<typeof templateIssueSchema>;

/** BUILD_SPEC §8.5: a template's rules for the copy and image passes. */
export const templateInstructionsSchema = z.object({
  copy_rules: z.string().max(4000).default(""),
  length_caps: z
    .array(z.object({ match: z.string(), max_chars: z.number() }))
    .default([]),
  image_rules: z.string().max(4000).default(""),
  generic_images: z.array(z.string()).default([]),
  keep_images: z.array(z.string()).default([]),
  forbidden_terms: z.array(z.string().max(120)).max(100).default([]),
  notes: z.string().default(""),
});
export type TemplateInstructions = z.infer<typeof templateInstructionsSchema>;

/** A clone's analysis (B2.2) and its review. */
export const templateAnalysisSchema = z.object({
  ai: z.enum(["claude", "mock"]),
  model: z.string(),
  analysed_at: z.string(),
  palette: z.record(z.string(), z.string().nullable()),
  brand_tokens: z.array(z.string()),
  logo_srcs: z.array(z.string()),
  cta_hrefs: z.array(z.string()),
  notes: z.string(),
  reviewed_at: z.string().nullable(),
  reviewed_by: z.string().nullable(),
});
export type TemplateAnalysis = z.infer<typeof templateAnalysisSchema>;

export const templateEditorSchema = z.object({
  template: z.object({
    id: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    type: z.string(),
    version: z.number(),
    parent_name: z.string().nullable(),
    updated_at: z.string(),
    origin: z.enum(["owned", "cloned"]).default("owned"),
    source: z
      .object({
        url: z.string().nullable(),
        host: z.string(),
        name: z.string().nullable(),
        platform: z.string().nullable(),
        verdict: z.string().nullable(),
      })
      .nullable()
      .default(null),
    analysis: templateAnalysisSchema.nullable().default(null),
    /** Pages can be built from it: owned, or a clone whose analysis was confirmed. */
    ready: z.boolean().default(true),
  }),
  instructions: templateInstructionsSchema.default(
    templateInstructionsSchema.parse({}),
  ),
  sections: z.array(editorSectionSchema),
  versions: z.array(
    z.object({
      version: z.number(),
      reason: z.string().nullable(),
      created_at: z.string(),
      current: z.boolean(),
    }),
  ),
  can_undo: z.boolean(),
  can_redo: z.boolean(),
  issues: z.array(templateIssueSchema),
  look: z.object({
    colours: z.array(
      z.object({ name: z.string(), token: z.string(), value: z.string() }),
    ),
    heading_font: z.string().nullable(),
    body_font: z.string().nullable(),
  }),
  words: z.number(),
  read_minutes: z.number(),
});
export type TemplateEditorState = z.infer<typeof templateEditorSchema>;

export const layoutActionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("reorder"),
    keys: z.array(z.string()).min(1).max(100),
    moved: z.string().optional(),
  }),
  z.object({ type: z.literal("remove"), key: z.string() }),
  z.object({ type: z.literal("duplicate"), key: z.string() }),
  z.object({
    type: z.literal("rename"),
    key: z.string(),
    label: z.string().trim().min(1, "Give the section a name.").max(80),
  }),
]);
export type LayoutAction = z.infer<typeof layoutActionSchema>;

export const templateDetailsSchema = z.object({
  name: z.string().trim().min(1, "Give the template a name.").max(80),
  description: z.string().trim().max(400),
});
export type TemplateDetails = z.infer<typeof templateDetailsSchema>;
