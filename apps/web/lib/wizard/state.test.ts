import { describe, expect, it } from "vitest";

import {
  canOpen,
  parseWizard,
  stepReady,
  wizardPayload,
  wizardSearch,
} from "./state";

const BRAND = "11111111-1111-4111-8111-111111111111";
const PRODUCT = "22222222-2222-4222-8222-222222222222";
const TEMPLATE = "33333333-3333-4333-8333-333333333333";

const briefing = {
  audiences: [
    { name: "Everyday Home Cooks", description: "They cook most nights." },
  ],
  benefits: ["Bold, spicy pop"],
  features: [],
  objections: ["Is $21 worth it?"],
};

describe("create wizard state", () => {
  it("starts empty with defaults", () => {
    const state = parseWizard(new URLSearchParams());
    expect(state).toMatchObject({
      step: "product",
      brand: null,
      ai: true,
      styles: [],
      audience: null,
      gender: "any",
      author: "writer",
    });
    expect(wizardSearch(state)).toBe("");
  });

  it("round-trips every choice through the URL", () => {
    const search = new URLSearchParams({
      step: "emphasis",
      brand: BRAND,
      product: PRODUCT,
      template: TEMPLATE,
      ai: "0",
      audience: "Everyday Home Cooks",
      gender: "women",
      age: "25-34",
      author: "expert",
    });
    search.append("style", "ugc");
    search.append("benefit", "Bold, spicy pop");
    search.append("objection", "Is $21 worth it?");
    const state = parseWizard(search);
    expect(state.step).toBe("emphasis");
    expect(state.styles).toEqual(["ugc"]);
    expect(parseWizard(new URLSearchParams(wizardSearch(state)))).toEqual(
      state,
    );
  });

  it("drops invalid values instead of failing", () => {
    const search = new URLSearchParams({
      step: "nope",
      brand: "not-a-uuid",
      gender: "robot",
      age: "200",
      author: "doctor",
    });
    for (let i = 0; i < 5; i++) search.append("benefit", `Benefit ${i % 4}`);
    search.append("style", "oil-painting");
    const state = parseWizard(search);
    expect(state).toMatchObject({
      step: "product",
      brand: null,
      gender: "any",
      age: null,
      author: "writer",
      styles: [],
    });
    expect(state.benefits).toEqual(["Benefit 0", "Benefit 1", "Benefit 2"]);
  });

  it("only opens a step when the steps before it are ready", () => {
    const state = parseWizard(new URLSearchParams({ brand: BRAND }));
    expect(stepReady(state, "product")).toBe(false);
    expect(canOpen(state, "template")).toBe(false);
    const ready = { ...state, product: PRODUCT, template: TEMPLATE };
    expect(canOpen(ready, "review")).toBe(true);
  });

  it("builds the payload with the audience's description", () => {
    const state = {
      ...parseWizard(new URLSearchParams()),
      brand: BRAND,
      product: PRODUCT,
      template: TEMPLATE,
      audience: "Everyday Home Cooks",
      styles: ["ugc" as const],
      benefits: ["Bold, spicy pop"],
    };
    const payload = wizardPayload(state, briefing);
    expect(payload).toMatchObject({
      template_id: TEMPLATE,
      wizard: {
        audience: "Everyday Home Cooks: They cook most nights.",
        image_styles: ["ugc"],
        emphasis: {
          benefits: ["Bold, spicy pop"],
          features: [],
          objections: [],
        },
      },
    });
    expect(
      wizardPayload({ ...state, ai: false }, briefing)?.wizard.image_styles,
    ).toEqual([]);
    expect(
      wizardPayload({ ...state, audience: null }, briefing)?.wizard.audience,
    ).toBeNull();
    expect(wizardPayload({ ...state, template: null }, briefing)).toBeNull();
  });
});
