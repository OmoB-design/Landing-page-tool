/** State returned by the auth server actions to their forms (useActionState). */
export type AuthFormState = {
  error?: string;
  message?: string;
  fieldErrors?: Partial<Record<string, string[]>>;
  /** Echoed back so the form keeps what the user typed after a failed submit. */
  values?: { email?: string; fullName?: string };
};
