import { z } from "zod";

import { type BuildCreated, buildCreatedSchema } from "@/lib/validators/build";
import {
  enqueueResponseSchema,
  type EnqueueResponse,
} from "@/lib/validators/jobs";

// Server-side client for the worker's internal API (services/worker/app/main.py). Only Route
// Handlers and server actions call it; the browser never talks to the worker directly.

const workerUrl = z
  .url()
  .parse(process.env.WORKER_API_URL ?? "http://localhost:8000")
  .replace(/\/$/, "");

export class WorkerError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const UNREACHABLE =
  "The job service isn't reachable right now. Try again in a moment.";

/** FastAPI error bodies: {detail: string} or {detail: [{msg}]} for validation errors. */
function detailMessage(body: unknown): string | undefined {
  const detail = (body as { detail?: unknown } | null)?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const first = detail[0] as { msg?: unknown } | undefined;
    if (typeof first?.msg === "string") return first.msg;
  }
  return undefined;
}

async function postToWorker<T>(
  path: string,
  accessToken: string,
  body: unknown,
  schema: z.ZodType<T>,
  failure: string,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${workerUrl}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new WorkerError(
      process.env.NODE_ENV === "development"
        ? `${UNREACHABLE} (Local dev: is the worker running? pnpm dev starts it.)`
        : UNREACHABLE,
      503,
    );
  }
  const json: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new WorkerError(detailMessage(json) ?? failure, response.status);
  }
  return schema.parse(json);
}

export function startWorkerJob(
  accessToken: string,
  body: { org_id: string; kind: string; payload: Record<string, unknown> },
): Promise<EnqueueResponse> {
  return postToWorker(
    "/jobs",
    accessToken,
    body,
    enqueueResponseSchema,
    "Could not start the job.",
  );
}

/** Creates a build and queues its pipeline job (worker POST /builds). */
export function startBuild(
  accessToken: string,
  body: {
    org_id: string;
    template_id: string;
    brand_id: string;
    product_id: string;
    wizard?: Record<string, unknown>;
  },
): Promise<BuildCreated> {
  return postToWorker(
    "/builds",
    accessToken,
    body,
    buildCreatedSchema,
    "Could not start the build.",
  );
}
