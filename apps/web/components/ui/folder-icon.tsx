"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { RadioGroup as RadioGroupPrimitive } from "radix-ui";
import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { cn } from "@/lib/utils";

/*
 * The folder from the owner's portfolio (omob.work; owner, 2026-11-06), drawn from its big
 * folder (the Rack-focus scroll page) at any size: every length below is in that drawing's
 * pixels, where the folder's body is 110 px wide, and is multiplied out to the size asked for, so
 * strokes, corners and shadows stay crisp instead of being scaled up from a small picture.
 *
 *   body       110 x 100.407, tilted (each colour its own angle), a soft drop shadow
 *   back tab   108.081 x 46.686, 12.791 top corners, the colour's gradient, a 0.384 px light stroke
 *   frames     44.767 x 49.244 cards (6.395 corners, a 0.64 px #eaeaea line, a white highlight
 *              along the top), one per page (up to three), fanned and close together (owner,
 *              2026-11-06): two tilt apart (-9° and +8°) overlapping by half; three fan out (-11°,
 *              +10°) behind a front one (-1°) that has its own soft shadow; one stands alone.
 *   front      the portfolio's front panel (its SVG in public/folder), 15.99 down, 110 x 84.419
 *
 * Every colour sits at the same tilt (-7°, the portfolio's big folder), so picking a colour never
 * moves it; a new colour sweeps across it over the old one, left to right (0.38 s). Hovered with a mouse it straightens on a spring and the
 * frames rise out of it one after another (40 ms apart), unclipped; it settles back faster and
 * without the stagger (Emil: decorative, interruptible, quicker out than in). A soft glint crosses
 * its front every few seconds (`folder-shimmer` in globals.css). Reduced motion: no tilt change,
 * rise, sweep or glint. Its colours are the portfolio's, so it lives here in
 * components/ui (D38). Colours: blue (the portfolio's blue folder), black (its "dark"), red,
 * purple; the team picks one per batch.
 */
const BODY = { width: 110, height: 100.407 };
// The box around the body, as the portfolio's small tile (55 x 59 around a 45 px body), so a row
// keeps its layout and the frames have room to rise.
const BOX = { width: 110 * (55 / 45), height: 110 * (59 / 45) };
const TAB = { width: 108.081, height: 46.686 };
const FRONT = { top: 15.99, height: 84.419 };
const CARD = { width: 44.767, height: 49.244, radius: 6.395 };
const SLOT = { width: 48.889, height: 52.959 };
type Frame = {
  left: number;
  top: number;
  rotate: number;
  /** Which page's picture it shows. */
  still: number;
  /** In front: a lighter line and its own shadow. */
  raised?: boolean;
};
// Back to front, for one, two or three pages: fanned and close together.
const LAYOUTS: Record<number, Frame[]> = {
  1: [{ left: 31, top: 2, rotate: -3, still: 0, raised: true }],
  2: [
    { left: 20, top: 4, rotate: -9, still: 0 },
    { left: 42, top: 3, rotate: 8, still: 1, raised: true },
  ],
  3: [
    { left: 12, top: 5, rotate: -11, still: 1 },
    { left: 50, top: 5, rotate: 10, still: 2 },
    { left: 31, top: 1, rotate: -1, still: 0, raised: true },
  ],
};
// Hovered, the frames rise this far out of the folder.
const RISE_BY = 17;
// The same tilt for every colour (the portfolio's big folder).
const TILT = -7;

type Shadow = readonly [x: number, y: number, blur: number, colour: string];

