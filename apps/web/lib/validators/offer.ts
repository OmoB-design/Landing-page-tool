import { z } from "zod";

// A brand's offers (B7.2a, D146): the Offers tab's form, and an offer as a page records it.

export const PRICE_CHANGES = ["none", "percent", "amount"] as const;
export type PriceChange = (typeof PRICE_CHANGES)[number];
export const CHECKOUTS = ["none", "code", "automatic"] as const;
export type Checkout = (typeof CHECKOUTS)[number];

const PERCENT = /^\d{1,2}(\.\d{1,2})?$/;
const AMOUNT = /^\d{1,7}(\.\d{1,2})?$/;
const CODE = /^\S{1,40}$/;

/** The New offer / Edit offer form, as typed (the numbers are text until saved). */
export const offerFormSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Give the offer a name.")
      .max(60, "Up to 60 characters."),
    price_change: z.enum(PRICE_CHANGES),
    price_value: z.string().trim(),
    checkout: z.enum(CHECKOUTS),
    code: z.string().trim(),
    promo_text: z.string().trim().max(120, "Up to 120 characters."),
    details: z.string().trim().max(500, "Up to 500 characters."),
    is_default: z.boolean(),
  })
  .superRefine((values, context) => {
    const value = Number(values.price_value);
    if (
      values.price_change === "percent" &&
      !(PERCENT.test(values.price_value) && value > 0 && value < 100)
    )
      context.addIssue({
        code: "custom",
        path: ["price_value"],
        message: "A percent from 1 to 99.",
      });
    if (
      values.price_change === "amount" &&
      !(AMOUNT.test(values.price_value) && value > 0)
    )
      context.addIssue({
        code: "custom",
        path: ["price_value"],
        message: "An amount above 0, like 15 or 9.99.",
      });
    if (values.checkout === "code" && !CODE.test(values.code))
      context.addIssue({
        code: "custom",
        path: ["code"],
        message: values.code
          ? "Up to 40 characters, no spaces."
          : "Add the discount code.",
      });
  });
export type OfferFormValues = z.infer<typeof offerFormSchema>;

/** An offer as a page records it (`builds.offer`): what it showed when it was built. */
export const pageOfferSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    price_change: z.enum(PRICE_CHANGES).catch("none"),
    price_value: z.coerce.number().nullable().catch(null),
    checkout: z.enum(CHECKOUTS).catch("none"),
    code: z.string().nullable().catch(null),
    promo_text: z.string().nullable().catch(null),
    details: z.string().nullable().catch(null),
  })
  .loose();
export type PageOffer = z.infer<typeof pageOfferSchema>;
