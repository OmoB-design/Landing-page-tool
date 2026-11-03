"use client";

import type { ReactNode } from "react";

import { LockIcon } from "@/components/ui/icons";
import {
  NavPagesIcon,
  StatusBuildingFigmaIcon,
  StatusRingIcon,
  TypeAdvertorialFigmaIcon,
} from "@/components/ui/lp-icons";
import type { Act } from "@/components/ui/stageshow/act";
import { States } from "@/components/ui/stageshow/motion/States";
import { Stage } from "@/components/ui/stageshow/stage";
import { Bar } from "@/components/ui/stageshow/window";
import { SAMPLE_BRAND } from "@/lib/illustrations/sample-brand";

import "../look.css";
import { FRAMED, STAGE, ZOOM } from "./frame";
import "./home.css";

/*
 * Create a page (I1), in Quality's Invite members frame (its chrome to the decimal, a gutter in
 * from every edge): LP's Pages list, grouped
 * by status as the app groups it (Needs review first, then Building). A page builds in Building,
 * then travels up into Needs review: the rows make room, the counts change, and it lands with the
 * group's blue ring. It holds; then it moves on (fades), the list closes up and the next page
 * starts building in its place, so the loop reads as pages coming through. No cursor: this is the
 * system working in the background. Real words: the list's own labels and the new page.
 */

// Quality's browser frame, a gutter in from every edge.
const FRAME = FRAMED;
/** Quality's address pill, centred in the bar. */
const URL_WIDTH = 175.113;
const BAR = 17.097;
// Quality's scale for what's inside (1.1215), filling the viewport inside the frame's edge.
const SCALE = 1.1215;

/** Where each part sits, in the list's px: before the page moves, and after. */
const Y = {
  review: 32,
  slot: 60,
  rowBefore: 60,
  rowAfter: 98,
  buildingBefore: 106,
  buildingAfter: 144,
  newBefore: 134,
  next: 175,
};

type Phase = "building" | "moved" | "leaving";
type S = { phase: Phase; travel: boolean };

const initial: S = { phase: "building", travel: false };
/** Reduced motion: the page landed in Needs review. */
const poster: S = { phase: "moved", travel: false };

async function script(a: Act<S>) {
  await a.wait(900);
  await a.set({ phase: "moved", travel: true });
  await a.wait(760);
  await a.set({ travel: false });
  await a.wait(2300);
  await a.set({ phase: "leaving" });
  await a.wait(950);
  // The page that just faded in below is the one that travels next: swap them unseen.
  await a.snap({ phase: "building" });
}

export function CreatePageScene() {
  return (
    <Stage
      width={STAGE.width}
      height={STAGE.height}
      initial={initial}
      poster={poster}
      script={script}
      className="lp-look-light ih ih-page"
    >
      {(s) => {
        const moved = s.phase === "moved";
        // The counts change once the page has landed: cause, then effect.
        const counted = moved && !s.travel;
        return (
          <div className="ih-canvas" style={{ zoom: ZOOM }}>
            <div className="ss-window ih-browser" style={FRAME}>
              <div className="ih-bar">
                <div className="ih-lights">
                  <span />
                  <span />
                  <span />
                </div>
                <div
                  className="ih-url"
                  style={{
                    left: (FRAME.width - URL_WIDTH) / 2,
                    width: URL_WIDTH,
                  }}
                >
                  <LockIcon />
                  app.lpplatform.com/pages
                </div>
              </div>
              <div
                className="ih-view"
                style={{
                  left: 0, // Zoom scales the element's own offsets too: place it in its own px.
                  top: BAR / SCALE,
                  zoom: SCALE,
                }}
              >
                <div
                  className="ih-pages"
                  style={{
                    width: (FRAME.width - 1.314) / SCALE,
                    height: (FRAME.height - BAR) / SCALE,
                  }}
                >
                  <div className="ih-ph">
                    <NavPagesIcon />
                    Pages
                  </div>
                  <Band
                    y={Y.review}
                    label="Needs review"
                    count={counted ? 2 : 1}
                    glyph={<StatusRingIcon className="ih-glyph-review" />}
                  />
                  <PageRow
                    y={moved ? Y.rowAfter : Y.rowBefore}
                    pageKey="LUM-2"
                  />
                  <Band
                    y={moved ? Y.buildingAfter : Y.buildingBefore}
                    label="Building"
                    count={counted ? 1 : 2}
                    glyph={
                      <StatusBuildingFigmaIcon className="ih-glyph-building" />
                    }
                  />
                  <PageRow y={Y.next} pageKey="LUM-5" />
                  {/* The page that builds and travels up. */}
                  <PageRow
                    y={s.phase === "building" ? Y.newBefore : Y.slot}
                    pageKey="LUM-4"
                    title={SAMPLE_BRAND.headline}
                    travel={s.travel}
                    gone={s.phase === "leaving"}
                  />
                  {/* The next one, fading in where it started. */}
                  <PageRow
                    y={Y.newBefore}
                    pageKey="LUM-4"
                    title={SAMPLE_BRAND.headline}
                    entering
                    gone={s.phase !== "leaving"}
                  />
                </div>
              </div>
            </div>
          </div>
        );
      }}
    </Stage>
  );
}

/** A status group's band (D70): its glyph, its label and its count (crossfading as it changes:
 * a rolling digit's strip peeks at this size). */
function Band({
  y,
  label,
  count,
  glyph,
}: {
  y: number;
  label: string;
  count: number;
  glyph: ReactNode;
}) {
  return (
    <div className="ih-band" style={{ translate: `0 ${y}px` }}>
      {glyph}
      <span className="ih-band__label">{label}</span>
      <span className="ih-band__count">
        <States
          value={String(count) as "1" | "2"}
          states={{ "1": "1", "2": "2" }}
        />
      </span>
    </div>
  );
}

/** A page's row: its type tile, its key, its title (or a bar), the brand's mark. */
function PageRow({
  y,
  pageKey,
  title,
  travel,
  gone,
  entering,
}: {
  y: number;
  pageKey: string;
  title?: string;
  travel?: boolean;
  gone?: boolean;
  entering?: boolean;
}) {
  return (
    <div
      className="ih-prow"
      data-travel={travel || undefined}
      data-gone={gone || undefined}
      data-entering={entering || undefined}
      style={{ translate: `0 ${y}px` }}
    >
      <span className="ih-prow__type">
        <TypeAdvertorialFigmaIcon />
      </span>
      <span className="ih-prow__key">{pageKey}</span>
      {title ? (
        <span className="ih-prow__title">{title}</span>
      ) : (
        <Bar w={96} h={5} tone={3} />
      )}
      <span
        className="ih-prow__mark"
        style={{ background: SAMPLE_BRAND.palette[0] }}
      >
        {SAMPLE_BRAND.name.charAt(0)}
      </span>
    </div>
  );
}
