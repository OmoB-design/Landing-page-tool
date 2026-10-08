"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { type FormEvent, startTransition, useActionState } from "react";
import { type DefaultValues, type FieldValues, useForm } from "react-hook-form";
import type { z } from "zod";

type UseActionFormOptions<TValues extends FieldValues, TState> = {
  /** The same zod schema the server action validates with. */
  schema: z.ZodType<TValues, TValues>;
  action: (state: Awaited<TState>, formData: FormData) => Promise<TState>;
  initialState: Awaited<TState>;
  defaultValues: DefaultValues<TValues>;
};

/**
 * react-hook-form in front of a server action (DECISIONS.md D35). Fields are checked in the
 * browser with the action's own zod schema, so mistakes show before anything is sent; a valid
 * form is posted to the action as FormData. Without JavaScript the form still posts natively
 * and the action validates on the server.
 */
export function useActionForm<TValues extends FieldValues, TState>({
  schema,
  action,
  initialState,
  defaultValues,
}: UseActionFormOptions<TValues, TState>) {
  const [state, dispatch, pending] = useActionState(action, initialState);
  const form = useForm<TValues>({
    resolver: zodResolver(schema),
    defaultValues,
    mode: "onTouched",
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    const formElement = event.currentTarget;
    // handleSubmit prevents the native submit, so React does not also run `action`.
    void form.handleSubmit(() => {
      startTransition(() => dispatch(new FormData(formElement)));
    })(event);
  }

  return {
    form,
    state,
    pending,
    formProps: { action: dispatch, onSubmit, noValidate: true },
  };
}
