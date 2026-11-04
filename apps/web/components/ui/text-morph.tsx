"use client";

import { TextMorph } from "torph/react";
import type { ComponentProps } from "react";

/**
 * Text that morphs when it changes (torph, Lochie Axon, MIT; owner, 2026-11-04): letters the old
 * and new text share glide to their new places, the rest fade, and numbers roll by place value
 * ("4s" → "5s" rolls only the digit). For short labels that change in place: a status, a button's
 * state, a count. LP's timing by default (320 ms on the app's ease-out); reduced motion shows the
 * new text at once. Feature code imports it from here, not from torph (D20).
 */
export function MorphText(props: ComponentProps<typeof TextMorph>) {
  return (
    <TextMorph
      duration={320}
      ease="cubic-bezier(0.22, 1, 0.36, 1)"
      {...props}
    />
  );
}
