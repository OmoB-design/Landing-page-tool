"use client";

import type { Act } from "@/components/ui/stageshow/act";
import { Stage } from "@/components/ui/stageshow/stage";
import { Bar } from "@/components/ui/stageshow/window";
import {
  GroupCaretIcon,
  MenuChevronIcon,
  NavBrandsIcon,
  NavHomeIcon,
  NavLibraryIcon,
  NavNewPageIcon,
  NavPagesIcon,
  NavTemplatesIcon,
  SidebarCollapseIcon,
  SidebarSearchIcon,
} from "@/components/ui/lp-icons";

import "../look.css";
import { GUTTER, onStage, STAGE, ZOOM } from "./frame";
import "./home.css";

/*
 * Add a brand (I1), after Quality's Create a project card: a close-up of LP's own sidebar in its
 * window, a gutter in from the top and left, running off the right and bottom; a large cursor drifts to Brands,
 * the row lights as it would under the pointer, and drifts back. A 4.5 s loop, as Quality's.
 */

type S = Record<string, never>;

/** Where the cursor rests between visits: over the page panel, right of the sidebar. */
const REST = onStage({ x: 330, y: 200 });

async function script(a: Act<S>) {
  await a.wait(700);
  await a.move({ at: "brands", x: 0.62, y: 0.6 }, { duration: 750 });
  await a.wait(1400);
  await a.move(REST, { duration: 750 });
  await a.wait(900);
}

export function AddBrandScene() {
  return (
    <Stage
      width={STAGE.width}
      height={STAGE.height}
      script={script}
      hover={["brands"]}
      cursor={{ at: REST, style: "large", idle: false }}
      className="lp-look-light ih ih-brand"
    >
      {() => (
        <div className="ih-canvas" style={{ zoom: ZOOM }}>
          <div
            className="ss-window ih-app"
            style={{ top: GUTTER, left: GUTTER }}
          >
            <div className="ih-side">
              <div className="ih-top">
                <span className="ih-ws">
                  <span className="ih-ws__mark" style={{ background: MARK }}>
                    L
                  </span>
                  <span className="ih-ws__name">Lume Studio</span>
                  <MenuChevronIcon className="ih-ws__chev" />
                </span>
                <span className="ih-top__icons">
                  <SidebarSearchIcon className="ih-top__icon" />
                  <SidebarCollapseIcon className="ih-top__icon" />
                </span>
              </div>
              <div className="ih-nav">
                <span className="ih-item">
                  <NavHomeIcon />
                  Home
                </span>
                <span className="ih-item">
                  <NavNewPageIcon />
                  New page
                </span>
                <span className="ih-group">
                  Workspace
                  <GroupCaretIcon />
                </span>
                <span className="ih-item">
                  <NavPagesIcon />
                  Pages
                </span>
                <span className="ih-item">
                  <NavTemplatesIcon />
                  Templates
                </span>
                <span className="ih-item" data-target="brands">
                  <NavBrandsIcon />
                  Brands
                </span>
                <span className="ih-item">
                  <NavLibraryIcon />
                  {/* The crop takes this row: filler, not words. */}
                  <Bar w={52} h={6} tone={3} />
                </span>
              </div>
            </div>
            <div className="ih-main">
              <div className="ih-head">
                <NavBrandsIcon />
                Brands
              </div>
              <div className="ih-title">Brands</div>
            </div>
          </div>
        </div>
      )}
    </Stage>
  );
}

/** The workspace's letter mark colour (one of LP's eight avatar colours). */
const MARK = "var(--color-avatar-c)";
