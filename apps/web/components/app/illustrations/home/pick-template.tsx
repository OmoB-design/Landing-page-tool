"use client";

import { ChevronUpIcon, LockIcon } from "@/components/ui/icons";
import { ChevronLeftFigmaIcon, GripDotsIcon } from "@/components/ui/lp-icons";
import type { Act } from "@/components/ui/stageshow/act";
import { Stage } from "@/components/ui/stageshow/stage";
import { Bar } from "@/components/ui/stageshow/window";
import { SAMPLE_BRAND } from "@/lib/illustrations/sample-brand";

import "../look.css";
import { FRAMED, onStage, STAGE, ZOOM } from "./frame";
import "./home.css";

/*
 * Pick a template (I1), after Quality's Set up Quality card: LP's section editor in miniature,
 * in Quality's browser frame, a gutter in from every edge, the editor drawn at 800 px and scaled to
 * the frame (0.4075, by zoom), so its 12 and 13 px type shrinks with it and stays sharp. The cursor carries Reviews
 * above Benefits by its grip; the rows make room and the page preview's sections swap with
 * them; it holds, then carries it back. A loop.
 */

// Quality's browser frame, a gutter in from every edge.
const FRAME = FRAMED;
/** Quality's address pill, centred in the bar. */
const URL_WIDTH = 175.113;
const BAR = 17.097;
const SCALE = FRAME.width / 800;
const PITCH = 40; // a 36 px row and a 4 px gap

type Section = { id: string; role: string; name: string; h: number };

const SECTIONS: Section[] = [
  { id: "hero", role: "Hero", name: SAMPLE_BRAND.headline, h: 168 },
  { id: "benefits", role: "Benefits", name: "Why Lume", h: 92 },
  { id: "reviews", role: "Reviews", name: "Real wearers", h: 92 },
  { id: "compare", role: "Comparison", name: "Lume vs leather", h: 84 },
  { id: "faq", role: "FAQ", name: "Questions", h: 76 },
  { id: "guarantee", role: "Guarantee", name: "Try them for 30 days", h: 60 },
  { id: "footer", role: "Footer", name: "Shop now", h: 56 },
];

/** The order; the carried row, its slot when picked up and how far it has moved (editor px). */
type S = { order: string[]; lifted: string | null; base: number; dy: number };

const START = SECTIONS.map((s) => s.id);
const MOVED = [
  "hero",
  "reviews",
  "benefits",
  "compare",
  "faq",
  "guarantee",
  "footer",
];
const initial: S = { order: START, lifted: null, base: 0, dy: 0 };
/** Reduced motion: Reviews moved above Benefits. */
const poster: S = { ...initial, order: MOVED };

/** Carries a row by its grip to a slot, the rows it passes making room. */
async function carry(a: Act<S>, from: string[], up: boolean) {
  const grip = a.rect("grip-reviews");
  const start = { x: grip.x + grip.width / 2, y: grip.y + grip.height / 2 };
  await a.move(start, { duration: 600 });
  await a.wait(200);
  // The editor's px in the stage's: its zoom inside the canvas's.
  const step = PITCH * SCALE * ZOOM;
  const at0 = from.indexOf("reviews");
  let order = from;
  await a.drag(
    { x: start.x + 1, y: start.y + (up ? -step : step) },
    (at) => {
      const dy = (at.y - start.y) / (SCALE * ZOOM);
      const slot = Math.max(
        0,
        Math.min(6, Math.round((at0 * PITCH + dy) / PITCH)),
      );
      const rest = from.filter((id) => id !== "reviews");
      order = [...rest.slice(0, slot), "reviews", ...rest.slice(slot)];
      a.put({ lifted: "reviews", base: at0, dy, order });
    },
    { duration: 700 },
  );
  a.put({ lifted: null, base: 0, dy: 0, order });
}

async function script(a: Act<S>) {
  await a.wait(500);
  await carry(a, START, true);
  await a.move(REST, { duration: 600 });
  await a.wait(1600);
  await carry(a, MOVED, false);
  await a.move(REST, { duration: 600 });
  await a.wait(400);
}

/** Where the cursor rests: over the preview, clear of the page's words. */
const REST = onStage({ x: 330, y: 210 });

