"use client";

import { type Sweep, HairlineFigure } from "@/components/app/hairline-figure";

/**
 * Assemble's lap: the build line sweeps down the page from above its top to below its foot (the
 * viewBox points over the page's middle, y −12 and 190), holds with every section in place, then
 * sweeps back up, so the page assembles and comes apart in one continuous motion.
 */
export const ASSEMBLE_SWEEP: Sweep = {
  from: [304, 111],
  to: [96, 214],
  downMs: 6500,
  holdMs: 1400,
  upMs: 3200,
  restMs: 900,
};

/**
 * How much of Assemble's 5:4 box is empty above and below its drawing at rest (the drawing spans
 * viewBox y 89.5 to 242.5 of 320), so the gap to the caption is measured from the drawing itself.
 */
export const TRIM = { top: 89.5 / 320, bottom: (320 - 242.5) / 320 };

/** How high the sections float (the build page's tuning, 2026-10-17). */
export const FIGURE_INTENSITY = 0.85;

/**
 * The build illustration small, for a batch's Builds panel (B3.5c, D132): Assemble at the build
 * page's settings (its sweep and intensity, the well's stroke), without the dial panel or the
 * caption, `width` px wide with its empty margins trimmed. It follows `progress`; `still` (a page
 * waiting or built) stands at that point without moving.
 */
export function BuildFigure({
  progress,
  still = false,
  width = 220,
}: {
  progress: number;
  still?: boolean;
  width?: number;
}) {
  const box = width * 0.8;
  return (
    <div
      className="max-w-full hairline-well"
      // The figure's size and the trim of its empty margins (data, not styling).
      style={{
        width,
        marginTop: -box * TRIM.top,
        marginBottom: -box * TRIM.bottom,
      }}
    >
      <HairlineFigure
        name="assemble"
        play
        sweep={ASSEMBLE_SWEEP}
        progress={progress}
        still={still}
        intensity={FIGURE_INTENSITY}
        label="A landing page coming together, section by section"
      />
    </div>
  );
}
