"use client";

import { useActionState } from "react";

import { sendMagicLink, signIn } from "@/lib/auth/actions";
import type { AuthFormState } from "@/lib/auth/form-state";

import { AuthField } from "./auth-field";

const initialState: AuthFormState = {};

export function SignInForm() {
  const [state, signInAction, signingIn] = useActionState(signIn, initialState);
  const [linkState, magicLinkAction, sendingLink] = useActionState(
    sendMagicLink,
    initialState,
  );

  return (
    <div className="flex flex-col gap-8">
      <form action={signInAction} className="flex flex-col gap-4">
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
          autoComplete="current-password"
          errors={state.fieldErrors?.password}
        />
        {state.error ? <p role="alert">{state.error}</p> : null}
        <button
          type="submit"
          disabled={signingIn}
          className="rounded border px-3 py-2 font-medium"
        >
          {signingIn ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <form action={magicLinkAction} className="flex flex-col gap-4">
        <p className="font-medium">Or get a sign-in link by email</p>
        <AuthField
          name="email"
          id="magic-link-email"
          label="Email"
          type="email"
          autoComplete="email"
          defaultValue={linkState.values?.email}
          errors={linkState.fieldErrors?.email}
        />
        {linkState.error ? <p role="alert">{linkState.error}</p> : null}
        {linkState.message ? <p role="status">{linkState.message}</p> : null}
        <button
          type="submit"
          disabled={sendingLink}
          className="rounded border px-3 py-2 font-medium"
        >
          {sendingLink ? "Sending…" : "Email me a link"}
        </button>
      </form>
    </div>
  );
}
