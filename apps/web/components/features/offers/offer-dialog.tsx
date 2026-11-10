"use client";

import { type FormEvent, type ReactNode, useId, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { EMPTY_OFFER } from "@/lib/offers/form";
import type { OfferActionResult } from "@/lib/offers/actions";
import {
  type Checkout,
  type OfferFormValues,
  type PriceChange,
  offerFormSchema,
} from "@/lib/validators/offer";

const PRICE_LABELS: Record<PriceChange, string> = {
  none: "No price change",
  percent: "Percent off",
  amount: "Amount off",
};
const CHECKOUT_LABELS: Record<Checkout, string> = {
  none: "Not set",
  code: "A discount code",
  automatic: "Applied automatically at checkout",
};

type Errors = Partial<Record<keyof OfferFormValues, string>>;

/**
 * New offer and Edit offer (B7.2a, D146; drawn as the Invite modal, no Figma frame): the name; the
 * price change and its percent or amount; how the customer gets it (a discount code, or applied at
 * checkout); the promo line; details for the copy; and whether new pages start with it. Saved
 * through `onSave` (the server action); field errors show under their fields.
 */
export function OfferDialog({
  open,
  onOpenChange,
  initial,
  editing,
  currency,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: OfferFormValues | null;
  editing: boolean;
  currency: string;
  onSave: (values: OfferFormValues) => Promise<OfferActionResult>;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-dvh gap-0 overflow-y-auto p-0 sm:max-w-md">
        {open ? (
          <OfferForm
            initial={initial ?? EMPTY_OFFER}
            editing={editing}
            currency={currency}
            onSave={onSave}
            onCancel={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function OfferForm({
  initial,
  editing,
  currency,
  onSave,
  onCancel,
}: {
  initial: OfferFormValues;
  editing: boolean;
  currency: string;
  onSave: (values: OfferFormValues) => Promise<OfferActionResult>;
  onCancel: () => void;
}) {
  const id = useId();
  const [values, setValues] = useState<OfferFormValues>(initial);
  const [errors, setErrors] = useState<Errors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof OfferFormValues>(
    key: K,
    value: OfferFormValues[K],
  ) => {
    setValues((current) => ({ ...current, [key]: value }));
    if (errors[key]) setErrors((current) => ({ ...current, [key]: undefined }));
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const parsed = offerFormSchema.safeParse(values);
    if (!parsed.success) {
      const next: Errors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof OfferFormValues;
        next[key] ??= issue.message;
      }
      setErrors(next);
      return;
    }
    setSaving(true);
    setFailure(null);
    const result = await onSave(parsed.data);
    setSaving(false);
    if (result.fieldErrors) {
      setErrors(
        Object.fromEntries(
          Object.entries(result.fieldErrors).map(([key, list]) => [
            key,
            list?.[0],
          ]),
        ),
      );
    } else if (result.error && !result.ok) setFailure(result.error);
  };
  const symbol =
    new Intl.NumberFormat("en", { style: "currency", currency })
      .formatToParts(0)
      .find((part) => part.type === "currency")?.value ?? currency;
  const checkoutHint =
    values.checkout === "code"
      ? "On Shopify stores, the page's buttons apply the code at checkout."
      : values.checkout === "automatic"
        ? "Set it up as an automatic discount in your store."
        : values.price_change !== "none"
          ? "Without a code or an automatic discount, the store charges its own price: the page will warn before it's published."
          : null;
  return (
    <form
      onSubmit={(event) => void submit(event)}
      noValidate
      aria-label={editing ? "Edit offer" : "New offer"}
      className="flex flex-col"
    >
      <div className="flex flex-col gap-5 px-6 pt-6 pb-6">
        <div className="flex flex-col gap-1">
          <DialogTitle className="text-type-body-small font-medium text-heading-01">
            {editing ? "Edit offer" : "New offer"}
          </DialogTitle>
          <DialogDescription className="text-type-caption-1 text-heading-05">
            The deal a page sells. Pick it for each page you build.
          </DialogDescription>
        </div>
        <Row label="Name" htmlFor={`${id}-name`} error={errors.name}>
          <Input
            id={`${id}-name`}
            value={values.name}
            placeholder="Autumn 20% off"
            autoComplete="off"
            aria-invalid={errors.name ? true : undefined}
            onChange={(event) => set("name", event.target.value)}
            className="h-8 px-2.5"
          />
        </Row>
        <Row
          label="Price change"
          htmlFor={`${id}-price`}
          error={errors.price_value}
          hint="Taken off the store's current price, as a discount code is at checkout."
        >
          <div className="flex gap-2">
            <Select
              value={values.price_change}
              onValueChange={(next) => {
                set("price_change", next as PriceChange);
                if (next === "none") set("price_value", "");
              }}
            >
              <SelectTrigger
                id={`${id}-price`}
                className="h-8 min-w-0 flex-1 text-heading-02"
              >
                <SelectValue>{PRICE_LABELS[values.price_change]}</SelectValue>
              </SelectTrigger>
              <SelectContent variant="menu">
                {(Object.keys(PRICE_LABELS) as PriceChange[]).map((key) => (
                  <SelectItem key={key} value={key} variant="menu">
                    {PRICE_LABELS[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {values.price_change !== "none" ? (
              <div className="relative w-28 shrink-0">
                {values.price_change === "amount" ? (
                  <span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-type-body-small text-sub-text">
                    {symbol}
                  </span>
                ) : null}
                <Input
                  aria-label={
                    values.price_change === "percent"
                      ? "Percent off"
                      : "Amount off"
                  }
                  inputMode="decimal"
                  value={values.price_value}
                  placeholder={values.price_change === "percent" ? "20" : "15"}
                  aria-invalid={errors.price_value ? true : undefined}
                  onChange={(event) => set("price_value", event.target.value)}
                  className={
                    values.price_change === "amount"
                      ? "h-8 pr-2.5 pl-6 tabular-nums"
                      : "h-8 pr-7 pl-2.5 tabular-nums"
                  }
                />
                {values.price_change === "percent" ? (
                  <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-type-body-small text-sub-text">
                    %
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>
        </Row>
        <Row
          label="How the customer gets it"
          htmlFor={`${id}-checkout`}
          error={errors.code}
          hint={checkoutHint}
        >
          <div className="flex gap-2">
            <Select
              value={values.checkout}
              onValueChange={(next) => {
                set("checkout", next as Checkout);
                if (next !== "code") set("code", "");
              }}
            >
              <SelectTrigger
                id={`${id}-checkout`}
                className="h-8 min-w-0 flex-1 text-heading-02"
              >
                <SelectValue>{CHECKOUT_LABELS[values.checkout]}</SelectValue>
              </SelectTrigger>
              <SelectContent variant="menu">
                {(Object.keys(CHECKOUT_LABELS) as Checkout[]).map((key) => (
                  <SelectItem key={key} value={key} variant="menu">
                    {CHECKOUT_LABELS[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {values.checkout === "code" ? (
              <Input
                aria-label="Discount code"
                value={values.code}
                placeholder="SAVE20"
                autoComplete="off"
                spellCheck={false}
                aria-invalid={errors.code ? true : undefined}
                onChange={(event) => set("code", event.target.value)}
                className="h-8 w-28 shrink-0 px-2.5 font-mono uppercase"
              />
            ) : null}
          </div>
        </Row>
        <Row
          label="Promo line"
          htmlFor={`${id}-promo`}
          error={errors.promo_text}
          hint="The promo bar's words, on pages that have one."
        >
          <Input
            id={`${id}-promo`}
            value={values.promo_text}
            placeholder="Autumn edit: 20% off this week"
            maxLength={120}
            onChange={(event) => set("promo_text", event.target.value)}
            className="h-8 px-2.5"
          />
        </Row>
        <Row
          label="Details for the copy"
          htmlFor={`${id}-details`}
          error={errors.details}
          hint="What else the deal includes. Claude works it into the page's words and never invents another."
        >
          <Textarea
            id={`${id}-details`}
            value={values.details}
            placeholder="Free shipping over $50, a free strap with every bag, ends Sunday."
            maxLength={500}
            rows={3}
            onChange={(event) => set("details", event.target.value)}
          />
        </Row>
        <label
          htmlFor={`${id}-default`}
          className="flex items-center justify-between gap-4"
        >
          <span className="flex flex-col gap-0.5">
            <span className="text-type-caption-1 font-medium text-heading-02">
              Use for new pages
            </span>
            <span className="text-type-caption-2 text-heading-05">
              New page starts with this offer chosen.
            </span>
          </span>
          <Switch
            id={`${id}-default`}
            checked={values.is_default}
            onCheckedChange={(checked) => set("is_default", checked)}
          />
        </label>
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
          disabled={saving}
          onClick={onCancel}
        >
          Cancel
        </Button>
        <Button type="submit" size="compact" disabled={saving}>
          {saving ? <Spinner className="size-3.5" label="Saving" /> : null}
          {editing ? "Save" : "Create offer"}
        </Button>
      </div>
    </form>
  );
}

function Row({
  label,
  htmlFor,
  error,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string | null;
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
        <p className="text-type-caption-2 font-medium text-text-danger">
          {error}
        </p>
      ) : hint ? (
        <p className="text-type-caption-2 text-heading-05">{hint}</p>
      ) : null}
    </div>
  );
}