const TONES = {
  blue: {
    grad: "linear-gradient(101.05deg, rgb(44,118,255) 3.82%, rgb(19,101,253) 89.36%)",
    line: 0.384,
    lineColour: "rgba(117,165,254,0.4)",
    tabRadius: 12.791,
    shadow: [0, 0, 1.279, "rgba(0,0,0,0.25)"] as Shadow,
    panel: "blue",
    panelInset: "-11.36% -8.72%",
    panelPad: 0.0872,
    swatch: "#256efe",
    label: "Blue",
  },
  black: {
    grad: "linear-gradient(119.83deg, rgb(40,38,38) 9.889%, rgb(21,19,19) 90.111%)",
    line: 0.384,
    lineColour: "#646464",
    tabRadius: 12.791,
    shadow: [0, 2.4, 3.2, "rgba(0,0,0,0.3)"] as Shadow,
    panel: "dark",
    panelInset: "-11.36% -8.72%",
    panelPad: 0.0872,
    swatch: "#211f1f",
    label: "Black",
  },
  red: {
    grad: "linear-gradient(119.83deg, rgb(243,60,59) 9.889%, rgb(212,39,38) 90.111%)",
    line: 0.384,
    lineColour: "#ff828e",
    tabRadius: 12.791,
    shadow: [0, 2.4, 3.6, "rgba(26,26,26,0.25)"] as Shadow,
    panel: "red",
    panelInset: "-11.36% -8.72%",
    panelPad: 0.0872,
    swatch: "#e8342f",
    label: "Red",
  },
  purple: {
    grad: "linear-gradient(106.31deg, rgb(85,71,165) 40.769%, rgb(64,53,124) 87.534%)",
    line: 0.288,
    lineColour: "#887ad8",
    tabRadius: 9.647,
    shadow: [0, 1.6, 3.2, "rgba(0,0,0,0.25)"] as Shadow,
    panel: "purple",
    panelInset: "-8.57% -6.58%",
    panelPad: 0.0658,
    swatch: "#5547a5",
    label: "Purple",
  },
} as const;

export type FolderTone = keyof typeof TONES;

/** The colours a batch's folder can take, in the picker's order. */
export const FOLDER_TONES = [
  "blue",
  "black",
  "red",
  "purple",
] as const satisfies readonly FolderTone[];

export function isFolderTone(value: unknown): value is FolderTone {
  return typeof value === "string" && value in TONES;
}

// Springs (interruptible, they keep their momentum): in a little softer, out quicker. Each one
// animates a whole `transform`, so Motion hands it to the browser (WAAPI) and it stays smooth
// while the page is busy (Emil: shorthand x/y/rotate run on the main thread).
const TILT_IN = { type: "spring", duration: 0.45, bounce: 0.15 } as const;
const TILT_OUT = { type: "spring", duration: 0.3, bounce: 0 } as const;
const RISE_IN = { type: "spring", duration: 0.6, bounce: 0.12 } as const;
const RISE_OUT = { type: "spring", duration: 0.3, bounce: 0 } as const;
const STAGGER = 0.04;
// A new colour sweeps across the folder over the old one (owner: no muddy crossfade; Emil: clip
// rather than fade for colour changes), on a strong ease-out so it answers the click at once. A
// browser animation of `clip-path`, off the main thread.
const WIPE_MS = 380;
const WIPE_EASE = "cubic-bezier(0.23, 1, 0.32, 1)";
// The sweep's edge in the body's own lengths: from just left of the folder to just past it, so it
// covers the panel's shadow too.
const SWEEP = { from: -12, span: 146 };
const SHOWN_CLIP = "inset(-20% 0px -20% 0px)";

// The four front panels, fetched once so a new colour is ready the moment it's picked (on the
// live site a panel not seen yet used to arrive mid-sweep).
let panelsWarm = false;
function warmPanels() {
  if (panelsWarm || typeof window === "undefined") return;
  panelsWarm = true;
  for (const tone of Object.values(TONES)) {
    const image = new window.Image();
    image.decoding = "async";
    image.src = `/folder/panel-${tone.panel}.svg`;
  }
}

/**
 * One colour layer (the back tab or the front panel). When it arrives because the colour changed,
 * it sweeps in from left to right over the previous one; both layers follow one edge in the body's
 * coordinates (`left` is where this layer starts in them, `width` its width), so the sweep reads as
 * one across the folder. The previous colour stays underneath until it's covered.
 */
