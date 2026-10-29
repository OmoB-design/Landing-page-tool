import { getIntegrations, getTrash } from "@/lib/api/worker";
import { createClient } from "@/lib/supabase/server";

/** The org's connections and testing switch, or null when the worker can't be reached. */
export async function loadIntegrations(orgId: string) {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return null;
  return getIntegrations(session.access_token, orgId).catch(() => null);
}

/** The workspace's Trash, or null when the worker can't be reached. */
export async function loadTrash(orgId: string) {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return null;
  return getTrash(session.access_token, orgId).catch(() => null);
}
