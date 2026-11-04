"use client";

import { Dotm3x3_11 } from "@/components/ui/dotmatrix/dotm-3x3-11";

/**
 * Lander's "Working on it" loader (owner, 2026-11-04: the @dotmatrix dotm-3x3-11 loader): a 3 × 3
 * grid of 3 px dots with 1.5 px gaps, 12 px square like the spinner it replaces, in the
 * surrounding text's colour. Still under reduced motion (the loader stops its own animation).
 */
export function WorkingDots({ label = "Working" }: { label?: string }) {
  return (
    <Dotm3x3_11
      size={12}
      dotSize={3}
      cellPadding={1.5}
      color="currentColor"
      ariaLabel={label}
    />
  );
}
