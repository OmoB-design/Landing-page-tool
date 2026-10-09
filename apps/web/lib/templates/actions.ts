"use server";

import { WorkerError, copyLibraryTemplate } from "@/lib/api/worker";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

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
