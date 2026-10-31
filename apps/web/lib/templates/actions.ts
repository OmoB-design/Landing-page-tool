"use server";

import {
  WorkerError,
  analyseTemplate,
  confirmTemplateReview,
  copyLibraryTemplate,
  editTemplateLayout,
  getTemplateEditor,
  restoreTemplateVersion,
  saveTemplateInstructions,
  stepTemplate,
} from "@/lib/api/worker";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import {
  type LayoutAction,
  type TemplateDetails,
  type TemplateEditorState,
  type TemplateInstructions,
  layoutActionSchema,
  templateDetailsSchema,
  templateInstructionsSchema,
} from "@/lib/validators/template";

export type TemplateActionResult = { ok?: true; id?: string; error?: string };

/** "Use template": the worker copies a library template into the org (D61). */
export async function addTemplate(
  templateId: string,
): Promise<TemplateActionResult> {
  const { currentOrg } = await getSessionContext();
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return { error: "Your session has ended. Sign in again." };
  try {
    const template = await copyLibraryTemplate(session.access_token, {
      org_id: currentOrg.id,
      template_id: templateId,
    });
    return { ok: true, id: template.id };
  } catch (cause) {
    return {
      error:
        cause instanceof WorkerError
          ? cause.message
          : "Couldn't add the template.",
    };
  }
}

// ── Section editor (BUILD_SPEC §8.3) ─────────────────────────────────────────

export type EditorActionResult = {
  state?: TemplateEditorState;
  error?: string;
  /** The template changed in another tab or by someone else: reload to continue. */
  conflict?: boolean;
};

async function editorCall(
  call: (accessToken: string, orgId: string) => Promise<TemplateEditorState>,
): Promise<EditorActionResult> {
  const { currentOrg } = await getSessionContext();
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return { error: "Your session has ended. Sign in again." };
  try {
    return { state: await call(session.access_token, currentOrg.id) };
  } catch (cause) {
    if (cause instanceof WorkerError)
      return { error: cause.message, conflict: cause.status === 409 };
    return { error: "Couldn't save the change." };
  }
}

/** Reorders, removes, duplicates or renames a section (a new version; worker, D63). */
export async function editTemplate(
  templateId: string,
  baseVersion: number,
  action: LayoutAction,
): Promise<EditorActionResult> {
  const parsed = layoutActionSchema.safeParse(action);
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? "Invalid change." };
  return editorCall((token, orgId) =>
    editTemplateLayout(token, templateId, {
      org_id: orgId,
      base_version: baseVersion,
      action: parsed.data,
    }),
  );
}

export async function undoTemplate(
  templateId: string,
  baseVersion: number,
): Promise<EditorActionResult> {
  return editorCall((token, orgId) =>
    stepTemplate(token, templateId, "undo", {
      org_id: orgId,
      base_version: baseVersion,
    }),
  );
}

export async function redoTemplate(
  templateId: string,
  baseVersion: number,
): Promise<EditorActionResult> {
  return editorCall((token, orgId) =>
    stepTemplate(token, templateId, "redo", {
      org_id: orgId,
      base_version: baseVersion,
    }),
  );
}

export async function restoreTemplate(
  templateId: string,
  baseVersion: number,
  version: number,
): Promise<EditorActionResult> {
  return editorCall((token, orgId) =>
    restoreTemplateVersion(token, templateId, {
      org_id: orgId,
      base_version: baseVersion,
      version,
    }),
  );
}

/** Renames a template or changes its description (not versioned: the page doesn't change). */
export async function saveTemplateDetails(
  templateId: string,
  details: TemplateDetails,
): Promise<TemplateActionResult> {
  const parsed = templateDetailsSchema.safeParse(details);
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? "Check the details." };
  const { currentOrg } = await getSessionContext();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("templates")
    .update({
      name: parsed.data.name,
      description: parsed.data.description || null,
    })
    .eq("id", templateId)
    .eq("org_id", currentOrg.id)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();
  if (error) return { error: `Couldn't save: ${error.message}` };
  if (!data) return { error: "That template no longer exists." };
  return { ok: true };
}

// ── Clones: analysis and review (B2.2) ───────────────────────────────────────

/** The editor's state again, after an analysis finished in the background. */
export async function reloadTemplate(
  templateId: string,
): Promise<EditorActionResult> {
  return editorCall((token, orgId) =>
    getTemplateEditor(token, orgId, templateId),
  );
}

/** Confirms a clone's analysis: pages can be built from it from now on. */
export async function confirmAnalysis(
  templateId: string,
  baseVersion: number,
): Promise<EditorActionResult> {
  return editorCall((token, orgId) =>
    confirmTemplateReview(token, templateId, {
      org_id: orgId,
      base_version: baseVersion,
    }),
  );
}

/** Saves the template's rules (forbidden terms, copy and image rules, kept images). */
export async function saveRules(
  templateId: string,
  instructions: TemplateInstructions,
): Promise<EditorActionResult> {
  const parsed = templateInstructionsSchema.safeParse(instructions);
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? "Check the rules." };
  return editorCall((token, orgId) =>
    saveTemplateInstructions(token, templateId, {
      org_id: orgId,
      instructions: parsed.data,
    }),
  );
}

/** Analyse again: one Claude call (a few cents). Returns the job to follow. */
export async function startAnalysis(
  templateId: string,
): Promise<{ jobId?: string; error?: string }> {
  const { currentOrg } = await getSessionContext();
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return { error: "Your session has ended. Sign in again." };
  try {
    const { job } = await analyseTemplate(
      session.access_token,
      currentOrg.id,
      templateId,
    );
    return { jobId: job.id };
  } catch (cause) {
    return {
      error:
        cause instanceof WorkerError
          ? cause.message
          : "Couldn't start the analysis.",
    };
  }
}
