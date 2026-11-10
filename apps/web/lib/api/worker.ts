import { z } from "zod";

import {
  type BatchCreated,
  type BatchState,
  type BuildCreated,
  type BuildSummary,
  type FolderColor,
  batchCreatedSchema,
  batchFolderSchema,
  batchStateSchema,
  buildCreatedSchema,
  buildSummarySchema,
} from "@/lib/validators/build";
import {
  type Analytics,
  type AnalyticsRange,
  analyticsSchema,
} from "@/lib/validators/analytics";
import {
  type TrashKind,
  type TrashState,
  trashStateSchema,
} from "@/lib/validators/trash";
import {
  type DeskAction,
  type DeskState,
  type PageParts,
  deskStateSchema,
  pagePartsSchema,
} from "@/lib/validators/desk";
import {
  type AgentRateInput,
  type AgentRequestInput,
  type AgentStart,
  type AgentThread,
  type AgentThreadSummary,
  agentStartSchema,
  agentThreadSchema,
  agentThreadsSchema,
} from "@/lib/validators/agent";
import {
  type ImageAction,
  type ImageAiInput,
  type ImageJob,
  type ImageStudio,
  imageJobSchema,
  type UploadedImage,
  imageStudioSchema,
  matchStartedSchema,
  uploadedImageSchema,
} from "@/lib/validators/images";
import {
  type QaStarted,
  type QaState,
  qaStartedSchema,
  qaStateSchema,
} from "@/lib/validators/qa";
import {
  type ReviewInfo,
  type ShareState,
  reviewInfoSchema,
  shareStateSchema,
} from "@/lib/validators/share";
import {
  type InviteInfo,
  type MembersState,
  type Role,
  acceptedSchema,
  inviteInfoSchema,
  membersStateSchema,
} from "@/lib/validators/members";
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
  type TemplateInstructions,
  templateEditorSchema,
} from "@/lib/validators/template";
import {
  enqueueResponseSchema,
  type EnqueueResponse,
} from "@/lib/validators/jobs";
import {
  type CloneRequest,
  type CloneTermsState,
  cloneStartedSchema,
  cloneTermsStateSchema,
} from "@/lib/validators/clone";

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
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  accessToken: string,
  body: unknown,
  schema: z.ZodType<T>,
  failure: string,
  timeoutMs = 10_000,
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
      signal: AbortSignal.timeout(timeoutMs),
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
  timeoutMs?: number,
): Promise<T> {
  return callWorker(
    "POST",
    path,
    accessToken,
    body,
    schema,
    failure,
    timeoutMs,
  );
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

/** A page from each chosen template for one product, all started or none (B3.5; worker POST
 * /builds/batch). */
export function startBatch(
  accessToken: string,
  body: {
    org_id: string;
    template_ids: string[];
    brand_id: string;
    product_id: string;
    wizard?: Record<string, unknown>;
  },
): Promise<BatchCreated> {
  return postToWorker(
    "/builds/batch",
    accessToken,
    body,
    batchCreatedSchema,
    "Could not start the pages.",
  );
}

/** A batch's pages and how each is getting on (B3.5; worker GET /builds/batch/{id}). */
export function getBatch(
  accessToken: string,
  orgId: string,
  batchId: string,
): Promise<BatchState> {
  return callWorker(
    "GET",
    `/builds/batch/${encodeURIComponent(batchId)}?org_id=${encodeURIComponent(orgId)}`,
    accessToken,
    undefined,
    batchStateSchema,
    "Couldn't load the batch.",
  );
}

/** Colours a batch's folder for the whole workspace (B3.5b). */
export function setBatchFolder(
  accessToken: string,
  orgId: string,
  batchId: string,
  folderColor: FolderColor,
): Promise<{ folder_color: FolderColor }> {
  return callWorker(
    "PATCH",
    `/builds/batch/${encodeURIComponent(batchId)}`,
    accessToken,
    { org_id: orgId, folder_color: folderColor },
    batchFolderSchema,
    "Couldn't change the folder's colour.",
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

/** A copy of a finished page as it is now, nested under the family's first page (B7.1, D144;
 * worker POST /builds/{id}/duplicate). */
export function duplicateBuild(
  accessToken: string,
  buildId: string,
  body: { org_id: string },
): Promise<BuildSummary> {
  return postToWorker(
    `/builds/${encodeURIComponent(buildId)}/duplicate`,
    accessToken,
    body,
    buildSummarySchema,
    "Couldn't duplicate the page.",
  );
}

// ── Review desk (worker /builds/{id}/…, BUILD_SPEC §11.1, D84) ────────────────

/** A finished build's desk: status and version, every sentence, the snapshots. */
/** Each section's parts for the page editor's tree (B4.4, D123). */
export function getBuildParts(
  accessToken: string,
  orgId: string,
  buildId: string,
): Promise<PageParts> {
  return callWorker(
    "GET",
    `/builds/${encodeURIComponent(buildId)}/parts?org_id=${encodeURIComponent(orgId)}`,
    accessToken,
    undefined,
    pagePartsSchema,
    "Could not list the page's parts.",
  );
}

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

// ── The client review link (worker /builds/{id}/share, /review/{token}; B3.6, D119) ──

function sharePath(orgId: string, buildId: string, withOrg: boolean): string {
  const path = `/builds/${encodeURIComponent(buildId)}/share`;
  return withOrg ? `${path}?org_id=${encodeURIComponent(orgId)}` : path;
}

/** The page's client link and what it shows. */
export function getShare(
  accessToken: string,
  orgId: string,
  buildId: string,
): Promise<ShareState> {
  return callWorker(
    "GET",
    sharePath(orgId, buildId, true),
    accessToken,
    undefined,
    shareStateSchema,
    "Couldn't load the client link.",
  );
}

/** Makes the page's client link (or gives the live one). */
export function makeShare(
  accessToken: string,
  orgId: string,
  buildId: string,
): Promise<ShareState> {
  return callWorker(
    "POST",
    sharePath(orgId, buildId, false),
    accessToken,
    { org_id: orgId },
    shareStateSchema,
    "Couldn't make the client link.",
  );
}

/** Turns the page's client link off at once. */
export function turnOffShare(
  accessToken: string,
  orgId: string,
  buildId: string,
): Promise<ShareState> {
  return callWorker(
    "DELETE",
    sharePath(orgId, buildId, true),
    accessToken,
    undefined,
    shareStateSchema,
    "Couldn't turn the link off.",
  );
}

/** The client's page needs no sign-in: these carry only the link's token. Null when the link
 * isn't available (not one, expired or turned off). */
async function fromReviewLink(
  token: string,
  suffix: string,
): Promise<Response | null> {
  let response: Response;
  try {
    response = await fetch(
      `${workerUrl}/review/${encodeURIComponent(token)}${suffix}`,
      { cache: "no-store", signal: AbortSignal.timeout(10_000) },
    );
  } catch {
    throw new WorkerError(UNREACHABLE, 503);
  }
  if (response.status === 404) return null;
  if (!response.ok) {
    const json: unknown = await response.json().catch(() => null);
    throw new WorkerError(
      detailMessage(json) ?? "Couldn't open the page.",
      response.status,
    );
  }
  return response;
}

export async function getReviewInfo(token: string): Promise<ReviewInfo | null> {
  const response = await fromReviewLink(token, "");
  return response ? reviewInfoSchema.parse(await response.json()) : null;
}

export async function getReviewHtml(token: string): Promise<string | null> {
  const response = await fromReviewLink(token, "/html");
  return response ? response.text() : null;
}

// ── Members and invites (worker /orgs/{id}/members, /invites; B6.1, D129) ─────

function orgPath(orgId: string, rest: string): string {
  return `/orgs/${encodeURIComponent(orgId)}${rest}`;
}

/** Everyone in the workspace; open invites (with their tokens) for owners and admins. */
export function getMembers(
  accessToken: string,
  orgId: string,
): Promise<MembersState> {
  return callWorker(
    "GET",
    orgPath(orgId, "/members"),
    accessToken,
    undefined,
    membersStateSchema,
    "Couldn't load the members.",
  );
}

/** Invites an email with a role, or refreshes its open invite. */
export function inviteMember(
  accessToken: string,
  orgId: string,
  email: string,
  role: Role,
): Promise<MembersState> {
  return postToWorker(
    orgPath(orgId, "/invites"),
    accessToken,
    { email, role },
    membersStateSchema,
    "Couldn't make the invite.",
  );
}

export function revokeInvite(
  accessToken: string,
  orgId: string,
  inviteId: string,
): Promise<MembersState> {
  return callWorker(
    "DELETE",
    orgPath(orgId, `/invites/${encodeURIComponent(inviteId)}`),
    accessToken,
    undefined,
    membersStateSchema,
    "Couldn't turn the invite off.",
  );
}

export function changeMemberRole(
  accessToken: string,
  orgId: string,
  memberId: string,
  role: Role,
): Promise<MembersState> {
  return callWorker(
    "PATCH",
    orgPath(orgId, `/members/${encodeURIComponent(memberId)}`),
    accessToken,
    { role },
    membersStateSchema,
    "Couldn't change the role.",
  );
}

/** Removes someone, or leaves (oneself): then the answer is null. */
export function removeMember(
  accessToken: string,
  orgId: string,
  memberId: string,
): Promise<MembersState | null> {
  return callWorker(
    "DELETE",
    orgPath(orgId, `/members/${encodeURIComponent(memberId)}`),
    accessToken,
    undefined,
    membersStateSchema.nullable(),
    "Couldn't remove them.",
  );
}

/** The invite page's facts (no sign-in); null when the link isn't one of ours. */
export async function getInviteInfo(token: string): Promise<InviteInfo | null> {
  let response: Response;
  try {
    response = await fetch(
      `${workerUrl}/invites/${encodeURIComponent(token)}`,
      {
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      },
    );
  } catch {
    throw new WorkerError(UNREACHABLE, 503);
  }
  if (response.status === 404) return null;
  const json: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new WorkerError(
      detailMessage(json) ?? "Couldn't open the invite.",
      response.status,
    );
  }
  return inviteInfoSchema.parse(json);
}

/** Joins the signed-in person (with the invited email) to the invite's workspace. */
export function acceptInvite(accessToken: string, token: string) {
  return postToWorker(
    "/invites/accept",
    accessToken,
    { token },
    acceptedSchema,
    "Couldn't accept the invite.",
  );
}

// ── The preview check (worker /builds/{id}/qa, B3.3a, D111) ──────────────────

/** The page's preview check: screenshots, share image and link preview, and whether one runs. */
export function getQa(
  accessToken: string,
  orgId: string,
  buildId: string,
): Promise<QaState> {
  return callWorker(
    "GET",
    `/builds/${encodeURIComponent(buildId)}/qa?org_id=${encodeURIComponent(orgId)}`,
    accessToken,
    undefined,
    qaStateSchema,
    "Couldn't load the preview check.",
  );
}

/** Fix for phone (B3.3b): Claude's phone-only CSS for the page (a job; about 5 to 10 cents). */
export function startPhoneFix(
  accessToken: string,
  orgId: string,
  buildId: string,
): Promise<QaStarted> {
  return postToWorker(
    `/builds/${encodeURIComponent(buildId)}/phone-fix`,
    accessToken,
    { org_id: orgId },
    qaStartedSchema,
    "Couldn't start Fix for phone.",
  );
}

/** Starts a new preview check of the page (a job; free). */
export function startQa(
  accessToken: string,
  orgId: string,
  buildId: string,
): Promise<QaStarted> {
  return postToWorker(
    `/builds/${encodeURIComponent(buildId)}/qa`,
    accessToken,
    { org_id: orgId },
    qaStartedSchema,
    "Couldn't start the preview check.",
  );
}

// ── The image studio (worker /builds/{id}/images, B3.2a, D109) ──────────────

/** One image of a page: its details, what it can become, and its last five versions. */
export function getImageStudio(
  accessToken: string,
  orgId: string,
  buildId: string,
  number: number,
): Promise<ImageStudio> {
  return callWorker(
    "GET",
    `/builds/${encodeURIComponent(buildId)}/images/${number}?org_id=${encodeURIComponent(orgId)}`,
    accessToken,
    undefined,
    imageStudioSchema,
    "Couldn't load that image.",
  );
}

/** Replaces, crops or restores an image (one undoable change); returns the new desk. */
export function changeImage(
  accessToken: string,
  buildId: string,
  number: number,
  action: ImageAction,
  body: Record<string, unknown> & { org_id: string },
): Promise<DeskState> {
  return postToWorker(
    `/builds/${encodeURIComponent(buildId)}/images/${number}/${action}`,
    accessToken,
    body,
    deskStateSchema,
    "Couldn't change the image.",
  );
}

/** Starts an AI picture for an image (a job; it goes on the page when it's ready). */
export function startImageAi(
  accessToken: string,
  orgId: string,
  buildId: string,
  number: number,
  body: ImageAiInput,
): Promise<ImageJob> {
  return postToWorker(
    `/builds/${encodeURIComponent(buildId)}/images/${number}/ai`,
    accessToken,
    { ...body, org_id: orgId },
    imageJobSchema,
    "Couldn't start the picture.",
  );
}

/** Match product everywhere (B3.2c): a job that recreates the pictures the check found. */
export function startMatch(
  accessToken: string,
  orgId: string,
  buildId: string,
): Promise<{ job_id: string }> {
  return postToWorker(
    `/builds/${encodeURIComponent(buildId)}/images/match`,
    accessToken,
    { org_id: orgId },
    matchStartedSchema,
    "Couldn't start matching the product.",
  );
}

/** Stores a picture from the user's computer as one of the workspace's assets. */
export function uploadImage(
  accessToken: string,
  orgId: string,
  buildId: string,
  dataUrl: string,
): Promise<UploadedImage> {
  return postToWorker(
    `/builds/${encodeURIComponent(buildId)}/images/upload`,
    accessToken,
    { org_id: orgId, data_url: dataUrl },
    uploadedImageSchema,
    "Couldn't upload that picture.",
    30_000,
  );
}

// ── Lander, the page editor's agent (worker /builds/{id}/agent, B3.1c, D106) ──

/** A request to Lander: saved in its conversation and queued; returns the desk and the job. */
export function startAgent(
  accessToken: string,
  orgId: string,
  buildId: string,
  body: AgentRequestInput,
): Promise<AgentStart> {
  return postToWorker(
    `/builds/${encodeURIComponent(buildId)}/agent`,
    accessToken,
    { ...body, org_id: orgId },
    agentStartSchema,
    "Buddy couldn't start that.",
  );
}

/** The conversation with Lander about a page: the one named, or the newest. */
export function getAgentThread(
  accessToken: string,
  orgId: string,
  buildId: string,
  threadId?: string | null,
): Promise<AgentThread> {
  const thread = threadId ? `&thread_id=${encodeURIComponent(threadId)}` : "";
  return callWorker(
    "GET",
    `/builds/${encodeURIComponent(buildId)}/agent?org_id=${encodeURIComponent(orgId)}${thread}`,
    accessToken,
    undefined,
    agentThreadSchema,
    "Couldn't load the conversation with Buddy.",
  );
}

/** The page's conversations with Lander, newest first (Recents, B3.1e). */
export async function getAgentThreads(
  accessToken: string,
  orgId: string,
  buildId: string,
): Promise<AgentThreadSummary[]> {
  const body = await callWorker(
    "GET",
    `/builds/${encodeURIComponent(buildId)}/agent/threads?org_id=${encodeURIComponent(orgId)}`,
    accessToken,
    undefined,
    agentThreadsSchema,
    "Couldn't load the earlier conversations.",
  );
  return body.threads;
}

/** Restore page to here: the page as it was when one of Lander's requests was sent (one undoable
 * change); returns the new desk. */
export function restoreAgentPage(
  accessToken: string,
  orgId: string,
  buildId: string,
  body: { base_version: number; message_id: string },
): Promise<DeskState> {
  return postToWorker(
    `/builds/${encodeURIComponent(buildId)}/agent/restore`,
    accessToken,
    { ...body, org_id: orgId },
    deskStateSchema,
    "Couldn't restore the page.",
  );
}

/** Rates one of Lander's replies, or takes the rating back (B3.1e). */
export function rateAgentReply(
  accessToken: string,
  orgId: string,
  buildId: string,
  body: AgentRateInput,
): Promise<{ saved: boolean }> {
  return postToWorker(
    `/builds/${encodeURIComponent(buildId)}/agent/feedback`,
    accessToken,
    { ...body, org_id: orgId },
    z.object({ saved: z.boolean() }),
    "Couldn't save the rating.",
  );
}

/** Asks Lander's running request on a page to stop (it keeps what it did). */
export function stopAgent(
  accessToken: string,
  orgId: string,
  buildId: string,
): Promise<{ stopping: boolean }> {
  return postToWorker(
    `/builds/${encodeURIComponent(buildId)}/agent/stop`,
    accessToken,
    { org_id: orgId },
    z.object({ stopping: z.boolean() }),
    "Couldn't stop Buddy.",
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
    destination: "vercel" | "shopify_page" | "shopify_editable";
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
  destination: "vercel" | "shopify_page" | "shopify_editable" = "vercel",
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

/** A store's Theme Access password (B4.2, D121): checked with Shopify, kept in Vault. */
export function setThemeAccess(
  accessToken: string,
  body: { org_id: string; brand_id: string; password: string },
): Promise<IntegrationsState> {
  return postToWorker(
    "/integrations/shopify/theme-access",
    accessToken,
    body,
    integrationsStateSchema,
    "Could not save the Theme Access password.",
    30_000,
  );
}

export function removeThemeAccess(
  accessToken: string,
  orgId: string,
  brandId: string,
): Promise<IntegrationsState> {
  return callWorker(
    "DELETE",
    `/integrations/shopify/theme-access?org_id=${encodeURIComponent(orgId)}&brand_id=${encodeURIComponent(brandId)}`,
    accessToken,
    undefined,
    integrationsStateSchema,
    "Could not remove the Theme Access password.",
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

// ── Analytics (B1.6b) ────────────────────────────────────────────────────────

/** The workspace's AI spend and pages over 30 days, 90 days or 12 months. */
export function getAnalytics(
  accessToken: string,
  orgId: string,
  range: AnalyticsRange,
): Promise<Analytics> {
  return callWorker(
    "GET",
    `/analytics?org_id=${encodeURIComponent(orgId)}&range=${range}`,
    accessToken,
    undefined,
    analyticsSchema,
    "Could not load analytics.",
  );
}

/** The workspace's clone terms: accepted (when, by whom) and whether this user may accept. */
export function getCloneTerms(
  accessToken: string,
  orgId: string,
): Promise<CloneTermsState> {
  return callWorker(
    "GET",
    `/clone-terms?org_id=${encodeURIComponent(orgId)}`,
    accessToken,
    undefined,
    cloneTermsStateSchema,
    "Could not load the clone terms.",
  );
}

export function acceptCloneTerms(
  accessToken: string,
  orgId: string,
): Promise<CloneTermsState> {
  return postToWorker(
    "/clone-terms",
    accessToken,
    { org_id: orgId, accept: true },
    cloneTermsStateSchema,
    "Could not accept the clone terms.",
  );
}

/** Starts a `template_clone` job. Pasted HTML is saved to storage first, so allow it a minute. */
export function startClone(
  accessToken: string,
  orgId: string,
  request: CloneRequest,
) {
  return postToWorker(
    "/templates/clone",
    accessToken,
    {
      org_id: orgId,
      url: request.url || null,
      html: request.html?.trim() ? request.html : null,
      source_url: request.source_url || null,
      name: request.name || null,
      type: request.type,
    },
    cloneStartedSchema,
    "Could not start the clone.",
    60_000,
  );
}

/** Analyse again (B2.2): queues `template_analyze` for a clone (one Claude call). */
export function analyseTemplate(
  accessToken: string,
  orgId: string,
  templateId: string,
) {
  return postToWorker(
    `/templates/${encodeURIComponent(templateId)}/analyse`,
    accessToken,
    { org_id: orgId },
    cloneStartedSchema,
    "Could not start the analysis.",
  );
}

/** Check layout (B4.3, D122): a job comparing Shopify's render of the template with the page. */
export function checkTemplateLayout(
  accessToken: string,
  orgId: string,
  templateId: string,
) {
  return postToWorker(
    `/templates/${encodeURIComponent(templateId)}/shopify-check`,
    accessToken,
    { org_id: orgId },
    cloneStartedSchema,
    "Could not start the layout check.",
  );
}

/** Confirms a clone's analysis, so pages can be built from it. */
export function confirmTemplateReview(
  accessToken: string,
  templateId: string,
  body: { org_id: string; base_version: number },
): Promise<TemplateEditorState> {
  return postToWorker(
    `/templates/${encodeURIComponent(templateId)}/review`,
    accessToken,
    body,
    templateEditorSchema,
    "Could not confirm the analysis.",
  );
}

/** Saves a template's rules (the editor's Rules tab). */
export function saveTemplateInstructions(
  accessToken: string,
  templateId: string,
  body: { org_id: string; instructions: TemplateInstructions },
): Promise<TemplateEditorState> {
  return postToWorker(
    `/templates/${encodeURIComponent(templateId)}/instructions`,
    accessToken,
    body,
    templateEditorSchema,
    "Could not save the rules.",
  );
}
