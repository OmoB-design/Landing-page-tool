import { describe, expect, it } from "vitest";

import { cn } from "@/lib/utils";

describe("cn", () => {
  it("lets a later layout token win over an earlier size", () => {
    expect(cn("w-4", "w-rail")).toBe("w-rail");
    expect(cn("h-8", "h-row")).toBe("h-row");
  });

  it("treats text-md as a font size, separate from text colour", () => {
    expect(cn("text-sm", "text-md")).toBe("text-md");
    expect(cn("text-fg", "text-md")).toBe("text-fg text-md");
  });

  it("lets a later colour token win over an earlier one", () => {
    expect(cn("bg-surface", "bg-surface-hover")).toBe("bg-surface-hover");
    expect(cn("text-fg", "text-fg-muted")).toBe("text-fg-muted");
  });

  it("drops falsy values", () => {
    expect(cn("p-2", false, undefined, "font-medium")).toBe("p-2 font-medium");
  });
});
