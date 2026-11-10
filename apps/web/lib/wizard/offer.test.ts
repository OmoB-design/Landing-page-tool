import { describe, expect, it } from "vitest";

import { chosenOffer } from "./offer";
import type { WizardOffer } from "./queries";
import { parseWizard, wizardPayload, wizardSearch } from "./state";

const B1 = "11111111-1111-4111-8111-111111111111";
const B2 = "22222222-2222-4222-8222-222222222222";
const offer = (
  id: string,
  brandId: string,
  isDefault = false,
): WizardOffer => ({
  id,
  brandId,
  name: id,
  label: "20% off",
  isDefault,
});
const data = {
  offers: [
    offer("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", B1, true),
    offer("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", B1),
    offer("cccccccc-cccc-4ccc-8ccc-cccccccccccc", B2, true),
  ],
};
const [first, second, theirs] = data.offers.map((o) => o.id) as [
  string,
  string,
  string,
];

describe("the page's offer in the wizard (B7.2b)", () => {
  it("is the brand's default until another is picked, or none", () => {
    expect(chosenOffer(data, { brand: B1, offer: null })?.id).toBe(first);
    expect(chosenOffer(data, { brand: B1, offer: second })?.id).toBe(second);
    expect(chosenOffer(data, { brand: B1, offer: "none" })).toBeNull();
    // Another brand's offer doesn't count: back to this brand's default.
    expect(chosenOffer(data, { brand: B1, offer: theirs })?.id).toBe(first);
    expect(chosenOffer({ offers: [] }, { brand: B1, offer: null })).toBeNull();
    expect(chosenOffer(data, { brand: null, offer: first })).toBeNull();
  });

  it("travels in the URL and the build's payload", () => {
    const state = parseWizard(
      new URLSearchParams({
        brand: B1,
        product: B2,
        template: B2,
        offer: second,
      }),
    );
    expect(state.offer).toBe(second);
    expect(new URLSearchParams(wizardSearch(state)).get("offer")).toBe(second);
    expect(parseWizard(new URLSearchParams({ offer: "none" })).offer).toBe(
      "none",
    );
    expect(
      parseWizard(new URLSearchParams({ offer: "junk" })).offer,
    ).toBeNull();
    expect(wizardPayload(state, null, second)?.offer_id).toBe(second);
    expect(wizardPayload(state, null)?.offer_id).toBeNull();
  });
});
