"use client";

import type { ResolvedValues } from "dialkit";
import { type Transition, useReducedMotion } from "motion/react";
import { createContext, type ReactNode, useContext, useMemo } from "react";

import { Dial, DialPanel } from "@/components/ui/dial";

type Range = [number, number, number, number];
type Ease = [number, number, number, number];
type Easing = { type: "easing"; duration: number; ease: Ease };
type Spring = {
  type: "spring";
  visualDuration?: number;
  bounce?: number;
  stiffness?: number;
  damping?: number;
  mass?: number;
};

/** Every move of Buddy's on the app's ease-out curve (`--ease-out` in globals.css; owner,
 * 2026-11-06, after Emil's speed tips): it moves at once and slows as it lands, so a click is
 * answered straight away. */
const EASE_OUT: Ease = [0.23, 1, 0.32, 1];

/**
 * The page editor's motion (B3.1b, D105), first measured from Shopify Sidekick on 2026-11-04
 * (docs/reference/sidekick-study.md) and made quicker on 2026-11-06 (owner, Emil's speed tips):
 * the bar sinks (0.22 s), the page squeezes (0.32 s) as Buddy's panel scales, fades and un-blurs
 * in (0.36 s; Sidekick's was 1.6 s); closing is quicker, and the bar rises back on a small spring. In development a DialKit panel tunes every value live (Copy in its
 * menu gives the owner's tuning to paste back); production keeps these defaults.
 */
const DIAL = {
  replay: { type: "action" as const, label: "Replay (close, then open)" },
  slowMotion: [1, 1, 8, 0.5] as Range,
  bar: {
    /** Where "Work with Lander" sits: px from the page panel's foot (owner's tuning, 2026-11-06;
     * Sidekick's is 16). */
    fromBottom: [32, 0, 96, 1] as Range,
    /** Opening the editor: the bar rises into place after this long (owner, 2026-11-05). */
    enterDelay: [0.35, 0, 1.5, 0.05] as Range,
    sink: { type: "easing", duration: 0.22, ease: EASE_OUT } as Easing,
    distance: [84, 20, 160, 1] as Range,
    rise: { type: "spring", visualDuration: 0.4, bounce: 0.15 } as Spring,
  },
  page: {
    squeezeDelay: [0.05, 0, 0.6, 0.01] as Range,
    squeeze: { type: "easing", duration: 0.32, ease: EASE_OUT } as Easing,
    widen: { type: "easing", duration: 0.28, ease: EASE_OUT } as Easing,
  },
  panel: {
    delay: [0.08, 0, 0.8, 0.01] as Range,
    enter: { type: "easing", duration: 0.36, ease: EASE_OUT } as Easing,
    scaleFrom: [0.975, 0.9, 1, 0.005] as Range,
    blurFrom: [1, 0, 8, 0.25] as Range,
    exit: { type: "easing", duration: 0.15, ease: EASE_OUT } as Easing,
  },
  thread: {
    wordStagger: [0.022, 0, 0.1, 0.002] as Range,
    // The owner's tuning (2026-11-06).
    wordBlur: [4, 0, 10, 0.5] as Range,
    arrive: { type: "easing", duration: 0.28, ease: EASE_OUT } as Easing,
  },
  sections: {
    toggle: { type: "easing", duration: 0.2, ease: EASE_OUT } as Easing,
  },
};

type Config = Easing | Spring;

function isConfig(value: unknown): value is Config {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    ((value as Config).type === "easing" || (value as Config).type === "spring")
  );
}

/** A DialKit easing or spring as a motion transition, slowed by `slow` and delayed by `delay` s. */
export function asTransition(
  value: unknown,
  fallback: Config,
  slow = 1,
  delay = 0,
): Transition {
  const config = isConfig(value) ? value : fallback;
  if (config.type === "spring") {
    return config.stiffness !== undefined
      ? {
          type: "spring",
          stiffness: config.stiffness / (slow * slow),
          damping: (config.damping ?? 30) / slow,
          mass: config.mass ?? 1,
          delay: delay * slow,
        }
      : {
          type: "spring",
          visualDuration: (config.visualDuration ?? 0.5) * slow,
          bounce: config.bounce ?? 0,
          delay: delay * slow,
        };
  }
  return {
    duration: config.duration * slow,
    ease: config.ease,
    delay: delay * slow,
  };
}

