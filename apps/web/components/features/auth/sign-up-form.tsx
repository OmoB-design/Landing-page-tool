"use client";

import { useActionState } from "react";

import { signUp } from "@/lib/auth/actions";
import type { AuthFormState } from "@/lib/auth/form-state";

import { AuthField } from "./auth-field";

const initialState: AuthFormState = {};

export function SignUpForm() {
  const [state, signUpAction, signingUp] = useActionState(signUp, initialState);

  return (
    <form action={signUpAction} className="flex flex-col gap-4">
      <AuthField
        name="fullName"
        label="Your name"
        autoComplete="name"
        defaultValue={state.values?.fullName}
        errors={state.fieldErrors?.fullName}
      />
      <AuthField
        name="email"
        label="Email"
        type="email"
        autoComplete="email"
        defaultValue={state.values?.email}
        errors={state.fieldErrors?.email}
      />
      <AuthField
        name="password"
        label="Password"
        type="password"
        autoComplete="new-password"
        errors={state.fieldErrors?.password}
      />
      {state.error ? <p role="alert">{state.error}</p> : null}
      {state.message ? <p role="status">{state.message}</p> : null}
      <button
        type="submit"
        disabled={signingUp}
        className="rounded border px-3 py-2 font-medium"
      >
        {signingUp ? "Creating account…" : "Create account"}
      </button>
    </form>
  );
}
