// Plain labelled input for the B0.2 auth forms. Replaced by shadcn Form/Input in B0.3.
type AuthFieldProps = {
  name: string;
  /** Defaults to `name`. Set it when two forms on one page share a field name. */
  id?: string;
  label: string;
  type?: "text" | "email" | "password";
  autoComplete: string;
  defaultValue?: string;
  errors?: string[];
};

export function AuthField({
  name,
  id = name,
  label,
  type = "text",
  autoComplete,
  defaultValue,
  errors,
}: AuthFieldProps) {
  const errorId = `${id}-error`;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="font-medium">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        autoComplete={autoComplete}
        defaultValue={defaultValue}
        aria-invalid={errors ? true : undefined}
        aria-describedby={errors ? errorId : undefined}
        className="rounded border px-3 py-2"
      />
      {errors ? (
        <p id={errorId} role="alert">
          {errors[0]}
        </p>
      ) : null}
    </div>
  );
}
