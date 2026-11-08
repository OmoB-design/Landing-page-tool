"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, type ReactNode, useId, useState } from "react";
import { useForm } from "react-hook-form";

import { SkeletonButton, SkeletonText } from "@/components/app/skeletons";
import {
  setThemePreference,
  useThemePreference,
} from "@/components/app/theme-preference";
import { toast } from "@/components/app/toaster";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { changePassword, saveDisplayName } from "@/lib/account/actions";
import type { ThemePreference } from "@/lib/preferences";
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
const NEW_HINT = "At least 8 characters.";
const THEME_HINT = "For this browser. Also in the account menu.";
const THEMES: { value: ThemePreference; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];
const FIELD = "h-8 px-2.5";
// The buttons' widths, measured in the browser, for the skeleton.
const SAVE_WIDTH = 52.44;
const CHANGE_WIDTH = 134.5;

function SectionTitle({ children }: { children: string }) {
  return (
    <h2 className="text-type-body-small font-medium text-heading-01">
      {children}
    </h2>
  );
}

/**
 * A labelled row: the label and its hint on the left, lined up with the middle of the control
 * on the right; stacked on a phone. Errors go under the control.
 */
function Row({
  label,
  hint,
  htmlFor,
  wide = false,
  children,
}: {
  label: string;
  hint?: string;
  htmlFor?: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
      <div className="min-w-0 sm:pt-1.5">
        <label
          htmlFor={htmlFor}
          className="text-type-body-small font-medium text-heading-01"
        >
          {label}
        </label>
        {hint ? (
          <p className="mt-0.5 text-type-caption-1 text-heading-05">{hint}</p>
        ) : null}
      </div>
      <div
        className={
          wide
            ? "flex w-full flex-col gap-1 sm:w-72 sm:shrink-0"
            : "flex w-full flex-col gap-1 sm:w-60 sm:shrink-0"
        }
      >
        {children}
      </div>
    </div>
  );
}

function FieldError({ id, children }: { id: string; children?: string }) {
  if (!children) return null;
  return (
    <p id={id} role="alert" className="text-type-caption-1 text-destructive">
      {children}
    </p>
  );
}

/**
 * Settings → Account (B6.2, D130; no Figma frame yet, built in the settings pages' style, D88):
 * your name, your sign-in email (shown, not changeable yet), a new password once the current one
 * checks out, and the theme for this browser.
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
      <SettingsDivider />
      <PasswordSection email={email} />
      <SettingsDivider />
      <AppearanceSection />
    </SettingsPage>
  );
}

function ProfileSection({ name, email }: { name: string; email: string }) {
  const queryClient = useQueryClient();
  const ids = { name: useId(), error: useId() };
  const [saved, setSaved] = useState(name);
  const [value, setValue] = useState(name);
  const [error, setError] = useState<string | null>(null);
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
  const submit = (event: FormEvent) => {
    event.preventDefault();
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
  const changed = value.trim() !== saved;
  return (
    <section className="flex flex-col gap-4">
      <SectionTitle>Profile</SectionTitle>
      <form onSubmit={submit} noValidate aria-label="Your name">
        <Row label="Name" hint={NAME_HINT} htmlFor={ids.name} wide>
          <div className="flex gap-2">
            <Input
              id={ids.name}
              autoComplete="name"
              value={value}
              maxLength={120}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? ids.error : undefined}
              onChange={(event) => {
                setValue(event.target.value);
                if (error) setError(null);
              }}
              className={`${FIELD} flex-1`}
            />
            <Button
              type="submit"
              size="sm"
              className="h-8"
              disabled={!changed || save.isPending}
            >
              {save.isPending ? (
                <Spinner className="size-3.5" label="Saving" />
              ) : null}
              Save
            </Button>
          </div>
          <FieldError id={ids.error}>{error ?? undefined}</FieldError>
        </Row>
      </form>
      <Row label="Email" hint={EMAIL_HINT}>
        <span className="flex h-8 items-center truncate text-type-body-small text-heading-05 sm:justify-end">
          {email}
        </span>
      </Row>
    </section>
  );
}

function PasswordSection({ email }: { email: string }) {
  const ids = {
    current: useId(),
    next: useId(),
    confirm: useId(),
  };
  const form = useForm<PasswordChange>({
    resolver: zodResolver(passwordChangeSchema),
    defaultValues: { current: "", next: "", confirm: "" },
    mode: "onTouched",
  });
  const { errors } = form.formState;
  const change = useMutation({
    // Only the values go to the server action.
    mutationFn: (values: PasswordChange) => changePassword(values),
    onSuccess: (result) => {
      if (result.ok) {
        form.reset();
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
      toast.error(result.error);
    },
    onError: () => toast.error("Your password couldn’t be changed. Try again."),
  });
  const field = (key: keyof PasswordChange, autoComplete: string) => ({
    id: ids[key],
    type: "password" as const,
    autoComplete,
    "aria-invalid": errors[key] ? true : undefined,
    "aria-describedby": errors[key] ? `${ids[key]}-error` : undefined,
    className: FIELD,
    ...form.register(key),
  });
  return (
    <section className="flex flex-col gap-4">
      <SectionTitle>Password</SectionTitle>
      <form
        onSubmit={form.handleSubmit((values) => change.mutate(values))}
        noValidate
        aria-label="Change your password"
        className="flex flex-col gap-4"
      >
        {/* For password managers: whose password this is. */}
        <input
          type="email"
          name="username"
          autoComplete="username"
          value={email}
          readOnly
          hidden
        />
        <Row label="Current password" htmlFor={ids.current}>
          <Input {...field("current", "current-password")} />
          <FieldError id={`${ids.current}-error`}>
            {errors.current?.message}
          </FieldError>
        </Row>
        <Row label="New password" hint={NEW_HINT} htmlFor={ids.next}>
          <Input {...field("next", "new-password")} />
          <FieldError id={`${ids.next}-error`}>
            {errors.next?.message}
          </FieldError>
        </Row>
        <Row label="Confirm new password" htmlFor={ids.confirm}>
          <Input {...field("confirm", "new-password")} />
          <FieldError id={`${ids.confirm}-error`}>
            {errors.confirm?.message}
          </FieldError>
        </Row>
        <div className="flex justify-end">
          <Button
            type="submit"
            size="sm"
            className="h-8"
            disabled={change.isPending}
          >
            {change.isPending ? (
              <Spinner className="size-3.5" label="Changing" />
            ) : null}
            Change password
          </Button>
        </div>
      </form>
    </section>
  );
}

