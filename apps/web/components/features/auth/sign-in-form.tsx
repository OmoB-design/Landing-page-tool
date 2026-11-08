"use client";

import { FieldGroup, FieldSeparator } from "@/components/ui/field";
import { sendMagicLink, signIn } from "@/lib/auth/actions";
import type { AuthFormState } from "@/lib/auth/form-state";
import { useActionForm } from "@/lib/forms/use-action-form";
import { magicLinkSchema, signInSchema } from "@/lib/validators/auth";

import { AuthTextField } from "./auth-text-field";
import { FormStatus, SubmitButton } from "./form-status";

const initialState: AuthFormState = {};

/** `next`: where to go once signed in (an invite brings people back to itself, B6.1). */
export function SignInForm({ next }: { next?: string }) {
  return (
    <div className="flex flex-col gap-5">
      <PasswordForm next={next} />
      <FieldSeparator>or</FieldSeparator>
      <MagicLinkForm next={next} />
    </div>
  );
}

function NextField({ next }: { next?: string }) {
  return next ? <input type="hidden" name="next" value={next} /> : null;
}

function PasswordForm({ next }: { next?: string }) {
  const { form, state, pending, formProps } = useActionForm({
    schema: signInSchema,
    action: signIn,
    initialState,
    defaultValues: { email: "", password: "" },
  });
  const { errors } = form.formState;

  return (
    <form {...formProps} aria-label="Sign in with password">
      <NextField next={next} />
      <FieldGroup className="gap-4">
        <AuthTextField
          id="email"
          label="Email"
          type="email"
          autoComplete="email"
          registration={form.register("email")}
          error={errors.email?.message ?? state.fieldErrors?.email?.[0]}
        />
        <AuthTextField
          id="password"
          label="Password"
          type="password"
          autoComplete="current-password"
          registration={form.register("password")}
          error={errors.password?.message ?? state.fieldErrors?.password?.[0]}
        />
        <FormStatus error={state.error} />
        <SubmitButton
          pending={pending}
          label="Sign in"
          pendingLabel="Signing in…"
        />
      </FieldGroup>
    </form>
  );
}

function MagicLinkForm({ next }: { next?: string }) {
  const { form, state, pending, formProps } = useActionForm({
    schema: magicLinkSchema,
    action: sendMagicLink,
    initialState,
    defaultValues: { email: "" },
  });
  const { errors } = form.formState;

  return (
    <form {...formProps} aria-label="Email me a sign-in link">
      <NextField next={next} />
      <FieldGroup className="gap-4">
        <AuthTextField
          id="magic-link-email"
          label="Email me a sign-in link"
          type="email"
          autoComplete="email"
          description="No password needed. The link works once."
          registration={form.register("email")}
          error={errors.email?.message ?? state.fieldErrors?.email?.[0]}
        />
        <FormStatus error={state.error} message={state.message} />
        <SubmitButton
          pending={pending}
          label="Email me a link"
          pendingLabel="Sending…"
          variant="outline"
        />
      </FieldGroup>
    </form>
  );
}
