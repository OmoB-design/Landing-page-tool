import { z } from "zod";

import { deskStateSchema } from "@/lib/validators/desk";

/**
 * Lander, the page editor's agent (B3.1c, D106; worker /builds/{id}/agent): a request, the
 * conversation, and what a request did (its plan, steps and changes), as the worker sends them.
 */

/** The longest request Lander takes (worker AgentRequest.text). */
export const AGENT_REQUEST_MAX = 500;
/** Pictures a request can carry (worker AgentRequest.images, B3.1d). */
export const AGENT_IMAGES_MAX = 3;

export const agentTargetSchema = z
  .object({ key: z.string(), label: z.string() })
  .nullable();

const palette = z.object({
  primary: z.string(),
  dark: z.string(),
  tint: z.string(),
  accent: z.string(),
});

/** One change Lander made: lines rewritten, a section moved / copied / removed, the colours. */
export const agentChangeSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("lines"),
    label: z.string(),
    section: z.string().nullable(),
    section_label: z.string().nullable(),
    lines: z.array(
      z.object({
        number: z.number().int(),
        before: z.string(),
        after: z.string(),
      }),
    ),
  }),
  z.object({
    kind: z.literal("section"),
    label: z.string(),
    action: z.enum(["move", "duplicate", "remove"]),
    key: z.string(),
  }),
  z.object({
    kind: z.literal("colors"),
    label: z.string(),
    before: palette.nullable(),
    after: palette,
  }),
  /** CSS Lander set on one box (B3.1d): "Fitted the Verified box to its text". */
  z.object({
    kind: z.literal("style"),
    label: z.string(),
    section: z.string().nullable(),
    styles: z.record(z.string(), z.string()),
  }),
]);
export type AgentChange = z.infer<typeof agentChangeSchema>;

/** One thing Lander did ("Rewrote 3 lines in Hero"); `ok` false when it couldn't. */
export const agentStepSchema = z.object({
  label: z.string(),
  ok: z.boolean(),
  change: agentChangeSchema.nullable().optional(),
  /** What Lander looked at (B3.1d): a signed link to the picture, for an hour. */
  image_url: z.string().nullable().optional(),
});
export type AgentStep = z.infer<typeof agentStepSchema>;

/** Lander's reply: the job's result, or the conversation's saved reply. */
export const agentReplySchema = z.object({
  state: z.enum(["working", "done", "stopped", "failed"]),
  plan: z.string().nullable().optional(),
  steps: z.array(agentStepSchema).default([]),
  changes: z.array(agentChangeSchema).default([]),
  closing: z.string().nullable().optional(),
  reason: z.string().nullable().optional(),
  page_version: z.number().int().nullable().optional(),
  error: z.string().nullable().optional(),
  took: z.number().nullable().optional(),
});
export type AgentReply = z.infer<typeof agentReplySchema>;

const messageBase = {
  id: z.string(),
  job_id: z.string().nullable(),
  created_at: z.string(),
};

export const agentMessageSchema = z.discriminatedUnion("role", [
  z.object({
    ...messageBase,
    role: z.literal("user"),
    content: z.object({
      text: z.string(),
      target: agentTargetSchema,
      /** The pictures attached (signed links, B3.1d). */
      image_urls: z.array(z.string().nullable()).optional(),
    }),
  }),
  z.object({
    ...messageBase,
    role: z.literal("assistant"),
    content: agentReplySchema,
  }),
]);
export type AgentMessage = z.infer<typeof agentMessageSchema>;

export const agentThreadSchema = z.object({
  thread_id: z.string().nullable(),
  messages: z.array(agentMessageSchema),
});
export type AgentThread = z.infer<typeof agentThreadSchema>;

export const agentStartSchema = z.object({
  desk: deskStateSchema,
  thread_id: z.string(),
  job_id: z.string(),
  message_id: z.string(),
});
export type AgentStart = z.infer<typeof agentStartSchema>;

/** POST /api/builds/[id]/agent: a request to Lander. */
export const agentRequestSchema = z.object({
  base_version: z.number().int().min(1),
  text: z.string().trim().min(1).max(AGENT_REQUEST_MAX),
  target_key: z.string().max(100).nullable().optional(),
  thread_id: z.string().uuid().nullable().optional(),
  /** Pictures for reference, as data URLs (sized down in the browser first). */
  images: z
    .array(
      z
        .string()
        .max(4_200_000)
        .regex(/^data:image\/(png|jpeg|webp);base64,/),
    )
    .max(AGENT_IMAGES_MAX)
    .optional(),
});
export type AgentRequestInput = z.infer<typeof agentRequestSchema>;

/** A live job event from Lander (`data.agent`): its plan, a step, or its closing line. */
export const agentEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("plan"), text: z.string() }),
  z.object({ type: z.literal("closing"), text: z.string() }),
  agentStepSchema.extend({ type: z.literal("step") }),
]);
export type AgentEvent = z.infer<typeof agentEventSchema>;
