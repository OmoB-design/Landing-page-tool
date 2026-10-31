"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTransition } from "react";
import { type UseFormReturn, useForm } from "react-hook-form";

import { SkeletonStatus } from "@/components/app/skeletons";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { AlertIcon } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import type { BrandActionResult } from "@/lib/brands/actions";
import { EMPTY_BRAND_FORM } from "@/lib/brands/form";
import { EMPTY_SWATCH, deriveDark, deriveTint } from "@/lib/brands/palette";
import { type BrandFormValues, brandFormSchema } from "@/lib/validators/brand";

type FieldName = keyof BrandFormValues;

/**
 * Brand DNA form (BUILD_SPEC §7.1), for a new brand (prefilled from the fetch) and for editing.
 * Validated in the browser with the same zod schema the server action uses. Laid out like the
 * product's details (Figma Brands Details): sections 40 px apart under a 14 px medium title,
 * fields 24 px apart (16 px side by side), 80 px text areas and a 34 px Save.
 */
export function BrandForm({
  defaultValues,
  onSubmit,
  submitLabel,
  aboveFields,
  loading = false,
}: {
  defaultValues: BrandFormValues;
  onSubmit: (values: BrandFormValues) => Promise<BrandActionResult>;
  submitLabel: string;
  /** Rendered above the fields, with access to the form (e.g. the colour recommendation). */
  aboveFields?: (form: UseFormReturn<BrandFormValues>) => React.ReactNode;
  /** While the brand loads: the same form, empty and out of reach (the skeleton). */
  loading?: boolean;
}) {
  const form = useForm<BrandFormValues>({
    resolver: zodResolver(brandFormSchema),
    defaultValues,
    mode: "onTouched",
  });
  const [pending, startTransition] = useTransition();
  const rootError = form.formState.errors.root?.message;

  const submit = form.handleSubmit(
    (values) =>
      new Promise<void>((resolve) => {
        startTransition(async () => {
          const result = await onSubmit(values);
          for (const [name, messages] of Object.entries(
            result.fieldErrors ?? {},
          )) {
            if (messages?.[0])
              form.setError(name as FieldName, { message: messages[0] });
          }
          if (result.error) form.setError("root", { message: result.error });
          resolve();
        });
      }),
  );

  return (
    <form
      onSubmit={submit}
      noValidate
      inert={loading}
      aria-busy={loading || undefined}
      className="@container flex max-w-2xl flex-col gap-6"
    >
      <div className="flex flex-col gap-10">
        {aboveFields?.(form)}

        <Section title="Identity">
          {/* Side by side only when the form has room (Brand DNA's 600 px column, not the
              400 px review step of a new brand). */}
          <div className="grid gap-4 @lg:grid-cols-2">
            <TextField form={form} name="name" label="Brand name" />
            <TextField form={form} name="url" label="Website" type="url" />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <TextField
              form={form}
              name="prefix"
              label="Key prefix"
              description="2 to 4 letters for page keys, e.g. LUM-23."
              uppercase
            />
            <TextField
              form={form}
              name="emoji"
              label="Emoji"
              description="Optional."
            />
            <TextField
              form={form}
              name="language"
              label="Language"
              description="e.g. en or en-GB."
            />
          </div>
          <TextField form={form} name="tagline" label="Tagline" />
        </Section>

        <Section title="Voice">
          <TextField
            form={form}
            name="positioning"
            label="Positioning"
            multiline
          />
          <TextField form={form} name="audience" label="Audience" multiline />
          <TextField
            form={form}
            name="brand_context"
            label="Brand context"
            multiline
          />
          <TextField form={form} name="voice" label="Voice" multiline />
          <TextField
            form={form}
            name="voice_examples"
            label="Voice examples"
            description="One per line: real lines from the brand's site or ads."
            multiline
          />
          <TextField
            form={form}
            name="cta_text"
            label="Button text"
            description="e.g. Shop now."
          />
        </Section>

        <Section title="Look">
          <div className="grid gap-4 sm:grid-cols-2">
            <ColorField
              form={form}
              name="palette_primary"
              label="Primary colour"
              derive
            />
            <ColorField
              form={form}
              name="palette_accent"
              label="Accent colour"
            />
            <ColorField form={form} name="palette_dark" label="Dark shade" />
            <ColorField form={form} name="palette_tint" label="Tint" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField form={form} name="font_heading" label="Heading font" />
            <TextField form={form} name="font_body" label="Body font" />
          </div>
        </Section>

        <Section title="Offer and contact">
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              form={form}
              name="sale_percent"
              label="Sale percent"
              description="0 to 100, optional."
            />
            <TextField form={form} name="promo_text" label="Promo text" />
          </div>
          <TextField
            form={form}
            name="support_email"
            label="Support email"
            type="email"
          />
          <TextField form={form} name="meta_title" label="Page title (SEO)" />
          <TextField
            form={form}
            name="meta_description"
            label="Page description (SEO)"
            multiline
          />
        </Section>

        <Section title="AI budget">
          <TextField
            form={form}
            name="monthly_budget_usd"
            label="Monthly AI budget (USD)"
            description="Paid AI steps for this brand stop once this month’s spend reaches it, and start again on the 1st (UTC). Leave empty for no cap."
          />
        </Section>
      </div>

      {rootError ? (
        <Alert
          variant="destructive"
          className="border-spot-500-red/30 bg-highlight-red-50"
        >
          <AlertIcon aria-hidden />
          <AlertDescription className="text-text-danger">
            {rootError}
          </AlertDescription>
        </Alert>
      ) : null}
      <div>
        <Button
          type="submit"
          size="compact"
          disabled={pending}
          className="h-8.5 px-4"
        >
          {pending ? <Spinner className="size-3.5" /> : null}
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

/**
 * Brand DNA while the brand loads: the form itself, empty and out of reach, so every label and
 * field is already where it will be (measured against the loaded page, 2026-10-31); only the
 * values arrive.
 */
export function BrandFormSkeleton() {
  return (
    <>
      <SkeletonStatus label="Loading Brand DNA" />
      <BrandForm
        loading
        defaultValues={EMPTY_BRAND_FORM}
        submitLabel="Save changes"
        onSubmit={async () => ({})}
      />
    </>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-type-body-large leading-normal font-medium text-heading-01">
        {title}
      </h2>
      <div className="flex flex-col gap-6">{children}</div>
    </section>
  );
}

type FieldProps = {
  form: UseFormReturn<BrandFormValues>;
  name: FieldName;
  label: string;
  description?: string;
};

function TextField({
  form,
  name,
  label,
  description,
  type = "text",
  multiline = false,
  uppercase = false,
}: FieldProps & { type?: string; multiline?: boolean; uppercase?: boolean }) {
  const error = form.formState.errors[name]?.message;
  const id = `brand-${name}`;
  const hintId = error ? `${id}-error` : description ? `${id}-hint` : undefined;
  const registration = form.register(name, {
    setValueAs: uppercase ? (value: string) => value.toUpperCase() : undefined,
  });
  const common = {
    id,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": hintId,
    // In the server HTML too, so the fields aren't blank until the form hydrates.
    defaultValue: form.formState.defaultValues?.[name] ?? "",
    ...registration,
  };
  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      {multiline ? (
        // As on the product: 80 px tall when empty, growing with the text.
        <Textarea rows={2} className="min-h-20" {...common} />
      ) : (
        <Input
          type={type}
          className={uppercase ? "uppercase" : undefined}
          {...common}
        />
      )}
      {error ? (
        <FieldError id={hintId}>{error}</FieldError>
      ) : description ? (
        <FieldDescription id={hintId}>{description}</FieldDescription>
      ) : null}
    </Field>
  );
}

/** A colour swatch picker plus its hex value; the primary colour re-derives dark and tint. */
function ColorField({
  form,
  name,
  label,
  derive = false,
}: FieldProps & { derive?: boolean }) {
  const value = form.watch(name);
  const error = form.formState.errors[name]?.message;
  const id = `brand-${name}`;
  const set = (hex: string) => {
    form.setValue(name, hex, { shouldDirty: true, shouldValidate: true });
    if (derive && /^#[0-9a-f]{6}$/i.test(hex)) {
      form.setValue("palette_dark", deriveDark(hex) ?? "", {
        shouldDirty: true,
      });
      form.setValue("palette_tint", deriveTint(hex) ?? "", {
        shouldDirty: true,
      });
    }
  };
  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`${label} picker`}
          value={/^#[0-9a-f]{6}$/i.test(value) ? value : EMPTY_SWATCH}
          onChange={(event) => set(event.target.value)}
          className="size-10.5 shrink-0 cursor-pointer rounded-lg border border-stroke bg-surface-primary p-1 shadow-light"
        />
        <Input
          id={id}
          className="font-mono"
          placeholder="#rrggbb"
          aria-invalid={error ? true : undefined}
          value={value}
          onChange={(event) => set(event.target.value.trim())}
        />
      </div>
      {error ? <FieldError>{error}</FieldError> : null}
    </Field>
  );
}
