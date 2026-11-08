"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  type KeyboardEvent,
  type ReactNode,
  useId,
  useRef,
  useState,
} from "react";
import { useForm } from "react-hook-form";

import { ThemeScene } from "@/components/app/illustrations/theme";
import { PersonMark } from "@/components/app/mark";
import { SkeletonMark, SkeletonText } from "@/components/app/skeletons";
import {
  setThemePreference,
  useThemePreference,
} from "@/components/app/theme-preference";
import { toast } from "@/components/app/toaster";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { changePassword, saveDisplayName } from "@/lib/account/actions";
import type { ThemePreference } from "@/lib/preferences";
import { useHydrated } from "@/lib/use-hydrated";
import { cn } from "@/lib/utils";
import {
  type PasswordChange,
  displayNameSchema,
  passwordChangeSchema,
} from "@/lib/validators/account";

import { SettingsDivider, SettingsPage } from "./settings-page";

const TITLE = "Account";
const DESCRIPTION = "Your name, your password, and how the app looks for you.";
const NAME_HINT = "Shown in the sidebar, on Members and on invites you send.";
const EMAIL_HINT = "You sign in with it. It can’t be changed yet.";
const THEME_HINT = "For this browser. Also in the account menu.";
const PASSWORD_HINT = "Change the password you sign in with.";
const NEW_HINT = "At least 8 characters.";
const THEMES: { value: ThemePreference; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

/**
 * Settings → Account (B6.2, D130; laid out as Quality's Account, B6.3, D131): your picture's
 * initial, your name (saved when you leave the field, as Quality does) and your sign-in email;
 * the theme as three pictures of the app; and Password as one row whose button opens the change.
 */
export function AccountSettings({
  name,
  email,
}: {
  name: string;
  email: string;
}) {
  return (
    <SettingsPage title={TITLE} description={DESCRIPTION}>
      <ProfileSection name={name} email={email} />
      <ThemeSection />
      <SettingsDivider />
      <PasswordSection email={email} />
    </SettingsPage>
  );
}

/**
 * Your initial, name and email, labels over full-width fields (Quality's Profile). The name saves
 * when you leave the field or press Enter; Escape puts it back.
 */
function ProfileSection({ name, email }: { name: string; email: string }) {
  const queryClient = useQueryClient();
  const ids = { name: useId(), email: useId(), error: useId() };
  const [saved, setSaved] = useState(name);
  const [value, setValue] = useState(name);
  const [error, setError] = useState<string | null>(null);
  // Escape blurs the field too; this keeps that blur from saving.
  const cancelled = useRef(false);
  const save = useMutation({
    mutationFn: (next: string) => saveDisplayName({ name: next }),
    onSuccess: (result, next) => {
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSaved(next);
      setValue(next);
      // Members shows names too.
      void queryClient.invalidateQueries({ queryKey: ["members"] });
      toast.success("Name saved");
    },
    onError: () => setError("Your name couldn’t be saved. Try again."),
  });
  const commit = () => {
    if (cancelled.current) {
      cancelled.current = false;
      return;
    }
    if (save.isPending) return;
    const parsed = displayNameSchema.safeParse({ name: value });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check your name.");
      return;
    }
    setError(null);
    if (parsed.data.name === saved) {
      setValue(saved);
      return;
    }
    save.mutate(parsed.data.name);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      event.currentTarget.blur();
    }
    if (event.key === "Escape") {
      event.preventDefault();
      cancelled.current = true;
      setValue(saved);
      setError(null);
      event.currentTarget.blur();
    }
  };
  return (
    <section aria-label="Profile" className="flex flex-col gap-6">
      <PersonMark name={saved} className="size-16 font-sans text-type-h4" />
      <Field data-invalid={error ? true : undefined}>
        <FieldLabel htmlFor={ids.name}>Name</FieldLabel>
        <Input
          id={ids.name}
          autoComplete="name"
          value={value}
          maxLength={120}
          readOnly={save.isPending}
          aria-busy={save.isPending || undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? ids.error : `${ids.name}-hint`}
          onChange={(event) => {
            setValue(event.target.value);
            if (error) setError(null);
          }}
          onBlur={commit}
          onKeyDown={onKeyDown}
        />
        {error ? (
          <FieldError id={ids.error}>{error}</FieldError>
        ) : (
          <FieldDescription id={`${ids.name}-hint`}>
            {NAME_HINT}
          </FieldDescription>
        )}
      </Field>
      <Field>
        <FieldLabel htmlFor={ids.email}>Email</FieldLabel>
        <Input
          id={ids.email}
          type="email"
          value={email}
          disabled
          readOnly
          aria-describedby={`${ids.email}-hint`}
        />
        <FieldDescription id={`${ids.email}-hint`}>
          {EMAIL_HINT}
        </FieldDescription>
      </Field>
    </section>
  );
}

