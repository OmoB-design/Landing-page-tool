"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { WorkerError, getInviteInfo } from "@/lib/api/worker";
import { type AuthFlow, authErrorMessage } from "@/lib/auth/errors";
import { safeNext } from "@/lib/auth/next";
import type { AuthFormState } from "@/lib/auth/form-state";
import { publicEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import {
  magicLinkSchema,
  signInSchema,
  signUpSchema,
} from "@/lib/validators/auth";

const callbackUrl = `${publicEnv.appUrl}/auth/callback`;

/** Logs the raw error for the server log and returns the message the form shows. */
function failure(
  error: unknown,
  flow: AuthFlow,
  values: AuthFormState["values"],
): AuthFormState {
  console.error(`[auth] ${flow} failed`, error);
  return { error: authErrorMessage(error, flow), values };
}

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : undefined;
}

export async function signIn(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const values = { email: text(formData, "email") };
  const parsed = signInSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success)
    return { fieldErrors: z.flattenError(parsed.error).fieldErrors, values };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return failure(error, "sign-in", values);

  redirect(safeNext(text(formData, "next")));
}

export async function signUp(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const values = {
    email: text(formData, "email"),
    fullName: text(formData, "fullName"),
  };
  const parsed = signUpSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success)
    return { fieldErrors: z.flattenError(parsed.error).fieldErrors, values };

  const { fullName, email, password } = parsed.data;
  const supabase = await createClient();
  // The on_auth_user_created trigger creates the user's org (named after full_name) and makes
  // them its owner.
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName }, emailRedirectTo: callbackUrl },
  });
  if (error) return failure(error, "sign-up", values);

  // With email confirmation off (local default) the user is signed in straight away.
  if (data.session) redirect("/home");
  return { message: "Check your email to confirm your account.", values };
}

export async function sendMagicLink(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const values = { email: text(formData, "email") };
  const parsed = magicLinkSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success)
    return { fieldErrors: z.flattenError(parsed.error).fieldErrors, values };

  const supabase = await createClient();
  const next = safeNext(text(formData, "next"));
  // Existing accounts only: new accounts go through sign-up so they get a name for their org.
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo:
        next === "/home"
          ? callbackUrl
          : `${callbackUrl}?next=${encodeURIComponent(next)}`,
    },
  });
  if (error) return failure(error, "magic-link", values);

  return { message: "Check your email for a sign-in link.", values };
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/sign-in");
}

/** Signs out and comes back to the invite (to accept it with another account). */
export async function signOutToInvite(formData: FormData): Promise<void> {
  const token = text(formData, "invite") ?? "";
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect(/^[A-Za-z0-9_-]{46}$/.test(token) ? `/invite/${token}` : "/sign-in");
}

/**
 * Sign-up from an invite (B6.1, D129): the invite must be open and for this email. The sign-up
 * names the invite, so the sign-up trigger puts the person straight into the workspace with the
 * invite's role instead of making them a workspace of their own.
 */
export async function signUpWithInvite(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const values = {
    email: text(formData, "email"),
    fullName: text(formData, "fullName"),
  };
  const parsed = signUpSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success)
    return { fieldErrors: z.flattenError(parsed.error).fieldErrors, values };
  const token = text(formData, "invite") ?? "";
  let invite;
  try {
    invite = await getInviteInfo(token);
  } catch (error) {
    return {
      error:
        error instanceof WorkerError
          ? error.message
          : "Couldn’t check the invite. Try again.",
      values,
    };
  }
  if (!invite || invite.status !== "open")
    return { error: "This invite isn’t available any more.", values };
  const email = parsed.data.email.toLowerCase();
  if (email !== invite.email)
    return { error: `This invite is for ${invite.email}.`, values };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.fullName, invite_id: invite.invite_id },
      emailRedirectTo: callbackUrl,
    },
  });
  if (error) {
    if (/already registered|already exists/i.test(error.message))
      return {
        error: "You already have an account with this email. Sign in to join.",
        values,
      };
    return failure(error, "sign-up", values);
  }
  if (data.session) redirect("/home");
  return { message: "Check your email to confirm your account.", values };
}
