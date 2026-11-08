"use client";

import { Stage } from "@/components/ui/stageshow/stage";
import { Bar } from "@/components/ui/stageshow/window";
import type { ThemePreference } from "@/lib/preferences";

import "../look.css";
import "./theme.css";

/*
 * The theme thumbnails (I5, B6.3) on Settings → Account: LP's own layout in miniature, after the
 * owner's reference (2026-11-08): a window on a ground, its lights and sidebar lines on the grey
 * canvas, the page in a floating panel with a header and a row of cards, running off the right
 * and bottom so the card crops it. Light and Dark are LP's two themes whatever the app shows;
 * System is light with its right side dark. Still pictures (no script); the window rises a
 * little while its card is hovered (theme.css). Drawn 1:1 at the card's 174 px picture; the
 * stage shrinks to fit a narrower one.
 */

export const THEME_SCENE = { width: 174, height: 110 } as const;

/** The window: lights, sidebar and the floating page. Its colours come from the look around it. */
function Shell() {
  return (
    <div className="ith-window">
      <span className="ith-lights">
        <span />
        <span />
        <span />
      </span>
      <span className="ith-sidebar">
        <Bar w={16} h={2.5} tone={4} r={1} />
        <span className="ith-nav">
          <Bar w={22} h={2} tone={3} r={1} />
          <Bar w={17} h={2} tone={3} r={1} />
          <Bar w={20} h={2} tone={3} r={1} />
        </span>
      </span>
      <span className="ith-profile">
        <span className="ith-avatar" />
        <Bar w={12} h={2} tone={3} r={1} />
      </span>
      <span className="ith-panel">
        <span className="ith-header">
          <Bar w={18} h={2.5} tone={4} r={1} />
          <Bar w={30} h={2} tone={2} r={1} />
        </span>
        <span className="ith-cards">
          <span />
          <span />
          <span />
        </span>
        <span className="ith-lines">
          <Bar w={24} h={2} tone={3} r={1} />
          <Bar w={40} h={2} tone={2} r={1} />
        </span>
      </span>
    </div>
  );
}

export function ThemeScene({ theme }: { theme: ThemePreference }) {
  return (
    <div aria-hidden className="ith" data-illustration={`theme-${theme}`}>
      <Stage
        width={THEME_SCENE.width}
        height={THEME_SCENE.height}
        unframed
        className={theme === "dark" ? "lp-look-dark" : "lp-look-light"}
      >
        {() => (
          <>
            <div className="ith-ground" />
            <Shell />
            {theme === "system" ? (
              <div className="ith-half lp-look-dark-scope">
                <div className="ith-ground" />
                <Shell />
              </div>
            ) : null}
          </>
        )}
      </Stage>
    </div>
  );
}