/**
 * The theme as three pictures of the app (I5): System, Light, Dark. The chosen one has the open
 * dropdown's blue edge, 1.3 px (owner, B6.4), and halo (Spot-500-Blue, Shadow/Focus); hovering lights
 * the little window's dots in macOS's colours and runs a shimmer across its page (theme.css).
 * It applies at once. Nothing shows as chosen until the page knows this browser's choice.
 */
function ThemeSection({ inert = false }: { inert?: boolean }) {
  const id = useId();
  const theme = useThemePreference();
  const hydrated = useHydrated();
  return (
    <fieldset
      aria-describedby={`${id}-hint`}
      inert={inert || undefined}
      aria-hidden={inert || undefined}
    >
      <legend className="text-type-body-small font-medium text-heading-01">
        Theme
      </legend>
      <p
        id={`${id}-hint`}
        className="mt-0.5 text-type-caption-1 text-heading-05"
      >
        {THEME_HINT}
      </p>
      <div className="mt-4 grid grid-cols-3 gap-2">
        {THEMES.map((option) => (
          <ThemeCard
            key={option.value}
            name={`${id}-theme`}
            value={option.value}
            label={option.label}
            checked={!inert && hydrated && theme === option.value}
          />
        ))}
      </div>
    </fieldset>
  );
}

function ThemeCard({
  name,
  value,
  label,
  checked,
}: {
  name: string;
  value: ThemePreference;
  label: string;
  checked: boolean;
}) {
  return (
    <label className="ith-hover group flex min-w-0 cursor-pointer flex-col gap-2">
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={() => setThemePreference(value)}
        className="peer sr-only"
      />
      <span
        className={cn(
          "overflow-hidden rounded-lg border bg-surface-primary transition duration-150 ease-out peer-focus-visible:ring-2 peer-focus-visible:ring-ring",
          checked
            ? "border-spot-500-blue ring-chosen"
            : "border-stroke shadow-light group-hover:border-stroke-strong",
        )}
      >
        <ThemeScene theme={value} />
      </span>
      <span
        className={cn(
          "text-center text-type-caption-1",
          checked ? "font-medium text-heading-01" : "text-heading-04",
        )}
      >
        {label}
      </span>
    </label>
  );
}

/** Password as one row (Quality's sign-in rows): what it is on the left, the change on the right. */
function PasswordSection({ email }: { email: string }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  return (
    <section
      aria-labelledby={id}
      className="flex items-center justify-between gap-6"
    >
      <div className="min-w-0">
        <h2
          id={id}
          className="text-type-body-small font-medium text-heading-01"
        >
          Password
        </h2>
        <p className="mt-0.5 text-type-caption-1 text-heading-05">
          {PASSWORD_HINT}
        </p>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="shrink-0"
        onClick={() => setOpen(true)}
      >
        Change password
      </Button>
      <PasswordDialog open={open} onOpenChange={setOpen} email={email} />
    </section>
  );
}

/** A labelled field in a modal, as the connect modals draw them. */
function ModalField({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={htmlFor}
        className="text-type-caption-1 font-medium text-heading-02"
      >
        {label}
      </label>
      {children}
      {error ? (
        <p
          id={`${htmlFor}-error`}
          role="alert"
          className="text-type-caption-2 font-medium text-text-danger"
        >
          {error}
        </p>
      ) : hint ? (
        <p className="text-type-caption-2 text-heading-05">{hint}</p>
      ) : null}
    </div>
  );
}

/**
 * Change your password: the current one, then the new one twice. You stay signed in here; other
 * devices are signed out within the hour (D130).
 */
