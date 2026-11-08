"use client";

import { type CSSProperties, Fragment } from "react";

import { Stage } from "@/components/ui/stageshow/stage";
import type { ThemePreference } from "@/lib/preferences";
import { cn } from "@/lib/utils";

import "../look.css";
import "./theme.css";

/*
 * The theme thumbnails (I5, B6.3; redrawn B6.4, D133) on Settings → Account: LP's own layout in
 * miniature, after the owner's reference (2026-11-08): a window on a ground, its lights and
 * sidebar on the grey canvas, the page in a floating panel (a header, a title, a row of cards and
 * lines), running off the right and bottom so the card crops it. Drawn on a 348 × 220 canvas and
 * zoomed to the 174 × 110 stage, so every edge sits on the half pixel a 2× screen draws. Light and
 * Dark are LP's two themes whatever the app shows; System is light with its right side dark.
 * While its card is hovered (the card carries `ith-hover`), the lights come on in macOS's colours
 * and, a beat later, a shimmer runs once across the page's frames (theme.css).
 */

export const THEME_SCENE = { width: 174, height: 110 } as const;

type Tone = 1 | 2 | 3 | 4;

/** A filled shape at a place (canvas px). `x` in the panel also places its shimmer. */
function Shape({
  x,
  y,
  w,
  h,
  r = 2,
  tone,
  fill,
  shimmer = false,
  className,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  r?: number;
  tone?: Tone;
  fill?: string;
  shimmer?: boolean;
  className?: string;
}) {
  const style = {
    left: x,
    top: y,
    width: w,
    height: h,
    borderRadius: r,
    "--f": fill ?? `var(--ss-ink-${tone ?? 3})`,
    "--x": `${x}px`,
  } as CSSProperties;
  return (
    <span
      className={cn("ith-s", shimmer && "ith-f", className)}
      style={style}
    />
  );
}

/** A card on the page: a picture and its caption on the well, every part shimmering. */
function Card({ x }: { x: number }) {
  return (
    <>
      <Shape
        x={x}
        y={78}
        w={64}
        h={60}
        r={8}
        fill="var(--ss-well)"
        shimmer
        className="ith-card"
      />
      <Shape x={x + 4} y={82} w={56} h={36} r={5} tone={2} shimmer />
      <Shape x={x + 8} y={124} w={34} h={4} tone={3} shimmer />
    </>
  );
}

/** The window: lights, sidebar and the floating page. Its colours come from the look around it. */
function Shell() {
  return (
    <div className="ith-window">
      <span className="ith-lights">
        <span />
        <span />
        <span />
      </span>
      {/* The sidebar: the workspace, the pages with Pages current, and the profile. */}
      <Shape x={14} y={38} w={12} h={12} r={3} tone={4} />
      <Shape x={32} y={41.5} w={34} h={5} r={2.5} tone={4} />
      <Shape x={8} y={80} w={76} h={16} r={4} tone={2} />
      {[60, 80, 100, 120].map((y, i) => (
        <Fragment key={y}>
          <Shape x={14} y={y + 4} w={8} h={8} r={2} tone={i === 1 ? 4 : 3} />
          <Shape
            x={28}
            y={y + 6}
            w={[36, 28, 32, 24][i] ?? 30}
            h={4}
            tone={i === 1 ? 4 : 3}
          />
        </Fragment>
      ))}
      <Shape x={14} y={154} w={12} h={12} r={6} tone={4} />
      <Shape x={32} y={158} w={28} h={4} tone={3} />
      {/* The page: a header and its line, the title, a row of cards, lines. */}
      <div className="ith-panel">
        <Shape x={16} y={14} w={40} h={5} r={2.5} tone={4} shimmer />
        <span className="ith-rule" />
        <Shape x={16} y={46} w={70} h={8} r={3} tone={4} shimmer />
        <Shape x={16} y={60} w={100} h={4} tone={2} shimmer />
        <Card x={16} />
        <Card x={90} />
        <Card x={164} />
        <Shape x={16} y={150} w={56} h={4} tone={3} shimmer />
        <Shape x={16} y={160} w={88} h={4} tone={2} shimmer />
      </div>
    </div>
  );
}

/**
 * Nothing to play: the pictures are still. A script (once) keeps the kit from treating the stage
 * as a poster, which switches every animation inside it off, so the hover's shimmer and the
 * lights' fade run; under reduced motion the kit still switches them off.
 */
async function hold() {}

export function ThemeScene({ theme }: { theme: ThemePreference }) {
  return (
    <div aria-hidden className="ith" data-illustration={`theme-${theme}`}>
      <Stage
        width={THEME_SCENE.width}
        height={THEME_SCENE.height}
        unframed
        script={hold}
        play="once"
        className={theme === "dark" ? "lp-look-dark" : "lp-look-light"}
      >
        {() => (
          <div className="ith-canvas">
            <div className="ith-ground" />
            <Shell />
            {theme === "system" ? (
              <div className="ith-half lp-look-dark-scope">
                <div className="ith-ground" />
                <Shell />
              </div>
            ) : null}
          </div>
        )}
      </Stage>
    </div>
  );
}
