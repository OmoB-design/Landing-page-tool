"use server";

import {
  createClient as createStandaloneClient,
  isAuthError,
} from "@supabase/supabase-js";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";

import { authErrorMessage } from "@/lib/auth/errors";
import { publicEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import {
  type AccountResult,
  displayNameSchema,
  type PasswordChange,
  passwordChangeSchema,
} from "@/lib/validators/account";

/** Settings → Account (B6.2, D130). */

/** Your name: profiles.display_name, which the sidebar, Members and invites show. */
export async function saveDisplayName(input: {
  name: string;
}): Promise<AccountResult> {
  const parsed = displayNameSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Check your name.",
      field: "name",
    };
  }
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims.sub;
  if (!userId) redirect("/sign-in");

  // Only the name and the current workspace can be changed this way (D130).
  const { data: saved, error } = await supabase
    .from("profiles")
    .update({ display_name: parsed.data.name })
    .eq("user_id", userId)
    .select("user_id");
  if (error) {
    console.error("[account] saving the name failed", error);
    return { ok: false, error: "Your name couldn’t be saved. Try again." };
  }
  if (!saved.length) {
    return { ok: false, error: "Your profile couldn’t be found." };
  }
  refresh(); // the sidebar shows the new name
  return { ok: true };
}

/**
 * A new password, once the current one checks out. The check signs in on a client of its own,
 * so a wrong password can't touch this browser's session; the change is made on this browser's
 * session, which stays signed in while Supabase signs out the others.
 */
export async function changePassword(
  input: PasswordChange,
): Promise<AccountResult> {
  const parsed = passwordChangeSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      error: issue?.message ?? "Check the passwords.",
      field: issue?.path[0] === "current" ? "current" : "next",
    };
  }
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims.sub) redirect("/sign-in");
  const email = data.claims.email;
  if (!email) {
    return { ok: false, error: "Your account has no email to check against." };
  }

  const checker = createStandaloneClient(
    publicEnv.supabaseUrl,
    publicEnv.supabasePublishableKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );
  const check = await checker.auth.signInWithPassword({
    email,
    password: parsed.data.current,
  });
  if (check.error) {
    if (check.error.code === "invalid_credentials") {
      return {
        ok: false,
        error: "That isn’t your current password.",
        field: "current",
      };
    }
    return failure(check.error);
  }
  // The check made a session of its own: end that one only.
  await checker.auth.signOut({ scope: "local" });

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.next,
  });
  if (error) return failure(error);
  return { ok: true };
}

function failure(error: unknown): AccountResult {
  console.error("[account] changing the password failed", error);
  const code = isAuthError(error) ? error.code : undefined;
  switch (code) {
    case "same_password":
      return {
        ok: false,
        error: "Choose a password you haven’t been using.",
        field: "next",
      };
    case "weak_password":
      return {
        ok: false,
        error: authErrorMessage(error, "sign-up"),
        field: "next",
      };
    case "reauthentication_needed":
      return {
        ok: false,
        error:
          "For your safety, sign out and back in, then change your password.",
      };
    default:
      return { ok: false, error: authErrorMessage(error, "sign-in") };
  }
}