export type LanderMotion = {
  reduced: boolean;
  /** The bar's place: px from the page panel's foot (a position, so reduced motion keeps it). */
  barFromBottom: number;
  /** Seconds before the bar rises in when the editor opens. */
  barEnterDelay: number;
  barDistance: number;
  barSink: Transition;
  barRise: Transition;
  pageSqueeze: Transition;
  pageWiden: Transition;
  panelEnter: Transition;
  panelExit: Transition;
  panelScaleFrom: number;
  panelBlurFrom: number;
  wordStagger: number;
  wordBlur: number;
  arrive: Transition;
  sectionsToggle: Transition;
};

function resolve(
  dial: ResolvedValues<typeof DIAL>,
  reduced: boolean,
): LanderMotion {
  const slow = dial.slowMotion;
  const fade: Transition = { duration: 0.2 * slow, ease: "linear" };
  if (reduced) {
    // Reduced motion: things fade; nothing travels, scales or blurs.
    return {
      reduced, barFromBottom: dial.bar.fromBottom, barEnterDelay: 0, barDistance: 0, barSink: fade, barRise: fade, pageSqueeze: fade,
      pageWiden: fade, panelEnter: fade, panelExit: fade, panelScaleFrom: 1,
      panelBlurFrom: 0, wordStagger: 0, wordBlur: 0, arrive: fade, sectionsToggle: fade,
    }; // prettier-ignore
  }
  return {
    reduced,
    barFromBottom: dial.bar.fromBottom,
    barEnterDelay: dial.bar.enterDelay * slow,
    barDistance: dial.bar.distance,
    barSink: asTransition(dial.bar.sink, DIAL.bar.sink, slow),
    barRise: asTransition(dial.bar.rise, DIAL.bar.rise, slow),
    pageSqueeze: asTransition(
      dial.page.squeeze,
      DIAL.page.squeeze,
      slow,
      dial.page.squeezeDelay,
    ),
    pageWiden: asTransition(dial.page.widen, DIAL.page.widen, slow),
    panelEnter: asTransition(
      dial.panel.enter,
      DIAL.panel.enter,
      slow,
      dial.panel.delay,
    ),
    panelExit: asTransition(dial.panel.exit, DIAL.panel.exit, slow),
    panelScaleFrom: dial.panel.scaleFrom,
    panelBlurFrom: dial.panel.blurFrom,
    wordStagger: dial.thread.wordStagger * slow,
    wordBlur: dial.thread.wordBlur,
    arrive: asTransition(dial.thread.arrive, DIAL.thread.arrive, slow),
    sectionsToggle: asTransition(
      dial.sections.toggle,
      DIAL.sections.toggle,
      slow,
    ),
  };
}

const MotionContext = createContext<LanderMotion | null>(null);

export function useLanderMotion(): LanderMotion {
  const motion = useContext(MotionContext);
  if (!motion) throw new Error("useLanderMotion needs a LanderMotionProvider.");
  return motion;
}

/** Holds the editor's motion; `onReplay` closes Lander and opens it again (the dial's Replay). */
export function LanderMotionProvider({
  onReplay,
  children,
}: {
  onReplay: () => void;
  children: ReactNode;
}) {
  const reduced = useReducedMotion() ?? false;
  const options = useMemo(
    () => ({
      id: "lander-motion-v1",
      persist: true,
      onAction: (action: string) => {
        if (action === "replay") onReplay();
      },
    }),
    [onReplay],
  );
  // The dials in development; their defaults in production (components/ui/dial.tsx).
  return (
    <Dial name="Lander motion" config={DIAL} options={options}>
      {(dial) => (
        <ProvideMotion dial={dial} reduced={reduced}>
          {children}
        </ProvideMotion>
      )}
    </Dial>
  );
}

function ProvideMotion({
  dial,
  reduced,
  children,
}: {
  dial: ResolvedValues<typeof DIAL>;
  reduced: boolean;
  children: ReactNode;
}) {
  const value = useMemo(() => resolve(dial, reduced), [dial, reduced]);
  return (
    <MotionContext value={value}>
      {children}
      <DialPanel position="bottom-left" defaultOpen={false} />
    </MotionContext>
  );
}
