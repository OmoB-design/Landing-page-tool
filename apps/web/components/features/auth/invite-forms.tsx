"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { signOutToInvite, signUpWithInvite } from "@/lib/auth/actions";
import type { AuthFormState } from "@/lib/auth/form-state";
import { useActionForm } from "@/lib/forms/use-action-form";
import { type JoinState, joinFromInvite } from "@/lib/members/actions";
import { signUpSchema } from "@/lib/validators/auth";

import { AuthTextField } from "./auth-text-field";
import { FormStatus, SubmitButton } from "./form-status";

const initialState: AuthFormState = {};

/** Someone new: their name and a password; the email is the invite's (B6.1, D129). */
export function InviteSignUpForm({
  token,
  email,
}: {
  token: string;
  email: string;
}) {
  const { form, state, pending, formProps } = useActionForm({
    schema: signUpSchema,
    action: signUpWithInvite,
    initialState,
    defaultValues: { fullName: "", email, password: "" },
  });
  const { errors } = form.formState;
  return (
    <form {...formProps} aria-label="Create your account and join">
      <input type="hidden" name="invite" value={token} />
      <input type="hidden" {...form.register("email")} />
      <FieldGroup className="gap-4">
        <p className="text-type-body-small text-sub-text">
          Creating an account for{" "}
          <span className="font-medium text-heading-01">{email}</span>
        </p>
        <AuthTextField
          id="fullName"
          label="Your name"
          autoComplete="name"
          registration={form.register("fullName")}
          error={errors.fullName?.message ?? state.fieldErrors?.fullName?.[0]}
        />
        <AuthTextField
          id="password"
          label="Password"
          type="password"
          autoComplete="new-password"
          description="At least 8 characters."
          registration={form.register("password")}
          error={errors.password?.message ?? state.fieldErrors?.password?.[0]}
        />
        <FormStatus error={state.error} message={state.message} />
        <SubmitButton
          pending={pending}
          label="Create account and join"
          pendingLabel="Joining…"
        />
      </FieldGroup>
    </form>
  );
}

/** Signed in with the invited email: one button. */
export function JoinForm({
  token,
  workspace,
}: {
  token: string;
  workspace: string;
}) {
  const [state, action, pending] = useActionState<JoinState, FormData>(
    joinFromInvite,
    {},
  );
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="invite" value={token} />
      {state.error ? (
        <p role="alert" className="text-type-body-small text-destructive">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? <Spinner className="size-3.5" label="Joining" /> : null}
        {`Join ${workspace}`}
      </Button>
    </form>
  );
}

/** Signed in as someone else: sign out, then come back to the invite. */
export function SwitchAccountForm({ token }: { token: string }) {
  return (
    <form action={signOutToInvite} className="flex flex-col">
      <input type="hidden" name="invite" value={token} />
      <Button type="submit" variant="outline" className="w-full">
        Sign out and use that email
      </Button>
    </form>
  );
}
