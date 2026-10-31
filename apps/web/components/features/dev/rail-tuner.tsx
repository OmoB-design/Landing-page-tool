"use client";

import "dialkit/styles.css";

import { DialRoot, useDialKit } from "dialkit";
import { useEffect, useRef } from "react";

import { useSidebar } from "@/components/app/sidebar-state";
import { Button } from "@/components/ui/button";

type Range = [number, number, number, number];
type Ease = [number, number, number, number];
type Easing = { type: "easing"; duration: number; ease: Ease };

const DRAWER: Ease = [0.32, 0.72, 0, 1];
const EXPO_OUT: Ease = [0.16, 1, 0.3, 1];

/** The defaults in app/globals.css (`--rail-*`, D97): the timings measured from the reference clip. */
const DIAL = {
  replay: { type: "action" as const, label: "Replay (close, then open)" },
  toggle: { type: "action" as const, label: "Collapse / expand" },
  slowMotion: [1, 1, 8, 0.5] as Range,
  column: {
    opening: { type: "easing", duration: 0.37, ease: DRAWER } as Easing,
    closing: { type: "easing", duration: 0.39, ease: DRAWER } as Easing,
    railWidth: [44, 40, 64, 1] as Range,
  },
  labelsIn: {
    delay: [70, 0, 300, 1] as Range,
    stagger: [18.5, 0, 80, 0.5] as Range,
    fade: { type: "easing", duration: 0.29, ease: EXPO_OUT } as Easing,
    slide: { type: "easing", duration: 0.37, ease: DRAWER } as Easing,
    shift: [-4, -16, 0, 1] as Range,
  },
  rightControls: {
    delay: [120, 0, 400, 5] as Range,
    fade: [400, 0, 1000, 10] as Range,
  },
  sectionRules: {
    delay: [120, 0, 400, 5] as Range,
    fade: [200, 0, 600, 10] as Range,
  },
  labelsOut: {
    fade: [70, 0, 300, 5] as Range,
    stagger: [5, 0, 40, 0.5] as Range,
  },
};

const ms = (value: number) => `${value}ms`;
const bezier = (ease: Ease) => `cubic-bezier(${ease.join(", ")})`;
const easing = (value: unknown, fallback: Easing) =>
  value && typeof value === "object" && "ease" in value
    ? (value as Easing)
    : fallback;

/**
 * Tunes the sidebar rail's motion (D97) live, development only: a DialKit panel writes the
 * `--rail-*` variables on <html> while this page is open (they go back to the defaults when you
 * leave), with Replay and a slow-motion multiplier. Paste the panel's copied configuration back to
 * Claude to keep a tuning.
 */
export function RailTuner() {
  const { toggle, rail } = useSidebar();
  const replaying = useRef<number | null>(null);
  const closeTime = useRef(0);
  const dial = useDialKit("Sidebar rail", DIAL, {
    id: "sidebar-rail-v1",
    persist: true,
    onAction: (action) => {
      if (action === "toggle") toggle();
      if (action === "replay") replay();
    },
  });
  const slow = dial.slowMotion;
  const opening = easing(dial.column.opening, DIAL.column.opening);
  const closing = easing(dial.column.closing, DIAL.column.closing);
  const fade = easing(dial.labelsIn.fade, DIAL.labelsIn.fade);
  const slide = easing(dial.labelsIn.slide, DIAL.labelsIn.slide);

  const vars: Record<string, string> = {
    "--spacing-rail": `${dial.column.railWidth}px`,
    "--rail-open": ms(opening.duration * 1000 * slow),
    "--rail-close": ms(closing.duration * 1000 * slow),
    "--rail-ease": bezier(opening.ease),
    "--rail-delay": ms(dial.labelsIn.delay * slow),
    "--rail-stagger": ms(dial.labelsIn.stagger * slow),
    "--rail-fade": ms(fade.duration * 1000 * slow),
    "--rail-fade-ease": bezier(fade.ease),
    "--rail-slide": ms(slide.duration * 1000 * slow),
    "--rail-slide-ease": bezier(slide.ease),
    "--rail-shift": `${dial.labelsIn.shift}px`,
    "--rail-meta-delay": ms(dial.rightControls.delay * slow),
    "--rail-meta-fade": ms(dial.rightControls.fade * slow),
    "--rail-rule-delay": ms(dial.sectionRules.delay * slow),
    "--rail-rule-fade": ms(dial.sectionRules.fade * slow),
    "--rail-out": ms(dial.labelsOut.fade * slow),
    "--rail-out-stagger": ms(dial.labelsOut.stagger * slow),
  };
  const key = JSON.stringify(vars);

  // Closes the sidebar (if open), waits for the column to settle, then opens it.
  function replay() {
    if (replaying.current !== null) return;
    const root = document.documentElement;
    if (root.getAttribute("data-sidebar") !== "collapsed") toggle();
    replaying.current = window.setTimeout(() => {
      if (root.getAttribute("data-sidebar") === "collapsed") toggle();
      replaying.current = null;
    }, closeTime.current + 500);
  }

  useEffect(() => {
    closeTime.current = closing.duration * 1000 * slow;
  }, [closing.duration, slow]);

  // The tuning lives on <html> only while this page is open.
  useEffect(() => {
    const style = document.documentElement.style;
    const entries = Object.entries(JSON.parse(key) as Record<string, string>);
    for (const [name, value] of entries) style.setProperty(name, value);
    return () => {
      for (const [name] of entries) style.removeProperty(name);
    };
  }, [key]);

  useEffect(
    () => () => {
      if (replaying.current !== null) window.clearTimeout(replaying.current);
    },
    [],
  );

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="compact" onClick={replay}>
          Replay
        </Button>
        <Button size="compact" variant="outline" onClick={toggle}>
          {rail ? "Expand" : "Collapse"}
        </Button>
      </div>
      <DialRoot position="bottom-right" defaultOpen />
    </>
  );
}
