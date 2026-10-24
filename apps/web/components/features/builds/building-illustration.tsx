"use client";

import "dialkit/styles.css";

import { Terminal } from "@lucasmarkes/hairline/react";
import { DialRoot, useDialKit } from "dialkit";
import type { CSSProperties } from "react";

import { type Sweep, HairlineFigure } from "@/components/app/hairline-figure";

type Range = [number, number, number, number];

/** The figure's defaults (owner's tuning, 2026-10-17); the DialKit panel tunes them while developing. */
const DIAL = {
  figure: {
    type: "select" as const,
    options: ["assemble", "terminal"],
    default: "assemble",
  },
  stroke: {
    light: [0.9, 0.4, 3, 0.05] as Range,
    dark: [0.9, 0.4, 3, 0.05] as Range,
  },
  size: [280, 120, 480, 4] as Range,
  intensity: [0.85, 0, 1, 0.05] as Range,
  gap: [18, 0, 80, 1] as Range,
  play: true,
  // Drag through a build by hand (here and on the states page, where no build is running).
  preview: {
    _collapsed: true,
    scrub: false,
    progress: [0.4, 0, 1, 0.01] as Range,
  },
};

/**
 * Assemble's lap: the build line sweeps down the page from above its top to below its foot (the
 * viewBox points over the page's middle, y −12 and 190), holds with every section in place, then
 * sweeps back up, so the page assembles and comes apart in one continuous motion.
 */
const ASSEMBLE_SWEEP: Sweep = {
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
const TRIM = { top: 89.5 / 320, bottom: (320 - 242.5) / 320 };

/**
 * The preview well while a page builds (Figma: the preview while the page builds; the dashed frame
 * there was a placeholder, owner): the illustration alone, its drawing 200 px down, and "The
 * preview appears when the build finishes." 18 px under the drawing. The illustration is Assemble,
 * a Hairline figure drawn for this (public/hairline/assemble.js): a landing page whose sections
 * glide into their slots as the build goes on. With `progress` (the build's), the build line
 * follows it, so a section lands as the steps that make it finish; without one (no build running,
 * as on the states page) the line sweeps down and back in a continuous lap. Its
 * stroke is 0.9 in both themes. In development a DialKit panel in the well's corner
 * tunes the figure (Assemble or Hairline's Terminal), the stroke per theme, size, intensity, the
 * gap and playing; production builds hide the panel and keep these defaults.
 */
export function BuildingIllustration({
  progress,
}: {
  /** How far the build has got (0–1); undefined plays the continuous lap. */
  progress?: number;
}) {
  const dial = useDialKit("Build illustration", DIAL, {
    id: "build-illustration-v2",
    persist: true,
  });
  const assemble = dial.figure !== "terminal";
  const box = dial.size * 0.8;
  const figureStyle = {
    width: dial.size,
    "--well-stroke-light": String(dial.stroke.light),
    "--well-stroke-dark": String(dial.stroke.dark),
    // Trim the drawing's empty margins (sizes from the dial: data, not styling).
    marginTop: assemble ? -box * TRIM.top : 0,
    marginBottom: assemble ? -box * TRIM.bottom : 0,
  } as CSSProperties;
  return (
    <div
      className="relative flex min-h-0 flex-1 animate-step-in flex-col items-center bg-foreground-02 px-2.5 pt-50 pb-2.5 motion-reduce:animate-none"
      // The gap is tuned live (data, not styling).
      style={{ gap: dial.gap }}
    >
      <div className="max-w-full hairline-well" style={figureStyle}>
        {assemble ? (
          <HairlineFigure
            name="assemble"
            play={dial.play}
            sweep={ASSEMBLE_SWEEP}
            progress={dial.preview.scrub ? dial.preview.progress : progress}
            intensity={dial.intensity}
            label="A landing page coming together, section by section"
          />
        ) : (
          <Terminal
            play={dial.play}
            intensity={dial.intensity}
            label="A terminal at work: the page is being built"
          />
        )}
      </div>
      <p className="text-center text-type-caption-1 font-medium text-heading-01">
        The preview appears when the build finishes.
      </p>
      {/* The panel sits in the well's corner: the page's corners hold the header, the sidebar and
          Next's dev badge. Production builds render nothing here. */}
      <div className="absolute top-3 right-3 w-65">
        <DialRoot mode="inline" />
      </div>
    </div>
  );
}
