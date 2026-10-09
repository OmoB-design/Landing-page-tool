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

export const templateEditorSchema = z.object({
  template: z.object({
    id: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    type: z.string(),
    version: z.number(),
    parent_name: z.string().nullable(),
    updated_at: z.string(),
  }),
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
