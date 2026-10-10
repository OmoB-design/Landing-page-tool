import { describe, expect, it } from "vitest";

import { cn } from "@/lib/utils";

describe("cn", () => {
  it("lets a later layout token win over an earlier size", () => {
    expect(cn("w-4", "w-sidebar")).toBe("w-sidebar");
    expect(cn("h-8", "h-row")).toBe("h-row");
  });

  it("treats text-type-body-large as a font size, separate from text colour", () => {
    expect(cn("text-type-caption-1", "text-type-body-large")).toBe(
      "text-type-body-large",
    );
    expect(cn("text-body", "text-type-body-large")).toBe(
      "text-body text-type-body-large",
    );
    expect(cn("text-caption-1", "text-type-caption-1")).toBe(
      "text-caption-1 text-type-caption-1",
    );
    expect(cn("text-type-caption-3", "text-type-caption-2")).toBe(
      "text-type-caption-2",
    );
  });

  it("lets a later colour token win over an earlier one", () => {
    expect(cn("bg-surface-primary", "bg-foreground-02")).toBe(
      "bg-foreground-02",
    );
    expect(cn("text-body", "text-sub-text")).toBe("text-sub-text");
  });

  it("drops falsy values", () => {
    expect(cn("p-2", false, undefined, "font-medium")).toBe("p-2 font-medium");
  });
});