export function PickTemplateScene() {
  return (
    <Stage
      width={STAGE.width}
      height={STAGE.height}
      initial={initial}
      poster={poster}
      script={script}
      cursor={{ at: REST, idle: false }}
      className="lp-look-light ih ih-template"
    >
      {(s) => {
        const moved = s.order.indexOf("reviews") < s.order.indexOf("benefits");
        // The page's sections, stacked in the list's order.
        const tops: Record<string, number> = {};
        let y = 14;
        for (const id of s.order) {
          tops[id] = y;
          y += SECTIONS.find((sec) => sec.id === id)!.h + 10;
        }
        return (
          <div className="ih-canvas" style={{ zoom: ZOOM }}>
            <div
              className="ss-window ih-browser"
              style={{
                left: FRAME.left,
                top: FRAME.top,
                width: FRAME.width,
                height: FRAME.height,
              }}
            >
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
                  app.lpplatform.com/templates/classic-advertorial
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
                <div className="ih-editor">
                  <div className="ih-ebar">
                    <span className="ih-ebar__left">
                      <ChevronLeftFigmaIcon />
                      Classic advertorial
                      <span className="ih-saved">Saved · version 3</span>
                    </span>
                    <span className="ih-use">Use template</span>
                  </div>
                  <div className="ih-ebody">
                    <div className="ih-panel">
                      <div className="ih-tabs">
                        <span>Content</span>
                        <span>Look</span>
                        <span>Details</span>
                      </div>
                      <div className="ih-ghead">
                        Whole template · 7 sections
                        <ChevronUpIcon />
                      </div>
                      <div className="ih-rows">
                        {SECTIONS.map((sec) => {
                          const lifted = s.lifted === sec.id;
                          // The carried row rides the cursor from its slot; the rest sit in theirs.
                          const rowY = lifted
                            ? s.base * PITCH + s.dy
                            : s.order.indexOf(sec.id) * PITCH;
                          return (
                            <div
                              key={sec.id}
                              className="ih-slot"
                              data-lifted={lifted || undefined}
                              style={{ translate: `0 ${rowY}px` }}
                            >
                              <div
                                className="ih-row"
                                data-moved={
                                  (sec.id === "reviews" && (moved || lifted)) ||
                                  undefined
                                }
                              >
                                <span
                                  className="ih-grip"
                                  data-target={
                                    sec.id === "reviews"
                                      ? "grip-reviews"
                                      : undefined
                                  }
                                  data-cursor="grab"
                                >
                                  <GripDotsIcon width={16} height={16} />
                                </span>
                                <span className="ih-role">{sec.role}</span>
                                <span className="ih-name">{sec.name}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    <div className="ih-well" data-crop>
                      <div className="ih-page">
                        {SECTIONS.map((sec) => (
                          <div
                            key={sec.id}
                            className="ih-sec"
                            data-moved={
                              (sec.id === "reviews" &&
                                (moved || s.lifted !== null)) ||
                              undefined
                            }
                            style={{
                              translate: `0 ${tops[sec.id]}px`,
                              height: sec.h,
                            }}
                          >
                            <PreviewSection id={sec.id} />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      }}
    </Stage>
  );
}

/** A section of the page in the preview: the brand's bar and headline, then quiet blocks. */
function PreviewSection({ id }: { id: string }) {
  const brand = SAMPLE_BRAND;
  if (id === "hero")
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div
          style={{
            height: 22,
            borderRadius: 3,
            background: brand.palette[0],
          }}
        />
        <div
          style={{
            fontFamily: "var(--font-serif)",
            fontSize: 22,
            fontWeight: 500,
            color: "var(--grey-900)",
            textAlign: "center",
          }}
        >
          {brand.headline}
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element -- a fixed, local, decorative image inside an illustration */}
        <img
          src={brand.product.image}
          alt=""
          width={150}
          height={Math.round(150 / brand.product.aspect)}
          style={{ alignSelf: "center" }}
        />
      </div>
    );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <Bar w={120} h={8} tone={4} />
      <div style={{ display: "flex", gap: 8 }}>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{
              flex: 1,
              height: 46,
              borderRadius: 4,
              background: "var(--grey-50)",
            }}
          />
        ))}
      </div>
    </div>
  );
}
