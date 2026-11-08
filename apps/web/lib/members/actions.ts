"use server";

import { redirect } from "next/navigation";

import { WorkerError, acceptInvite } from "@/lib/api/worker";
import { createClient } from "@/lib/supabase/server";

export type JoinState = { error?: string };

/** Accepts an invite as the signed-in person (B6.1, D129), then opens the workspace. */
export async function joinFromInvite(
  _prev: JoinState,
  formData: FormData,
): Promise<JoinState> {
  const token = formData.get("invite");
  if (typeof token !== "string") return { error: "That invite isn’t valid." };
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session)
    redirect(`/sign-in?next=${encodeURIComponent(`/invite/${token}`)}`);
  try {
    await acceptInvite(session.access_token, token);
  } catch (error) {
    return {
      error:
        error instanceof WorkerError
          ? error.message
          : "Couldn’t accept the invite. Try again.",
    };
  }
  redirect("/home");
}
