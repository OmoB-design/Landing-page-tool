import { describe, expect, it } from "vitest";

import { setupProgress } from "@/lib/onboarding/progress";

const none = { brands: 0, products: 0, templates: 0, builds: 0, published: 0 };

describe("setupProgress", () => {
  it("starts at 0 of 5 with creating a brand next", () => {
    const progress = setupProgress(none);
    expect(progress.done).toBe(0);
    expect(progress.total).toBe(5);
    expect(progress.next).toMatchObject({ id: "brand", href: "/brands" });
  });

  it("ticks steps from the counts and points to the first open one", () => {
    const progress = setupProgress({ ...none, brands: 2, products: 1 });
    expect(progress.steps.map((step) => step.done)).toEqual([
      true,
      true,
      false,
      false,
      false,
    ]);
    expect(progress.done).toBe(2);
    expect(progress.next?.id).toBe("template");
  });

  it("has no next step when everything is done", () => {
    const progress = setupProgress({
      brands: 1,
      products: 1,
      templates: 1,
      builds: 1,
      published: 1,
    });
    expect(progress.done).toBe(5);
    expect(progress.next).toBeNull();
  });
});
