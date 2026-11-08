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
import { AVATAR_BUCKET, avatarUrl } from "@/lib/account/avatar";
import {
  type AccountResult,
  type AvatarResult,
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

const PHOTO_TYPES: Record<string, string> = {
  "image/webp": "webp",
  "image/jpeg": "jpg",
  "image/png": "png",
};
const PHOTO_FAILED = "Your photo couldn’t be saved. Try again.";

/**
 * Your profile photo (B6.7, D139): the square the browser made (`photo`, a few tens of KB) goes
 * into your folder of the avatars bucket under a new name, your profile points at it, and the
 * photo it replaces is deleted. Storage and the profile only allow your own folder.
 */
export async function saveAvatar(form: FormData): Promise<AvatarResult> {
  const photo = form.get("photo");
  if (!(photo instanceof Blob) || photo.size === 0)
    return { ok: false, error: "Choose a picture." };
  const ext = PHOTO_TYPES[photo.type];
  if (!ext || photo.size > 512 * 1024)
    return { ok: false, error: "That picture couldn’t be used. Try another." };
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims.sub;
  if (!userId) redirect("/sign-in");

  const path = `${userId}/${crypto.randomUUID().replaceAll("-", "")}.${ext}`;
  const bucket = supabase.storage.from(AVATAR_BUCKET);
  const { error: uploadError } = await bucket.upload(path, photo, {
    contentType: photo.type,
    cacheControl: "31536000",
    upsert: false,
  });
  if (uploadError) return { ok: false, error: PHOTO_FAILED };
  const { data: before } = await supabase
    .from("profiles")
    .select("avatar_url")
    .eq("user_id", userId)
    .maybeSingle();
  const { error } = await supabase
    .from("profiles")
    .update({ avatar_url: path })
    .eq("user_id", userId);
  if (error) {
    await bucket.remove([path]);
    return { ok: false, error: PHOTO_FAILED };
  }
  if (before?.avatar_url && before.avatar_url !== path)
    await bucket.remove([before.avatar_url]);
  refresh();
  return { ok: true, url: avatarUrl(path) };
}

/** Removes your profile photo: the profile forgets it and the file is deleted. */
export async function removeAvatar(): Promise<AvatarResult> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims.sub;
  if (!userId) redirect("/sign-in");
  const { data: before } = await supabase
    .from("profiles")
    .select("avatar_url")
    .eq("user_id", userId)
    .maybeSingle();
  const { error } = await supabase
    .from("profiles")
    .update({ avatar_url: null })
    .eq("user_id", userId);
  if (error)
    return { ok: false, error: "Your photo couldn’t be removed. Try again." };
  if (before?.avatar_url)
    await supabase.storage.from(AVATAR_BUCKET).remove([before.avatar_url]);
  refresh();
  return { ok: true, url: null };
}
