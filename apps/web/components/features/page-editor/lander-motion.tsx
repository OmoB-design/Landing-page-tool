"use client";

import "dialkit/styles.css";

import { DialRoot, useDialKit } from "dialkit";
import { type Transition, useReducedMotion } from "motion/react";
import { createContext, type ReactNode, useContext, useMemo } from "react";

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

/** Sidekick's curve for the page squeezing and the panel arriving: fast, then a long settle. */
const SETTLE: Ease = [0.2, 0.8, 0, 1];
/** The bar sinking out of the page: it gathers speed as it goes. */
const SINK: Ease = [0.55, 0, 1, 0.45];
/** Thread pieces arriving (AffectUI's Thinking Loader curve). */
const ARRIVE: Ease = [0.22, 1, 0.36, 1];

/**
 * The page editor's motion (B3.1b, D105), from Shopify Sidekick as measured on 2026-11-04
 * (docs/reference/sidekick-study.md): the bar sinks (0.32 s), the page squeezes (0.5 s) as Lander's
 * panel scales, fades and un-blurs in (1.6 s on a long settle); closing is quicker, and the bar
 * rises back on a small spring. In development a DialKit panel tunes every value live (Copy in its
 * menu gives the owner's tuning to paste back); production keeps these defaults.
 */
const DIAL = {
  replay: { type: "action" as const, label: "Replay (close, then open)" },
  slowMotion: [1, 1, 8, 0.5] as Range,
  bar: {
    /** Where "Work with Lander" sits: px from the page panel's foot (owner's tuning, 2026-11-04;
     * Sidekick's is 16). */
    fromBottom: [5, 0, 96, 1] as Range,
    /** Opening the editor: the bar rises into place after this long (owner, 2026-11-05). */
    enterDelay: [0.35, 0, 1.5, 0.05] as Range,
    sink: { type: "easing", duration: 0.32, ease: SINK } as Easing,
    distance: [84, 20, 160, 1] as Range,
    rise: { type: "spring", visualDuration: 0.55, bounce: 0.18 } as Spring,
  },
  page: {
    squeezeDelay: [0.12, 0, 0.6, 0.01] as Range,
    squeeze: { type: "easing", duration: 0.5, ease: SETTLE } as Easing,
    widen: { type: "easing", duration: 0.45, ease: SETTLE } as Easing,
  },
  panel: {
    delay: [0.2, 0, 0.8, 0.01] as Range,
    enter: { type: "easing", duration: 1.6, ease: SETTLE } as Easing,
    scaleFrom: [0.975, 0.9, 1, 0.005] as Range,
    blurFrom: [1, 0, 8, 0.25] as Range,
    exit: { type: "easing", duration: 0.15, ease: [0.4, 0, 1, 1] } as Easing,
  },
  thread: {
    wordStagger: [0.022, 0, 0.1, 0.002] as Range,
    // 2 px: enough to bridge each word in, not a smudge across a sentence (emil-design-eng).
    wordBlur: [2, 0, 10, 0.5] as Range,
    arrive: { type: "easing", duration: 0.34, ease: ARRIVE } as Easing,
  },
  sections: {
    toggle: { type: "easing", duration: 0.26, ease: SETTLE } as Easing,
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
  dial: ReturnType<typeof useDialKit<typeof DIAL>>,
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
  const dial = useDialKit("Lander motion", DIAL, {
    id: "lander-motion-v1",
    persist: true,
    onAction: (action) => {
      if (action === "replay") onReplay();
    },
  });
  const value = useMemo(() => resolve(dial, reduced), [dial, reduced]);
  return (
    <MotionContext value={value}>
      {children}
      {process.env.NODE_ENV === "development" ? (
        <DialRoot position="bottom-left" defaultOpen={false} />
      ) : null}
    </MotionContext>
  );
}
