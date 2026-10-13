"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTransition } from "react";
import { type UseFormReturn, useForm } from "react-hook-form";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { AlertIcon, LoadingIcon } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { BrandActionResult } from "@/lib/brands/actions";
import { EMPTY_SWATCH, deriveDark, deriveTint } from "@/lib/brands/palette";
import { type BrandFormValues, brandFormSchema } from "@/lib/validators/brand";

type FieldName = keyof BrandFormValues;

/**
 * Brand DNA form (BUILD_SPEC §7.1), for a new brand (prefilled from the fetch) and for editing.
 * Validated in the browser with the same zod schema the server action uses.
 */
export function BrandForm({
  defaultValues,
  onSubmit,
  submitLabel,
  aboveFields,
}: {
  defaultValues: BrandFormValues;
  onSubmit: (values: BrandFormValues) => Promise<BrandActionResult>;
  submitLabel: string;
  /** Rendered above the fields, with access to the form (e.g. the colour recommendation). */
  aboveFields?: (form: UseFormReturn<BrandFormValues>) => React.ReactNode;
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
      className="flex max-w-2xl flex-col gap-8"
    >
      {aboveFields?.(form)}

      <Section title="Identity">
        <TextField form={form} name="name" label="Brand name" />
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
        <TextField form={form} name="url" label="Website" type="url" />
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
          <ColorField form={form} name="palette_accent" label="Accent colour" />
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
        <Button type="submit" disabled={pending} className="h-9 px-4">
          {pending ? (
            <LoadingIcon
              aria-hidden
              className="animate-spin motion-reduce:animate-spin-slow"
            />
          ) : null}
          {submitLabel}
        </Button>
      </div>
    </form>
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
      <h2 className="text-type-body-large font-semibold">{title}</h2>
      {children}
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
        <Textarea rows={3} {...common} />
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
          className="size-11.5 shrink-0 cursor-pointer rounded-lg border border-stroke bg-surface-primary p-1 shadow-light"
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
