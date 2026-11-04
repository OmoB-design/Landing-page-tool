"use client";

import { CheckIcon } from "@/components/ui/icons";
import { ShopifyLogo, VercelLogo } from "@/components/ui/lp-icons";
import type { Act } from "@/components/ui/stageshow/act";
import { Connector } from "@/components/ui/stageshow/motion/Connector";
import { Stage } from "@/components/ui/stageshow/stage";
import { Bar } from "@/components/ui/stageshow/window";
import { SAMPLE_BRAND } from "@/lib/illustrations/sample-brand";

import "../look.css";
import "./connect.css";

/*
 * What connecting does (I4), at the top of the Connect Vercel and Connect a Shopify store
 * modals: a page in the brand, a line to the service's mark, and what comes out the other side
 * (Vercel: the live address on the brand's project; Shopify: a draft page in the store). The
 * first line draws, the mark is ticked as connected, the second line draws and the result
 * arrives; then it holds. Plays once when the modal opens; reduced motion shows the end. Follows
 * the app's theme. Drawn 1:1 at the modal's 400 px content width; the stage shrinks to fit a
 * narrower one.
 */

export type ConnectService = "vercel" | "shopify";

const W = 400;
// A 16 px gutter above and below the page, as the filming checks ask.
const H = 98;
const MID = H / 2;
/** Room for a line between the parts; it leaves Vercel's address a 16 px gutter on the right. */
const GAP = 38;
/** How far a line stops short of what it joins. */
const INSET = 4;
/** The service's mark in the middle, where the modal's logo tile was; the page comes in from the
 * left and the result goes out to the right, a gap either side. */
const TILE = { x: (W - 44) / 2, size: 44 };
const PAGE = { x: TILE.x - GAP - 60, width: 60, height: 66 };
const RESULT = { x: TILE.x + TILE.size + GAP };

type S = { step: 0 | 1 | 2 | 3 };
const initial: S = { step: 0 };
/** Reduced motion, and the end: connected, the page out the other side. */
const poster: S = { step: 3 };

async function script(a: Act<S>) {
  await a.wait(350);
  await a.set({ step: 1 });
  await a.wait(560);
  await a.set({ step: 2 });
  await a.wait(520);
  await a.set({ step: 3 });
}

const RESULTS: Record<ConnectService, { text: string; live: boolean }> = {
  // A brand's Vercel project is named lp-<prefix>, and its address follows (providers/vercel.py).
  vercel: { text: "lp-lum.vercel.app", live: true },
  // Shopify gets an unpublished page: a draft, not live (publish_shopify.py).
  shopify: { text: "Draft page", live: false },
};

export function ConnectScene({ service }: { service: ConnectService }) {
  const result = RESULTS[service];
  const brand = SAMPLE_BRAND;
  return (
    <div
      aria-hidden
      className="w-full"
      data-illustration={`connect-${service}`}
    >
      <Stage
        width={W}
        height={H}
        initial={initial}
        poster={poster}
        script={script}
        play="once"
        unframed
        className="lp-look ic"
      >
        {(s) => (
          <>
            {/* The page, in the brand. */}
            <div
              className="ic-page"
              style={{
                left: PAGE.x,
                top: MID - PAGE.height / 2,
                width: PAGE.width,
                height: PAGE.height,
              }}
            >
              <span
                className="ic-page__band"
                style={{ background: brand.palette[0] }}
              />
              <span className="ic-page__lines">
                <Bar w={34} h={4} tone={4} />
                <Bar w={26} h={3} tone={2} />
              </span>
              <span
                className="ic-page__picture"
                style={{ background: brand.palette[1] }}
              />
              <span
                className="ic-page__button"
                style={{ background: brand.palette[2] }}
              />
            </div>

            {/* The service: its mark on the double tile of the Shopify modal's header. */}
            <div
              className="ic-tile"
              data-on={s.step >= 2 || undefined}
              style={{
                left: TILE.x,
                top: MID - TILE.size / 2,
                width: TILE.size,
                height: TILE.size,
              }}
            >
              <span className="ic-tile__inner">
                {service === "vercel" ? (
                  <VercelLogo className="ic-tile__vercel" />
                ) : (
                  <ShopifyLogo className="ic-tile__shopify" />
                )}
              </span>
              <span className="ic-tile__check">
                <CheckIcon strokeWidth={3} />
              </span>
            </div>

            {/* What comes out: the live address, or the draft. */}
            <div
              className="ic-result"
              data-in={s.step >= 3 || undefined}
              data-live={result.live || undefined}
              style={{ left: RESULT.x, top: MID }}
            >
              <span className="ic-result__dot" />
              <span className="ic-result__text">{result.text}</span>
            </div>

            <Connector
              from={{ x: PAGE.x + PAGE.width + INSET, y: MID }}
              to={{ x: TILE.x - INSET, y: MID }}
              route="straight"
              dots="none"
              show={s.step >= 1}
              className="ic-line"
            />
            <Connector
              from={{ x: TILE.x + TILE.size + INSET, y: MID }}
              to={{ x: RESULT.x - INSET, y: MID }}
              route="straight"
              dots="none"
              show={s.step >= 2}
              className="ic-line"
            />
          </>
        )}
      </Stage>
    </div>
  );
}
