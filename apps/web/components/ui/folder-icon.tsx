"use client";

import { motion, useReducedMotion } from "motion/react";

/*
 * The folder from the owner's portfolio (omob.work, its Explorations list; owner, 2026-11-06),
 * taken from its live code: a tilted folder with a gradient back tab, three little pictures
 * peeking out, and its front panel (the portfolio's SVGs, in public/folder). Hovered, it
 * straightens (0.42 s on the portfolio's ease-out). Its colours are the portfolio's own, so it
 * lives here in components/ui (D38). LP changes (owner, 2026-11-06): red by default; hovered, the
 * pictures rise slowly out of it (0.9 s) instead of dropping in; a soft glint crosses its front
 * every few seconds (`folder-shimmer` in globals.css; none with reduced motion); the pictures are
 * passed in (a batch's template thumbnails), a missing one is a blank tile; and `scale` sizes it
 * for a list row.
 */
const TONES = {
  red: {
    rotate: -8,
    grad: "linear-gradient(119.83deg, rgb(243,60,59) 9.889%, rgb(212,39,38) 90.111%)",
    border: "0.157px solid #ff828e",
    headerRadius: "5.233px",
    shadow: "drop-shadow(0px 2px 2.55px rgba(26,26,26,0.25))",
    panelInset: "-11.36% -8.72%",
  },
  dark: {
    rotate: 8,
    grad: "linear-gradient(119.83deg, rgb(40,38,38) 9.889%, rgb(21,19,19) 90.111%)",
    border: "0.157px solid #646464",
    headerRadius: "5.233px",
    shadow: "drop-shadow(0px 2px 1.75px rgba(16,16,16,0.25))",
    panelInset: "-11.36% -8.72%",
  },
  purple: {
    rotate: -6,
    grad: "linear-gradient(106.31deg, rgb(85,71,165) 40.769%, rgb(64,53,124) 87.534%)",
    border: "0.118px solid #887ad8",
    headerRadius: "3.947px",
    shadow: "drop-shadow(0px 1px 2px rgba(0,0,0,0.25))",
    panelInset: "-8.57% -6.58%",
  },
} as const;

export type FolderTone = keyof typeof TONES;

const STILLS = [
  { left: 1.51, top: 0.55, rotate: -5, border: "0.157px", shadow: false },
  { left: 23.23, top: 5.26, rotate: -5, border: "0.262px", shadow: true },
  { left: 15.38, top: 1.07, rotate: 5, border: "0.157px", shadow: false },
];

const MORPH = { duration: 0.42, ease: [0.22, 1, 0.36, 1] as const };
// LP change (owner, 2026-11-06): hovered, the papers rise slowly out of the folder instead of
// dropping into it.
const PAPER_RISE = -7;
const RISE = { duration: 0.9, ease: [0.22, 1, 0.36, 1] as const };

export function FolderIcon({
  tone = "red",
  stills = [],
  hovered = false,
  scale = 1,
  shimmer = true,
  className,
}: {
  tone?: FolderTone;
  /** Up to three pictures peeking out of it. */
  stills?: string[];
  hovered?: boolean;
  /** 1 is the portfolio's 55 x 59 tile. */
  scale?: number;
  /** A soft glint passes across the folder's front every few seconds (owner, 2026-11-06). */
  shimmer?: boolean;
  className?: string;
}) {
  const reduced = useReducedMotion() ?? false;
  const look = TONES[tone];
  const transition = reduced ? { duration: 0 } : MORPH;
  return (
    <span
      aria-hidden
      className={["relative block shrink-0", className]
        .filter(Boolean)
        .join(" ")}
      style={{ width: 55 * scale, height: 59 * scale }}
    >
      <span
        className="absolute top-0 left-0 block"
        style={{
          width: 55,
          height: 59,
          transform: `scale(${scale})`,
          transformOrigin: "0 0",
        }}
      >
        <motion.span
          className="absolute top-1/2 left-1/2 block"
          style={{ x: "-50%", y: "-50%" }}
          initial={false}
          animate={{ rotate: hovered ? 0 : look.rotate }}
          transition={transition}
        >
          <span
            className="relative block overflow-hidden"
            style={{
              width: 45,
              height: 41.076,
              borderRadius: 5.233,
              filter: look.shadow,
            }}
          >
            {/* The back tab. */}
            <span
              className="absolute top-0 left-0 block"
              style={{
                width: 44.215,
                height: 19.099,
                backgroundImage: look.grad,
                border: look.border,
                borderTopLeftRadius: look.headerRadius,
                borderTopRightRadius: look.headerRadius,
              }}
            />
            {STILLS.map((still, i) => (
              <motion.span
                key={i}
                className="absolute flex items-center justify-center"
                style={{
                  left: still.left,
                  top: still.top,
                  width: 20,
                  height: 21.665,
                }}
                initial={false}
                animate={{ y: hovered ? PAPER_RISE : 0 }}
                transition={reduced ? { duration: 0 } : RISE}
              >
                <span
                  className="block"
                  style={{ transform: `rotate(${still.rotate}deg)` }}
                >
                  <span
                    className="relative block overflow-hidden bg-white"
                    style={{
                      width: 18.314,
                      height: 20.145,
                      borderRadius: 2.616,
                      border: `${still.border} solid rgba(0,0,0,0.12)`,
                      boxShadow: still.shadow
                        ? "0px -0.262px 2.119px 0.523px rgba(0,0,0,0.25)"
                        : undefined,
                    }}
                  >
                    {stills[i] ? (
                      // eslint-disable-next-line @next/next/no-img-element -- a page's thumbnail
                      <img
                        src={stills[i]}
                        alt=""
                        className="absolute inset-0 size-full object-cover object-top"
                      />
                    ) : null}
                    <span
                      className="absolute inset-0 block"
                      style={{
                        background:
                          "linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,0.2) 45.564%)",
                      }}
                    />
                  </span>
                </span>
              </motion.span>
            ))}
            {/* The front panel (the portfolio's SVG). */}
            <span
              className="absolute left-0 block"
              style={{ top: 6.54, width: 45, height: 34.535 }}
            >
              <span
                className="absolute block"
                style={{ inset: look.panelInset }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- a static vector */}
                <img
                  src={`/folder/panel-${tone}.svg`}
                  alt=""
                  className="block size-full max-w-none"
                />
              </span>
              {shimmer && !reduced ? (
                // The glint, cut to the panel's own shape (its SVG as a mask).
                <span
                  className="folder-shimmer absolute block"
                  style={{
                    inset: look.panelInset,
                    backgroundImage:
                      "linear-gradient(110deg, transparent 38%, rgba(255,255,255,0.5) 50%, transparent 62%)",
                    backgroundSize: "250% 100%",
                    backgroundRepeat: "no-repeat",
                    WebkitMaskImage: `url(/folder/panel-${tone}.svg)`,
                    maskImage: `url(/folder/panel-${tone}.svg)`,
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
