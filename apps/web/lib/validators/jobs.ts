import { z } from "zod";

// Shapes crossing the web ⇄ worker and server ⇄ browser boundaries for jobs and notifications.

export const jobStatusSchema = z.enum([
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
]);
export type JobStatus = z.infer<typeof jobStatusSchema>;

export const jobEventSchema = z.object({
  id: z.number(),
  ts: z.string(),
  level: z.enum(["info", "warn", "error"]),
  message: z.string(),
  data: z.record(z.string(), z.unknown()).nullable(),
});
export type JobEvent = z.infer<typeof jobEventSchema>;

export const jobErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  user_facing: z.boolean().optional(),
});

export const jobSchema = z.object({
  id: z.string(),
  kind: z.string(),
  status: jobStatusSchema,
  attempts: z.number(),
  max_attempts: z.number(),
  result: z.record(z.string(), z.unknown()).nullable(),
  error: jobErrorSchema.nullable(),
  created_by: z.string().nullable(),
  created_at: z.string(),
  started_at: z.string().nullable(),
  finished_at: z.string().nullable(),
});
export type Job = z.infer<typeof jobSchema>;

/** A job with its latest progress event, for the jobs tray. */
export const jobSummarySchema = jobSchema.extend({
  latest: jobEventSchema.nullable(),
});
export type JobSummary = z.infer<typeof jobSummarySchema>;

export const jobListSchema = z.object({ jobs: z.array(jobSummarySchema) });

/** A job with its recent events (oldest first). */
export const jobDetailSchema = jobSchema.extend({
  events: z.array(jobEventSchema),
});
export type JobDetail = z.infer<typeof jobDetailSchema>;

/** Browser → POST /api/jobs. */
export const startJobSchema = z.object({
  kind: z.string().min(1).max(64),
  payload: z.record(z.string(), z.unknown()).default({}),
});
export type StartJobInput = z.input<typeof startJobSchema>;

/** Worker POST /jobs response (services/worker/app/main.py EnqueueResponse). */
export const enqueueResponseSchema = z.object({
  job: jobSchema.loose(),
  created: z.boolean(),
});
export type EnqueueResponse = z.infer<typeof enqueueResponseSchema>;

export const notificationSchema = z.object({
  id: z.string(),
  kind: z.string(),
  title: z.string(),
  body: z.string().nullable(),
  read_at: z.string().nullable(),
  created_at: z.string(),
  job_id: z.string().nullable(),
  build_id: z.string().nullable(),
});
export type Notification = z.infer<typeof notificationSchema>;

export const notificationListSchema = z.object({
  notifications: z.array(notificationSchema),
  unread: z.number(),
});
export type NotificationList = z.infer<typeof notificationListSchema>;

/** Browser → POST /api/notifications/read. No ids means "mark all read". */
export const markReadSchema = z.object({
  ids: z.array(z.string()).max(100).optional(),
});
