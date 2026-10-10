"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { type UseFormReturn, useForm } from "react-hook-form";

import { toast } from "@/components/app/toaster";
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
import { updateProduct } from "@/lib/products/actions";
import {
  type ProductFormValues,
  productFormSchema,
} from "@/lib/validators/product";

type FieldName = keyof ProductFormValues;

/** The product's editable details (BUILD_SPEC §7.2), validated with the server action's schema. */
export function ProductForm({
  productId,
  defaultValues,
}: {
  productId: string;
  defaultValues: ProductFormValues;
}) {
  const router = useRouter();
  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productFormSchema),
    defaultValues,
    mode: "onTouched",
  });
  const [pending, startTransition] = useTransition();
  const rootError = form.formState.errors.root?.message;

  const submit = form.handleSubmit(
    (values) =>
      new Promise<void>((resolve) => {
        startTransition(async () => {
          const result = await updateProduct(productId, values);
          for (const [name, messages] of Object.entries(
            result.fieldErrors ?? {},
          )) {
            if (messages?.[0])
              form.setError(name as FieldName, { message: messages[0] });
          }
          if (result.error) form.setError("root", { message: result.error });
          if (result.ok) {
            toast.success("Product saved");
            form.reset(values);
            router.refresh();
          }
          resolve();
        });
      }),
  );

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <TextField form={form} name="name" label="Product name" />
      <TextField form={form} name="url" label="Product page" type="url" />
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField
          form={form}
          name="price"
          label="Price"
          description="The regular price."
          inputMode="decimal"
        />
        <TextField
          form={form}
          name="sale_price"
          label="Sale price"
          description="Only if it's on sale."
          inputMode="decimal"
        />
        <TextField
          form={form}
          name="currency"
          label="Currency"
          description="e.g. USD."
          uppercase
        />
      </div>
      <TextField
        form={form}
        name="description"
        label="Description"
        multiline
        rows={4}
      />
      <TextField
        form={form}
        name="usps"
        label="Selling points"
        description="One per line."
        multiline
        rows={5}
      />
      <TextField
        form={form}
        name="specs"
        label="Specs"
        description="One per line, as Label: value (e.g. Material: merino wool)."
        multiline
        rows={5}
      />
      <TextField
        form={form}
        name="selling_context"
        label="Selling context"
        description="Who buys it and why, and any offer (bundles, subscriptions, guarantees)."
        multiline
      />

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
          Save changes
        </Button>
      </div>
    </form>
  );
}

function TextField({
  form,
  name,
  label,
  description,
  type = "text",
  inputMode,
  multiline = false,
  rows = 3,
  uppercase = false,
}: {
  form: UseFormReturn<ProductFormValues>;
  name: FieldName;
  label: string;
  description?: string;
  type?: string;
  inputMode?: "decimal";
  multiline?: boolean;
  rows?: number;
  uppercase?: boolean;
}) {
  const error = form.formState.errors[name]?.message;
  const id = `product-${name}`;
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
        <Textarea rows={rows} {...common} />
      ) : (
        <Input
          type={type}
          inputMode={inputMode}
          className={uppercase ? "h-9 uppercase" : "h-9"}
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
