"use client";

import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { Mover } from "@/components/app/mover";

/** The panel's width at rest (Figma Build: 320 px, the w-panel token) and its limits. */
const PANEL_MIN = 320;
const PANEL_MAX = 640;
/** The preview keeps at least this much room when the panel widens. */
const PREVIEW_MIN = 400;
const WIDTH_KEY = "lp-build-panel-width";

const noSubscribe = () => () => {};

function readSavedWidth(): number | null {
  try {
    const saved = Number(localStorage.getItem(WIDTH_KEY));
    return saved >= PANEL_MIN && saved <= PANEL_MAX ? saved : null;
  } catch {
    // Storage blocked: the panel opens at rest.
    return null;
  }
}

/**
 * The build page under its header (Figma Build): on Foreground-01, the preview column 24 px in
 * from the left and 24 px down, 16 px from the right panel; the panel (Surface-Primary, a 0.7 px
 * Stroke-Strong line on its left, 24 px down, 16 px in, 12 px at the foot, its blocks 10 px apart)
 * scrolls on its own. The Mover sits on the line, centred in the view, and resizes the panel;
 * the width is remembered in this browser. Below `lg` the preview stacks above the panel.
 */
export function BuildWorkspace({
  preview,
  panel,
}: {
  preview: ReactNode;
  panel: ReactNode;
}) {
  // The remembered width is read on the client only (the server renders the panel at rest);
  // a drag or key press takes over from it.
  const saved = useSyncExternalStore(noSubscribe, readSavedWidth, () => null);
  const [chosen, setChosen] = useState<number | null>(null);
  const width = chosen ?? saved ?? PANEL_MIN;
  const root = useRef<HTMLDivElement>(null);

  const max = useCallback(
    () =>
      Math.min(
        PANEL_MAX,
        (root.current?.clientWidth ?? PANEL_MAX + PREVIEW_MIN) - PREVIEW_MIN,
      ),
    [],
  );
  const remember = useCallback((value: number) => {
    try {
      localStorage.setItem(WIDTH_KEY, String(value));
    } catch {
      // Storage blocked: the width lasts for this visit.
    }
  }, []);

  return (
    <div
      ref={root}
      className="flex min-h-0 flex-1 flex-col bg-foreground-01 lg:flex-row"
    >
      <div className="flex h-screen min-w-0 shrink-0 flex-col gap-2.5 px-4 pt-6 lg:mr-4 lg:h-auto lg:flex-1 lg:shrink lg:pr-0 lg:pl-6">
        {preview}
      </div>
      <aside
        aria-label="Build details"
        // The panel's width follows the Mover (data, not styling).
        style={{ "--panel-width": `${width}px` } as CSSProperties}
        className="relative flex min-h-0 shrink-0 flex-col bg-surface-primary divider-t-strong lg:w-(--panel-width) lg:divider-l-panel"
      >
        <Mover
          value={width}
          min={PANEL_MIN}
          max={max}
          defaultValue={PANEL_MIN}
          side="right"
          label="Resize the build panel"
          onChange={setChosen}
          onCommit={remember}
          className="absolute top-1/2 -left-1.75 hidden -translate-y-1/2 lg:flex"
        />
        <div // Blocks keep their height and the column scrolls (the steps card clips its corners, so it
          // would otherwise shrink away when the panel is short).
          className="flex flex-col gap-2.5 px-4 pt-6 pb-3 *:shrink-0 lg:min-h-0 lg:flex-1 lg:overflow-y-auto"
        >
          {panel}
        </div>
      </aside>
    </div>
  );
}
