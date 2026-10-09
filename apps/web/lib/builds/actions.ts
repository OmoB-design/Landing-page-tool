"use server";

import { WorkerError, startBuild } from "@/lib/api/worker";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { type CreatePageInput, createPageSchema } from "@/lib/validators/build";

export type StartBuildResult = { buildId?: string; error?: string };

/** The create wizard's last step (BUILD_SPEC §9): the worker creates the build with its key,
 * the wizard payload and targeting, and queues the pipeline (D57, D66). */
export async function createPage(
  input: CreatePageInput,
): Promise<StartBuildResult> {
  const parsed = createPageSchema.safeParse(input);
  if (!parsed.success)
    return { error: "Some choices are no longer valid. Check each step." };
  const { currentOrg } = await getSessionContext();
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return { error: "Your session has ended. Sign in again." };
  try {
    const { build } = await startBuild(session.access_token, {
      org_id: currentOrg.id,
      ...parsed.data,
    });
    return { buildId: build.id };
  } catch (cause) {
    return {
      error:
        cause instanceof WorkerError
          ? cause.message
          : "Couldn't start the build.",
    };
  }
}