function ColourLayer({
  sweep,
  left,
  width,
  unit,
  className,
  style,
  children,
}: {
  sweep: boolean;
  left: number;
  width: number;
  unit: number;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!sweep || !element || typeof element.animate !== "function") return;
    const start = (SWEEP.from - left) * unit; // the edge at the start, in this layer's pixels
    const full = width * unit;
    const done = Math.min(1, (full - start) / (SWEEP.span * unit)); // the edge reaches the end
    const animation = element.animate(
      [
        {
          clipPath: `inset(-20% ${(full - start).toFixed(2)}px -20% 0px)`,
          offset: 0,
        },
        { clipPath: SHOWN_CLIP, offset: done },
        { clipPath: SHOWN_CLIP, offset: 1 },
      ],
      { duration: WIPE_MS, easing: WIPE_EASE },
    );
    return () => animation.cancel();
  }, [sweep, left, width, unit]);
  return (
    <motion.span
      ref={ref}
      className={className}
      style={{ ...style, zIndex: 1 }}
      exit={{
        zIndex: 0,
        opacity: 0,
        transition: { delay: WIPE_MS / 1000, duration: 0 },
      }}
    >
      {children}
    </motion.span>
  );
}

/** Lengths in the big drawing's pixels, multiplied out to the folder's size. */
function px(n: number, unit: number): string {
  return `${+(n * unit).toFixed(3)}px`;
}

