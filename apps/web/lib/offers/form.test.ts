import { describe, expect, it } from "vitest";

import {
  EMPTY_OFFER,
  checkoutLabel,
  formToOffer,
  priceChangeLabel,
} from "@/lib/offers/form";
import { offerFormSchema } from "@/lib/validators/offer";

const form = (change: Partial<typeof EMPTY_OFFER>) => ({
  ...EMPTY_OFFER,
  name: "Autumn",
  ...change,
});
const issues = (change: Partial<typeof EMPTY_OFFER>) => {
  const parsed = offerFormSchema.safeParse(form(change));
  return parsed.success
    ? []
    : parsed.error.issues.map((issue) => issue.path[0]);
};

describe("offer form (B7.2a)", () => {
  it("takes a percent from 1 to 99 and an amount above 0", () => {
    expect(issues({ price_change: "percent", price_value: "20" })).toEqual([]);
    expect(issues({ price_change: "percent", price_value: "12.5" })).toEqual(
      [],
    );
    expect(issues({ price_change: "amount", price_value: "9.99" })).toEqual([]);
    for (const value of ["", "0", "100", "abc", "-5"])
      expect(issues({ price_change: "percent", price_value: value })).toEqual([
        "price_value",
      ]);
    for (const value of ["", "0", "1.234"])
      expect(issues({ price_change: "amount", price_value: value })).toEqual([
        "price_value",
      ]);
  });

  it("needs a code without spaces when the customer uses one, and a name", () => {
    expect(issues({ checkout: "code", code: "SAVE20" })).toEqual([]);
    expect(issues({ checkout: "code", code: "" })).toEqual(["code"]);
    expect(issues({ checkout: "code", code: "SAVE 20" })).toEqual(["code"]);
    expect(issues({ name: "  " })).toEqual(["name"]);
  });

  it("writes only what applies: no amount without a price change, no code unless it's used", () => {
    expect(
      formToOffer(
        form({
          price_value: "20",
          checkout: "automatic",
          code: "X",
          promo_text: " ",
        }),
      ),
    ).toEqual({
      name: "Autumn",
      price_change: "none",
      price_value: null,
      checkout: "automatic",
      code: null,
      promo_text: null,
      details: null,
    });
    expect(
      formToOffer(
        form({
          price_change: "amount",
          price_value: "15",
          checkout: "code",
          code: " SAVE15 ",
        }),
      ),
    ).toMatchObject({ price_value: 15, code: "SAVE15" });
  });

  it("says the price change and how the customer gets it in a few words", () => {
    expect(
      priceChangeLabel({ price_change: "percent", price_value: 20 }, "USD"),
    ).toBe("20% off");
    expect(
      priceChangeLabel({ price_change: "amount", price_value: 15 }, "USD"),
    ).toBe("$15 off");
    expect(
      priceChangeLabel({ price_change: "amount", price_value: 9.5 }, "GBP"),
    ).toBe("£9.50 off");
    expect(
      priceChangeLabel({ price_change: "none", price_value: null }, "USD"),
    ).toBe("No price change");
    expect(
      checkoutLabel({
        price_change: "percent",
        checkout: "code",
        code: "SAVE20",
      }),
    ).toBe("Code SAVE20");
    expect(
      checkoutLabel({
        price_change: "percent",
        checkout: "automatic",
        code: null,
      }),
    ).toBe("Applied at checkout");
    expect(
      checkoutLabel({ price_change: "none", checkout: "none", code: null }),
    ).toBeNull();
  });
});
