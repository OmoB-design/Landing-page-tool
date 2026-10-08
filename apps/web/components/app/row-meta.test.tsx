// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  formatCost,
  initials,
  OriginBadge,
  ScoreChip,
  scoreTone,
} from "@/components/app/row-meta";
import { templateTypeLabel, TypeGlyph } from "@/components/app/type-glyph";

describe("scoreTone", () => {
  it("is good at or above the threshold, fair up to 15 below, poor beneath", () => {
    expect(scoreTone(100, 85)).toBe("good");
    expect(scoreTone(85, 85)).toBe("good");
    expect(scoreTone(84, 85)).toBe("fair");
    expect(scoreTone(70, 85)).toBe("fair");
    expect(scoreTone(69, 85)).toBe("poor");
    expect(scoreTone(0, 85)).toBe("poor");
  });
});

describe("ScoreChip", () => {
  it("names the score for screen readers and carries its tone", () => {
    render(<ScoreChip score={78} min={85} />);
    const chip = screen.getByText(/Source-leak score/).parentElement;
    expect(chip?.textContent).toBe("Source-leak score 78");
    expect(chip?.dataset.tone).toBe("fair");
  });
});

describe("formatCost", () => {
  it("formats dollars with two decimals", () => {
    expect(formatCost(1.84)).toBe("$1.84");
    expect(formatCost(0)).toBe("$0.00");
    expect(formatCost(12.5)).toBe("$12.50");
  });

  it("shows sub-cent amounts as <$0.01", () => {
    expect(formatCost(0.004)).toBe("<$0.01");
  });
});

describe("initials", () => {
  it("takes the first and last name's initials", () => {
    expect(initials("Ada Lovelace")).toBe("AL");
    expect(initials("Ada King Lovelace")).toBe("AL");
    expect(initials("ada")).toBe("A");
    expect(initials("  ")).toBe("?");
  });
});

describe("OriginBadge", () => {
  it("labels owned and cloned pages in text, not colour alone", () => {
    const { rerender } = render(<OriginBadge origin="owned" />);
    expect(screen.getByText("Owned")).toBeTruthy();
    rerender(<OriginBadge origin="cloned" />);
    expect(screen.getByText("Cloned")).toBeTruthy();
  });
});

describe("TypeGlyph", () => {
  it("labels known and unknown template types", () => {
    expect(templateTypeLabel("long_form")).toBe("Long form");
    expect(templateTypeLabel("quiz_bridge")).toBe("Quiz bridge");
    render(<TypeGlyph type="listicle" />);
    expect(screen.getByText("Listicle")).toBeTruthy();
  });
});