function PasswordDialog({
  open,
  onOpenChange,
  email,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  email: string;
}) {
  const ids = { current: useId(), next: useId(), confirm: useId() };
  const [failure, setFailure] = useState<string | null>(null);
  const form = useForm<PasswordChange>({
    resolver: zodResolver(passwordChangeSchema),
    defaultValues: { current: "", next: "", confirm: "" },
    mode: "onTouched",
  });
  const { errors } = form.formState;
  const close = () => {
    form.reset();
    setFailure(null);
    onOpenChange(false);
  };
  const change = useMutation({
    // Only the values go to the server action.
    mutationFn: (values: PasswordChange) => changePassword(values),
    onSuccess: (result) => {
      if (result.ok) {
        close();
        toast.success("Password changed", {
          description: "Other devices are signed out within the hour.",
        });
        return;
      }
      if (result.field === "current" || result.field === "next") {
        form.setError(
          result.field,
          { message: result.error },
          { shouldFocus: true },
        );
        return;
      }
      setFailure(result.error);
    },
    onError: () => setFailure("Your password couldn’t be changed. Try again."),
  });
  const field = (key: keyof PasswordChange, autoComplete: string) => ({
    id: ids[key],
    type: "password" as const,
    autoComplete,
    "aria-invalid": errors[key] ? true : undefined,
    "aria-describedby": errors[key] ? `${ids[key]}-error` : undefined,
    className: "h-8 px-2.5",
    ...form.register(key),
  });
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) onOpenChange(true);
        else if (!change.isPending) close();
      }}
    >
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-md">
        <form
          onSubmit={form.handleSubmit((values) => {
            setFailure(null);
            change.mutate(values);
          })}
          noValidate
          aria-label="Change your password"
          className="flex flex-col"
        >
          <div className="flex flex-col gap-6 px-6 pt-6 pb-6">
            <div className="flex flex-col gap-1">
              <DialogTitle className="text-type-body-small font-medium text-heading-01">
                Change your password
              </DialogTitle>
              <DialogDescription className="text-type-caption-1 text-heading-05">
                You stay signed in here. Other devices are signed out within the
                hour.
              </DialogDescription>
            </div>
            {/* For password managers: whose password this is. */}
            <input
              type="email"
              name="username"
              autoComplete="username"
              value={email}
              readOnly
              hidden
            />
            <ModalField
              label="Current password"
              htmlFor={ids.current}
              error={errors.current?.message}
            >
              <Input {...field("current", "current-password")} />
            </ModalField>
            <ModalField
              label="New password"
              htmlFor={ids.next}
              hint={NEW_HINT}
              error={errors.next?.message}
            >
              <Input {...field("next", "new-password")} />
            </ModalField>
            <ModalField
              label="Confirm new password"
              htmlFor={ids.confirm}
              error={errors.confirm?.message}
            >
              <Input {...field("confirm", "new-password")} />
            </ModalField>
          </div>
          <div className="flex items-center gap-2 px-6 py-4 divider-t-half">
            {failure ? (
              <p
                role="alert"
                className="min-w-0 flex-1 text-type-caption-1 font-medium text-text-danger"
              >
                {failure}
              </p>
            ) : (
              <span className="flex-1" />
            )}
            <Button
              type="button"
              variant="outline"
              size="compact"
              disabled={change.isPending}
              onClick={close}
            >
              Cancel
            </Button>
            <Button type="submit" size="compact" disabled={change.isPending}>
              {change.isPending ? (
                <Spinner className="size-3.5" label="Changing" />
              ) : null}
              Change password
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** An empty field while the page loads: the frame, and a short line where its value goes. */
function FieldFrame({
  value,
  muted = false,
}: {
  value: number;
  muted?: boolean;
}) {
  return (
    <span
      className={cn(
        "flex h-10.5 w-full items-center rounded-lg border px-3.5",
        muted
          ? "border-stroke-strong bg-foreground-02"
          : "border-stroke bg-surface-primary shadow-light",
      )}
    >
      <SkeletonText className="text-type-caption-1" width={value} />
    </span>
  );
}

/**
 * Account while it loads (D99, measured against the loaded page): the same sections, labels and
 * hints; your initial, name and email are shapes until they arrive; the theme pictures and the
 * Password row are themselves, with nothing chosen yet (as on the loaded page before it knows).
 */
export function AccountSettingsSkeleton() {
  return (
    <SettingsPage title={TITLE} description={DESCRIPTION}>
      <section aria-hidden className="flex flex-col gap-6">
        <SkeletonMark size={64} round />
        <Field>
          <FieldLabel>Name</FieldLabel>
          <FieldFrame value={96} />
          <FieldDescription>{NAME_HINT}</FieldDescription>
        </Field>
        <Field>
          <FieldLabel>Email</FieldLabel>
          <FieldFrame value={160} muted />
          <FieldDescription>{EMAIL_HINT}</FieldDescription>
        </Field>
      </section>
      <ThemeSection inert />
      <SettingsDivider />
      <section
        aria-hidden
        inert
        className="flex items-center justify-between gap-6"
      >
        <div className="min-w-0">
          <h2 className="text-type-body-small font-medium text-heading-01">
            Password
          </h2>
          <p className="mt-0.5 text-type-caption-1 text-heading-05">
            {PASSWORD_HINT}
          </p>
        </div>
        <Button variant="outline" size="sm" className="shrink-0" tabIndex={-1}>
          Change password
        </Button>
      </section>
    </SettingsPage>
  );
}
