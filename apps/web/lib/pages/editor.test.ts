import { describe, expect, it } from "vitest";

import type { DeskSection } from "@/lib/validators/desk";

import { canMoveSection, keepsGroups, textToSave } from "./editor";

const layout: DeskSection[] = [
  {
    key: "hero",
    label: "Hero",
    removable: false,
    duplicable: true,
    group: 0,
    hidden: false,
  },
  {
    key: "faq",
    label: "FAQ",
    removable: true,
    duplicable: false,
    group: 0,
    hidden: false,
  },
  {
    key: "footer",
    label: "Footer",
    removable: true,
    duplicable: false,
    group: 1,
    hidden: false,
  },
];

describe("page editor rules (B3.1a)", () => {
  it("moves sections only within their part of the page", () => {
    expect(canMoveSection(layout, 0, 1)).toBe(true);
    expect(canMoveSection(layout, 0, -1)).toBe(false);
    expect(canMoveSection(layout, 1, 1)).toBe(false); // the footer sits elsewhere
    expect(keepsGroups(layout, ["faq", "hero", "footer"])).toBe(true);
    expect(keepsGroups(layout, ["footer", "hero", "faq"])).toBe(false);
  });

  it("saves a typed line only when it changed and still has words", () => {
    expect(textToSave("Glow in 7 days", "Glow in  7 days ")).toBeNull();
    expect(textToSave("Glow in 7 days", "Glow in 5 days")).toBe(
      "Glow in 5 days",
    );
    expect(textToSave("Glow", "  ")).toBeNull();
    expect(textToSave("Only $29", "$19")).toBe("$19"); // a price alone is a line (as the worker says)
    expect(textToSave("Only $29", "Now $19")).toBe("Now $19");
    expect(textToSave("Hi", "Ça va")).toBe("Ça va");
  });
});
