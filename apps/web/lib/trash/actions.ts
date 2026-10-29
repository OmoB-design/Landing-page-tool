"use server";

import {
  WorkerError,
  deleteFromTrash,
  moveToTrash,
  restoreFromTrash,
} from "@/lib/api/worker";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import {
  type TrashKind,
  type TrashState,
  trashKindSchema,
} from "@/lib/validators/trash";

export type TrashActionResult = {
  ok?: boolean;
  /** The Trash after a restore or a delete for good. */
  state?: TrashState;
  error?: string;
};

async function call<T>(
  kind: TrashKind,
  id: string,
  run: (token: string, orgId: string) => Promise<T>,
  failure: string,
): Promise<{ value?: T; error?: string }> {
  if (!trashKindSchema.safeParse(kind).success) return { error: failure };
  const { currentOrg } = await getSessionContext();
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return { error: "Your session has ended. Sign in again." };
  try {
    return { value: await run(session.access_token, currentOrg.id) };
  } catch (cause) {
    return { error: cause instanceof WorkerError ? cause.message : failure };
  }
}

/** Moves a page, brand, product or template to Trash (D92). */
export async function trashItem(
  kind: TrashKind,
  id: string,
): Promise<TrashActionResult> {
  const result = await call(
    kind,
    id,
    (token, orgId) => moveToTrash(token, orgId, kind, id),
    "Couldn't move it to Trash.",
  );
  return result.error ? { error: result.error } : { ok: true };
}

export async function restoreItem(
  kind: TrashKind,
  id: string,
): Promise<TrashActionResult> {
  const result = await call(
    kind,
    id,
    (token, orgId) => restoreFromTrash(token, orgId, kind, id),
    "Couldn't restore it.",
  );
  return result.error
    ? { error: result.error }
    : { ok: true, state: result.value };
}

/** Deletes it for good (owners and admins). */
export async function deleteItemForGood(
  kind: TrashKind,
  id: string,
): Promise<TrashActionResult> {
  const result = await call(
    kind,
    id,
    (token, orgId) => deleteFromTrash(token, orgId, kind, id),
    "Couldn't delete it for good.",
  );
  return result.error
    ? { error: result.error }
    : { ok: true, state: result.value };
}
