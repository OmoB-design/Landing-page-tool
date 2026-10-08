import type { UseFormRegisterReturn } from "react-hook-form";

import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";

type AuthTextFieldProps = {
  /** Must be unique on the page; the input's name comes from `registration`. */
  id: string;
  label: string;
  type?: "text" | "email" | "password";
  autoComplete: string;
  registration: UseFormRegisterReturn;
  description?: string;
  error?: string;
};

/** A labelled input with its hint or error, wired for screen readers. */
export function AuthTextField({
  id,
  label,
  type = "text",
  autoComplete,
  registration,
  description,
  error,
}: AuthTextFieldProps) {
  const hintId = error ? `${id}-error` : description ? `${id}-hint` : undefined;
  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        type={type}
        autoComplete={autoComplete}
        aria-invalid={error ? true : undefined}
        aria-describedby={hintId}
        className="h-9"
        {...registration}
      />
      {error ? (
        <FieldError id={hintId}>{error}</FieldError>
      ) : description ? (
        <FieldDescription id={hintId}>{description}</FieldDescription>
      ) : null}
    </Field>
  );
}
