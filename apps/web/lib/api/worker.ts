import { z } from "zod";

import { type BuildCreated, buildCreatedSchema } from "@/lib/validators/build";
import {
  type TrashKind,
  type TrashState,
  trashStateSchema,
} from "@/lib/validators/trash";
import {
  type DeskAction,
  type DeskState,
  deskStateSchema,
} from "@/lib/validators/desk";
import {
  type IntegrationsState,
  type PublishingState,
  type ShopifyTemplate,
  integrationsStateSchema,
  publishingStateSchema,
  shopifyTemplateSchema,
} from "@/lib/validators/publishing";
import {
  type LayoutAction,
  type TemplateEditorState,
  templateEditorSchema,
} from "@/lib/validators/template";
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

async function callWorker<T>(
  method: "GET" | "POST" | "DELETE",
  path: string,
  accessToken: string,
  body: unknown,
  schema: z.ZodType<T>,
  failure: string,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${workerUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
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

function postToWorker<T>(
  path: string,
  accessToken: string,
  body: unknown,
  schema: z.ZodType<T>,
  failure: string,
): Promise<T> {
  return callWorker("POST", path, accessToken, body, schema, failure);
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

/** Queues a failed build again; it resumes after its last finished step (worker POST
 * /builds/{id}/retry). */
export function retryBuild(
  accessToken: string,
  buildId: string,
  body: { org_id: string },
): Promise<BuildCreated> {
  return postToWorker(
    `/builds/${encodeURIComponent(buildId)}/retry`,
    accessToken,
    body,
    buildCreatedSchema,
    "Could not retry the build.",
  );
}

// ── Review desk (worker /builds/{id}/…, BUILD_SPEC §11.1, D84) ────────────────

/** A finished build's desk: status and version, every sentence, the snapshots. */
export function getBuildDesk(
  accessToken: string,
  orgId: string,
  buildId: string,
): Promise<DeskState> {
  return callWorker(
    "GET",
    `/builds/${encodeURIComponent(buildId)}/desk?org_id=${encodeURIComponent(orgId)}`,
    accessToken,
    undefined,
    deskStateSchema,
    "Could not open the page's desk.",
  );
}

/** The page with every sentence marked, for the desk's preview. */
export async function getBuildProof(
  accessToken: string,
  orgId: string,
  buildId: string,
): Promise<string> {
  let response: Response;
  try {
    response = await fetch(
      `${workerUrl}/builds/${encodeURIComponent(buildId)}/proof?org_id=${encodeURIComponent(orgId)}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      },
    );
  } catch {
    throw new WorkerError(UNREACHABLE, 503);
  }
  if (!response.ok) {
    const json: unknown = await response.json().catch(() => null);
    throw new WorkerError(
      detailMessage(json) ?? "Could not load the page.",
      response.status,
    );
  }
  return response.text();
}

/** One desk change (an edit, an approval, an undo or a restore); returns the new desk. */
export function changeBuildDesk(
  accessToken: string,
  buildId: string,
  action: DeskAction,
  body: Record<string, unknown> & { org_id: string },
): Promise<DeskState> {
  return postToWorker(
    `/builds/${encodeURIComponent(buildId)}/${action}`,
    accessToken,
    body,
    deskStateSchema,
    "Could not save the change.",
  );
}

const templateSummarySchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  type: z.string(),
  version: z.number(),
});

/** Copies a library template into the org (worker POST /templates/use). */
export function copyLibraryTemplate(
  accessToken: string,
  body: { org_id: string; template_id: string },
): Promise<z.infer<typeof templateSummarySchema>> {
  return postToWorker(
    "/templates/use",
    accessToken,
    body,
    templateSummarySchema,
    "Could not add the template.",
  );
}

// ── Section editor (worker /templates/{id}/…, BUILD_SPEC §8.3) ───────────────

/** Everything the section editor shows for one of the org's templates. */
export function getTemplateEditor(
  accessToken: string,
  orgId: string,
  templateId: string,
): Promise<TemplateEditorState> {
  return callWorker(
    "GET",
    `/templates/${encodeURIComponent(templateId)}/editor?org_id=${encodeURIComponent(orgId)}`,
    accessToken,
    undefined,
    templateEditorSchema,
    "Could not open the template.",
  );
}

type TemplateEditBody = { org_id: string; base_version: number };

/** One section edit (reorder, remove, duplicate, rename), saved as a new version. */
export function editTemplateLayout(
  accessToken: string,
  templateId: string,
  body: TemplateEditBody & { action: LayoutAction },
): Promise<TemplateEditorState> {
  return postToWorker(
    `/templates/${encodeURIComponent(templateId)}/layout`,
    accessToken,
    body,
    templateEditorSchema,
    "Could not save the change.",
  );
}

/** Undo or redo: moves the template to the previous or next saved version. */
export function stepTemplate(
  accessToken: string,
  templateId: string,
  direction: "undo" | "redo",
  body: TemplateEditBody,
): Promise<TemplateEditorState> {
  return postToWorker(
    `/templates/${encodeURIComponent(templateId)}/${direction}`,
    accessToken,
    body,
    templateEditorSchema,
    `Could not ${direction}.`,
  );
}

/** Makes an earlier version current again (saved as a new version). */
export function restoreTemplateVersion(
  accessToken: string,
  templateId: string,
  body: TemplateEditBody & { version: number },
): Promise<TemplateEditorState> {
  return postToWorker(
    `/templates/${encodeURIComponent(templateId)}/restore`,
    accessToken,
    body,
    templateEditorSchema,
    "Could not restore that version.",
  );
}

// ── Publishing (D87) ─────────────────────────────────────────────────────────

/** The org's Vercel connection (never the token) and the testing switch. */
export function getIntegrations(
  accessToken: string,
  orgId: string,
): Promise<IntegrationsState> {
  return callWorker(
    "GET",
    `/integrations?org_id=${encodeURIComponent(orgId)}`,
    accessToken,
    undefined,
    integrationsStateSchema,
    "Could not load the integrations.",
  );
}

/** Checks a Vercel token with Vercel and stores it in Vault. */
export function connectVercel(
  accessToken: string,
  body: { org_id: string; token: string; team_id?: string },
): Promise<IntegrationsState> {
  return postToWorker(
    "/integrations/vercel",
    accessToken,
    body,
    integrationsStateSchema,
    "Could not connect Vercel.",
  );
}

export function disconnectVercel(
  accessToken: string,
  orgId: string,
): Promise<IntegrationsState> {
  return callWorker(
    "DELETE",
    `/integrations/vercel?org_id=${encodeURIComponent(orgId)}`,
    accessToken,
    undefined,
    integrationsStateSchema,
    "Could not disconnect Vercel.",
  );
}

export function setTestingSwitch(
  accessToken: string,
  orgId: string,
  allow: boolean,
): Promise<IntegrationsState> {
  return postToWorker(
    `/orgs/${encodeURIComponent(orgId)}/testing`,
    accessToken,
    { allow_placeholder_publish: allow },
    integrationsStateSchema,
    "Could not change the setting.",
  );
}

/** What blocks publishing a build, its live page, a publish in progress and its history. */
export function getPublishing(
  accessToken: string,
  orgId: string,
  buildId: string,
): Promise<PublishingState> {
  return callWorker(
    "GET",
    `/builds/${encodeURIComponent(buildId)}/publishing?org_id=${encodeURIComponent(orgId)}`,
    accessToken,
    undefined,
    publishingStateSchema,
    "Could not load the page's publishing.",
  );
}

/** Queues a publish to Vercel (the worker checks the gate first). */
export function startPublish(
  accessToken: string,
  buildId: string,
  body: {
    org_id: string;
    base_version: number;
    destination: "vercel" | "shopify_page";
    override: boolean;
  },
): Promise<PublishingState> {
  return postToWorker(
    `/builds/${encodeURIComponent(buildId)}/publish`,
    accessToken,
    body,
    publishingStateSchema,
    "Could not start publishing.",
  );
}

/** Queues taking the page down from Vercel (D89; the brand's other pages stay up), or removing its
 * draft from the brand's Shopify store. */
export function startUnpublish(
  accessToken: string,
  buildId: string,
  orgId: string,
  destination: "vercel" | "shopify_page" = "vercel",
): Promise<PublishingState> {
  return postToWorker(
    `/builds/${encodeURIComponent(buildId)}/unpublish`,
    accessToken,
    { org_id: orgId, destination },
    publishingStateSchema,
    "Could not start unpublishing.",
  );
}

/** Checks a brand's store owner app with Shopify and keeps it (D90). */
export function connectShopify(
  accessToken: string,
  body: {
    org_id: string;
    brand_id: string;
    shop_domain: string;
    client_id: string;
    client_secret: string;
  },
): Promise<IntegrationsState> {
  return postToWorker(
    "/integrations/shopify",
    accessToken,
    body,
    integrationsStateSchema,
    "Could not connect the store.",
  );
}

export function disconnectShopify(
  accessToken: string,
  orgId: string,
  brandId: string,
): Promise<IntegrationsState> {
  return callWorker(
    "DELETE",
    `/integrations/shopify?org_id=${encodeURIComponent(orgId)}&brand_id=${encodeURIComponent(brandId)}`,
    accessToken,
    undefined,
    integrationsStateSchema,
    "Could not disconnect the store.",
  );
}

/** The full-width template's two files, for the store owner to add to their theme (D90). */
export function getShopifyTemplate(
  accessToken: string,
): Promise<ShopifyTemplate> {
  return callWorker(
    "GET",
    "/integrations/shopify/template",
    accessToken,
    undefined,
    shopifyTemplateSchema,
    "Could not load the template.",
  );
}

// ── Trash (B1.6a, D92) ───────────────────────────────────────────────────────

/** What's in the workspace's Trash (7 days), newest first. */
export function getTrash(
  accessToken: string,
  orgId: string,
): Promise<TrashState> {
  return callWorker(
    "GET",
    `/trash?org_id=${encodeURIComponent(orgId)}`,
    accessToken,
    undefined,
    trashStateSchema,
    "Could not load Trash.",
  );
}

/** Moves a page, brand, product or template to Trash (refused while a page is building or
 * published; a brand takes its pages and products with it). */
export function moveToTrash(
  accessToken: string,
  orgId: string,
  kind: TrashKind,
  id: string,
): Promise<null> {
  return postToWorker(
    `/trash/${kind}/${encodeURIComponent(id)}`,
    accessToken,
    { org_id: orgId },
    z.null(),
    "Could not move it to Trash.",
  );
}

export function restoreFromTrash(
  accessToken: string,
  orgId: string,
  kind: TrashKind,
  id: string,
): Promise<TrashState> {
  return postToWorker(
    `/trash/${kind}/${encodeURIComponent(id)}/restore`,
    accessToken,
    { org_id: orgId },
    trashStateSchema,
    "Could not restore it.",
  );
}

/** Deletes it for good, with its stored files (owners and admins). */
export function deleteFromTrash(
  accessToken: string,
  orgId: string,
  kind: TrashKind,
  id: string,
): Promise<TrashState> {
  return callWorker(
    "DELETE",
    `/trash/${kind}/${encodeURIComponent(id)}?org_id=${encodeURIComponent(orgId)}`,
    accessToken,
    undefined,
    trashStateSchema,
    "Could not delete it for good.",
  );
}
