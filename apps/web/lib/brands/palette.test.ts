import { describe, expect, it } from "vitest";

import {
  deriveDark,
  deriveTint,
  hexToRgb,
  readableOn,
} from "@/lib/brands/palette";

describe("palette helpers", () => {
  // Reference values from the worker (services/worker/app/engines/colors.py).
  it.each([
    ["#e4572e", "#922f13", "#f8efed"],
    ["#1f6feb", "#0d4193", "#edf1f8"],
    ["#212121", "#1f1f1f", "#f2f2f2"],
  ])("derives %s → dark %s, tint %s like the worker", (hex, dark, tint) => {
    expect(deriveDark(hex)).toBe(dark);
    expect(deriveTint(hex)).toBe(tint);
  });

  it("rejects bad hex values", () => {
    expect(hexToRgb("#zzzzzz")).toBeNull();
    expect(deriveDark("red")).toBeNull();
  });

  it("picks readable text on a colour", () => {
    expect(readableOn("#212121")).toBe("light");
    expect(readableOn("#f8efed")).toBe("dark");
    expect(readableOn(null)).toBe("dark");
  });
});