export function FolderIcon({
  tone = "red",
  stills = [],
  hovered = false,
  width = 45,
  shimmer = true,
  className,
  style,
}: {
  tone?: FolderTone;
  /** The pages' pictures, one frame each (up to three). */
  stills?: string[];
  hovered?: boolean;
  /** The folder body's width in px (45 is the portfolio's list tile; its box is 55 x 59). */
  width?: number;
  /** A soft glint passes across the folder's front every few seconds (owner, 2026-11-06). */
  shimmer?: boolean;
  className?: string;
  /** Placement, e.g. inside its tile. */
  style?: CSSProperties;
}) {
  const reduced = useReducedMotion() ?? false;
  const look = TONES[tone];
  const u = width / BODY.width;
  useEffect(warmPanels, []);
  // The colour sweeps only when it changes, not when the folder first appears.
  const [shownTone, setShownTone] = useState(tone);
  const [changed, setChanged] = useState(false);
  if (tone !== shownTone) {
    setShownTone(tone);
    setChanged(true);
  }
  const sweep = changed && !reduced;
  const frames = LAYOUTS[Math.min(Math.max(stills.length, 1), 3)] ?? [];
  const [sx, sy, sb, sc] = look.shadow;
  const panel = `/folder/panel-${look.panel}.svg`;
  return (
    <span
      aria-hidden
      className={cn("relative block shrink-0", className)}
      style={{ width: px(BOX.width, u), height: px(BOX.height, u), ...style }}
    >
      <span className="absolute top-1/2 left-1/2 block -translate-x-1/2 -translate-y-1/2">
        <motion.span
          className="block"
          style={{ transform: `rotate(${TILT}deg)` }}
          initial={false}
          animate={{
            transform: `rotate(${hovered && !reduced ? 0 : TILT}deg)`,
          }}
          transition={hovered ? TILT_IN : TILT_OUT}
        >
          <span
            className="relative block"
            style={{
              width: px(BODY.width, u),
              height: px(BODY.height, u),
              filter: `drop-shadow(${px(sx, u)} ${px(sy, u)} ${px(sb, u)} ${sc})`,
            }}
          >
            {/* The back tab; a new colour sweeps in over the old. */}
            <span
              className="absolute top-0 left-0 isolate block"
              style={{ width: px(TAB.width, u), height: px(TAB.height, u) }}
            >
              <AnimatePresence initial={false}>
                <ColourLayer
                  key={tone}
                  sweep={sweep}
                  left={0}
                  width={TAB.width}
                  unit={u}
                  className="absolute inset-0 box-border block"
                  style={{
                    backgroundImage: look.grad,
                    border: `${px(look.line, u)} solid ${look.lineColour}`,
                    borderTopLeftRadius: px(look.tabRadius, u),
                    borderTopRightRadius: px(look.tabRadius, u),
                  }}
                />
              </AnimatePresence>
            </span>
            {frames.map((frame, i) => {
              const src = stills[frame.still];
              return (
                <motion.span
                  key={`${frames.length}-${i}`}
                  className="absolute flex items-center justify-center"
                  style={{
                    left: px(frame.left, u),
                    top: px(frame.top, u),
                    width: px(SLOT.width, u),
                    height: px(SLOT.height, u),
                  }}
                  initial={false}
                  animate={{
                    transform: `translateY(${hovered && !reduced ? -RISE_BY * u : 0}px)`,
                  }}
                  transition={
                    hovered ? { ...RISE_IN, delay: i * STAGGER } : RISE_OUT
                  }
                >
                  <span
                    className="block"
                    style={{ transform: `rotate(${frame.rotate}deg)` }}
                  >
                    <span
                      className="relative box-border block overflow-hidden bg-white"
                      style={{
                        width: px(CARD.width, u),
                        height: px(CARD.height, u),
                        borderRadius: px(CARD.radius, u),
                        border: `${px(frame.raised ? 0.384 : 0.64, u)} solid #eaeaea`,
                        boxShadow: frame.raised
                          ? `${px(0.64, u)} ${px(2.558, u)} ${px(2.622, u)} 0 rgba(177,176,176,0.15), ${px(-0.64, u)} ${px(2.558, u)} ${px(2.558, u)} 0 rgba(155,155,155,0.2)`
                          : undefined,
                      }}
                    >
                      {src ? (
                        // eslint-disable-next-line @next/next/no-img-element -- a page's thumbnail
                        <img
                          src={src}
                          alt=""
                          decoding="async"
                          className="absolute inset-0 size-full object-cover object-top"
                        />
                      ) : null}
                      {/* The white highlight along the card's top edge. */}
                      <span
                        className="absolute inset-0 block rounded-[inherit]"
                        style={{
                          boxShadow: `inset 0 ${px(0.64, u)} ${px(1.279, u)} 0 rgba(255,255,255,0.8)`,
                        }}
                      />
                    </span>
                  </span>
                </motion.span>
              );
            })}
            {/* The front panel (the portfolio's SVG). */}
            <span
              className="absolute left-0 isolate block"
              style={{
                top: px(FRONT.top, u),
                width: px(BODY.width, u),
                height: px(FRONT.height, u),
              }}
            >
              <AnimatePresence initial={false}>
                <ColourLayer
                  key={tone}
                  sweep={sweep}
                  left={-BODY.width * look.panelPad}
                  width={BODY.width * (1 + 2 * look.panelPad)}
                  unit={u}
                  className="absolute block"
                  style={{ inset: look.panelInset }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- a static vector */}
                  <img
                    src={panel}
                    alt=""
                    className="block size-full max-w-none"
                  />
                </ColourLayer>
              </AnimatePresence>
              {shimmer && !reduced ? (
                // The glint, cut to the panel's own shape (its SVG as a mask).
                <span
                  className="folder-shimmer absolute block"
                  style={{
                    // Above the colour layers (they stack at 1 for the sweep).
                    zIndex: 2,
                    inset: look.panelInset,
                    backgroundImage:
                      "linear-gradient(110deg, transparent 38%, rgba(255,255,255,0.5) 50%, transparent 62%)",
                    backgroundSize: "250% 100%",
                    backgroundRepeat: "no-repeat",
                    WebkitMaskImage: `url(${panel})`,
                    maskImage: `url(${panel})`,
                    WebkitMaskSize: "100% 100%",
                    maskSize: "100% 100%",
                  }}
                />
              ) : null}
            </span>
          </span>
        </motion.span>
      </span>
    </span>
  );
}

