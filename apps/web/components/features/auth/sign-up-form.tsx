"use client";

import { FieldGroup } from "@/components/ui/field";
import { signUp } from "@/lib/auth/actions";
import type { AuthFormState } from "@/lib/auth/form-state";
import { useActionForm } from "@/lib/forms/use-action-form";
import { signUpSchema } from "@/lib/validators/auth";

import { AuthTextField } from "./auth-text-field";
import { FormStatus, SubmitButton } from "./form-status";

const initialState: AuthFormState = {};

export function SignUpForm() {
  const { form, state, pending, formProps } = useActionForm({
    schema: signUpSchema,
    action: signUp,
    initialState,
    defaultValues: { fullName: "", email: "", password: "" },
  });
  const { errors } = form.formState;

  return (
    <form {...formProps} aria-label="Create your account">
      <FieldGroup className="gap-4">
        <AuthTextField
          id="fullName"
          label="Your name"
          autoComplete="name"
          description="Your workspace is named after you."
          registration={form.register("fullName")}
          error={errors.fullName?.message ?? state.fieldErrors?.fullName?.[0]}
        />
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
          autoComplete="new-password"
          description="At least 8 characters."
          registration={form.register("password")}
          error={errors.password?.message ?? state.fieldErrors?.password?.[0]}
        />
        <FormStatus error={state.error} message={state.message} />
        <SubmitButton
          pending={pending}
          label="Create account"
          pendingLabel="Creating account…"
        />
      </FieldGroup>
    </form>
  );
}
