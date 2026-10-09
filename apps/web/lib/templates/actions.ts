"use server";

import {
  WorkerError,
  copyLibraryTemplate,
  editTemplateLayout,
  restoreTemplateVersion,
  stepTemplate,
} from "@/lib/api/worker";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import {
  type LayoutAction,
  type TemplateDetails,
  type TemplateEditorState,
  layoutActionSchema,
  templateDetailsSchema,
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

/** Removes one of the org's templates (soft delete; builds made from it keep working). */
export async function deleteTemplate(
  templateId: string,
): Promise<TemplateActionResult> {
  const { currentOrg } = await getSessionContext();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("templates")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", templateId)
    .eq("org_id", currentOrg.id)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();
  if (error) return { error: `Couldn't delete the template: ${error.message}` };
  if (!data) return { error: "That template no longer exists." };
  return { ok: true };
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
