import type {
  Checkout,
  OfferFormValues,
  PriceChange,
} from "@/lib/validators/offer";

/** An offer as the Offers tab lists it (B7.2a). */
export type OfferRow = {
  id: string;
  name: string;
  price_change: PriceChange;
  price_value: number | null;
  checkout: Checkout;
  code: string | null;
  promo_text: string | null;
  details: string | null;
  is_default: boolean;
  /** Pages (not in Trash) built with it. */
  pages: number;
};

export const EMPTY_OFFER: OfferFormValues = {
  name: "",
  price_change: "none",
  price_value: "",
  checkout: "none",
  code: "",
  promo_text: "",
  details: "",
  is_default: false,
};

export function offerToForm(offer: OfferRow): OfferFormValues {
  return {
    name: offer.name,
    price_change: offer.price_change,
    price_value: offer.price_value === null ? "" : String(offer.price_value),
    checkout: offer.checkout,
    code: offer.code ?? "",
    promo_text: offer.promo_text ?? "",
    details: offer.details ?? "",
    is_default: offer.is_default,
  };
}

const orNull = (value: string) => (value.trim() === "" ? null : value.trim());

/** The columns the Offers tab writes (the grant in the offers migration), from a checked form. */
export function formToOffer(values: OfferFormValues) {
  return {
    name: values.name.trim(),
    price_change: values.price_change,
    price_value:
      values.price_change === "none" ? null : Number(values.price_value),
    checkout: values.checkout,
    code: values.checkout === "code" ? values.code.trim() : null,
    promo_text: orNull(values.promo_text),
    details: orNull(values.details),
  };
}

/** "20% off", "$15 off" (in the brand's currency) or "No price change". */
export function priceChangeLabel(
  offer: Pick<OfferRow, "price_change" | "price_value">,
  currency: string,
): string {
  if (offer.price_change === "none" || offer.price_value === null)
    return "No price change";
  if (offer.price_change === "percent")
    return `${Number(offer.price_value)}% off`;
  const amount = new Intl.NumberFormat("en", {
    style: "currency",
    currency,
    minimumFractionDigits: Number.isInteger(offer.price_value) ? 0 : 2,
  }).format(offer.price_value);
  return `${amount} off`;
}

/** How the customer gets it, in a few words. */
export function checkoutLabel(
  offer: Pick<OfferRow, "price_change" | "checkout" | "code">,
): string | null {
  if (offer.checkout === "code" && offer.code) return `Code ${offer.code}`;
  if (offer.checkout === "automatic") return "Applied at checkout";
  return null;
}