// The batch page's tile (owner, 2026-11-06): the portfolio's Rack-focus scroll tile at 80 %
// (161.4 x 165 with 20 px corners there), the folder 88 px wide and 5 px above the middle (the
// tile's 16 px top and 26 px bottom padding there).
const TILE = { width: 129, height: 132, radius: 16, folder: 88, lift: -5 };

/**
 * The folder on its tile at the top of a batch's page (owner, 2026-11-06): in light mode the
 * portfolio's folder card (#f4f4f4) with a subtle dark edge, in dark black (#161618 to #0c0c0d)
 * with a subtle light edge and a light along its top; each with a little drop shadow.
 */
export function FolderTile({
  className,
  ...folder
}: {
  tone?: FolderTone;
  stills?: string[];
  hovered?: boolean;
  shimmer?: boolean;
  className?: string;
}) {
  const box = {
    width: TILE.folder * (BOX.width / BODY.width),
    height: TILE.folder * (BOX.height / BODY.width),
  };
  return (
    <span
      aria-hidden
      className={cn(
        "relative block shrink-0 bg-[#f4f4f4] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.05),0_1px_2px_rgba(0,0,0,0.05),0_6px_16px_-8px_rgba(0,0,0,0.12)] dark:bg-[linear-gradient(180deg,#161618_0%,#0c0c0d_100%)] dark:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08),inset_0_1px_0_rgba(255,255,255,0.06),0_1px_2px_rgba(0,0,0,0.3),0_8px_20px_-8px_rgba(0,0,0,0.5)]",
        className,
      )}
      style={{
        width: TILE.width,
        height: TILE.height,
        borderRadius: TILE.radius,
      }}
    >
      <FolderIcon
        {...folder}
        width={TILE.folder}
        className="absolute"
        style={{
          left: (TILE.width - box.width) / 2,
          top: (TILE.height - box.height) / 2 + TILE.lift,
        }}
      />
    </span>
  );
}

/**
 * Circles to pick a batch's folder colour (owner, 2026-11-06): a 20 px disc per colour 12 px apart
 * (a faint light edge in dark, so black shows), the picked one ringed in Heading-02 2 px out; arrow keys move between them (a radio group). Each names
 * its colour for screen readers and in a tooltip.
 */
export function FolderColorPicker({
  value,
  onValueChange,
  disabled = false,
  className,
}: {
  value: FolderTone;
  onValueChange: (tone: FolderTone) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <RadioGroupPrimitive.Root
      aria-label="Folder colour"
      orientation="horizontal"
      loop
      value={value}
      disabled={disabled}
      onValueChange={(next) => {
        if (isFolderTone(next)) onValueChange(next);
      }}
      className={cn("flex items-center gap-3", className)}
    >
      {FOLDER_TONES.map((tone) => (
        <RadioGroupPrimitive.Item
          key={tone}
          value={tone}
          aria-label={TONES[tone].label}
          title={TONES[tone].label}
          className="size-5 shrink-0 rounded-full shadow-[inset_0_0_0_0.5px_rgba(0,0,0,0.12)] transition-shadow duration-150 ease-out outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:shadow-[inset_0_0_0_0.5px_rgba(0,0,0,0.12),0_0_0_2px_var(--color-surface-primary),0_0_0_3.5px_var(--color-heading-02)] dark:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.18)] dark:data-[state=checked]:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.18),0_0_0_2px_var(--color-surface-primary),0_0_0_3.5px_var(--color-heading-02)]"
          style={{ backgroundColor: TONES[tone].swatch }}
        />
      ))}
    </RadioGroupPrimitive.Root>
  );
}