function AppearanceSection() {
  const id = useId();
  const theme = useThemePreference();
  return (
    <section className="flex flex-col gap-4">
      <SectionTitle>Appearance</SectionTitle>
      <Row label="Theme" hint={THEME_HINT} htmlFor={id}>
        <Select
          value={theme}
          onValueChange={(next) => setThemePreference(next as ThemePreference)}
        >
          <SelectTrigger id={id} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {THEMES.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Row>
    </section>
  );
}

/** An empty field while the page loads: its frame, and a short line where a value goes. */
function FieldFrame({
  select = false,
  value,
}: {
  select?: boolean;
  value?: number;
}) {
  return (
    <span
      className={
        select
          ? "flex h-8 items-center rounded-sm border border-stroke-strong bg-surface-primary px-2.5"
          : "flex h-8 items-center rounded-lg border border-stroke bg-surface-primary px-2.5 shadow-light"
      }
    >
      {value ? (
        <SkeletonText className="text-type-caption-1" width={value} />
      ) : null}
    </span>
  );
}

/**
 * Account while it loads: the same sections, rows, labels and empty fields; the name, the email
 * and the theme are short lines until they arrive (measured against the loaded page).
 */
export function AccountSettingsSkeleton() {
  return (
    <SettingsPage title={TITLE} description={DESCRIPTION}>
      <section aria-hidden className="flex flex-col gap-4">
        <SectionTitle>Profile</SectionTitle>
        <Row label="Name" hint={NAME_HINT} wide>
          <div className="flex gap-2">
            <span className="min-w-0 flex-1">
              <FieldFrame value={96} />
            </span>
            <SkeletonButton width={SAVE_WIDTH} height={32} />
          </div>
        </Row>
        <Row label="Email" hint={EMAIL_HINT}>
          <span className="flex h-8 items-center sm:justify-end">
            <SkeletonText className="text-type-body-small" width={160} />
          </span>
        </Row>
      </section>
      <SettingsDivider />
      <section aria-hidden className="flex flex-col gap-4">
        <SectionTitle>Password</SectionTitle>
        <Row label="Current password">
          <FieldFrame />
        </Row>
        <Row label="New password" hint={NEW_HINT}>
          <FieldFrame />
        </Row>
        <Row label="Confirm new password">
          <FieldFrame />
        </Row>
        <div className="flex justify-end">
          <SkeletonButton width={CHANGE_WIDTH} height={32} />
        </div>
      </section>
      <SettingsDivider />
      <section aria-hidden className="flex flex-col gap-4">
        <SectionTitle>Appearance</SectionTitle>
        <Row label="Theme" hint={THEME_HINT}>
          <FieldFrame select value={48} />
        </Row>
      </section>
    </SettingsPage>
  );
}
