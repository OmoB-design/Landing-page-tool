"use client";

import { useEffect, useRef, useState } from "react";

import {
  LOCATE_SECTION_EVENT,
  sectionAnchor,
} from "@/lib/builds/preview-anchors";
import { cn } from "@/lib/utils";

type Viewport = "desktop" | "phone";

const VIEWPORTS: [Viewport, string][] = [
  ["desktop", "Desktop"],
  ["phone", "Phone"],
];

/**
 * The built page (Figma Build, the preview column): the Desktop / Phone switch (the chosen one on
 * Surface-Primary in light; Foreground-02 on the Dashboard frame in dark, as in 420:52507) and "Open in new
 * tab" above a Foreground-02 well (10 px in, to the foot of the view) holding the page on
 * Surface-Modal with a 0.8 px Surface/Stroke line down its left; at Phone it is 390 px wide,
 * centred. The page runs in a sandboxed frame (no scripts, no access to the app); `version`
 * changes when the page is rebuilt, so the frame reloads. A claim's section button jumps the
 * frame to that section, outlined.
 */
export function BuildPreview({
  buildId,
  version,
  ready,
  failed = false,
}: {
  buildId: string;
  version: string;
  ready: boolean;
  failed?: boolean;
}) {
  const [viewport, setViewport] = useState<Viewport>("desktop");
  const [hash, setHash] = useState("");
  const frame = useRef<HTMLDivElement>(null);
  const src = `/preview/${buildId}?v=${encodeURIComponent(version)}`;

  useEffect(() => {
    let raf = 0;
    const onLocate = (event: Event) => {
      const key = (event as CustomEvent<string>).detail;
      // The same fragment twice doesn't move the frame, so step through an empty one first
      // (both are jumps within the page: no reload).
      setHash("#_");
      raf = requestAnimationFrame(() => setHash(`#${sectionAnchor(key)}`));
      frame.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    };
    window.addEventListener(LOCATE_SECTION_EVENT, onLocate);
    return () => {
      window.removeEventListener(LOCATE_SECTION_EVENT, onLocate);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <>
      <div className="flex items-start justify-between gap-2.5">
        <div
          role="group"
          aria-label="Preview width"
          className="flex segmented-frame p-0.5"
        >
          {VIEWPORTS.map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={viewport === id}
              onClick={() => setViewport(id)}
              className="rounded-sm px-1.5 py-1 text-type-caption-1 font-medium text-heading-03 transition-colors duration-150 ease-out outline-none hover:text-heading-01 focus-visible:ring-2 focus-visible:ring-ring aria-pressed:bg-surface-primary aria-pressed:text-heading-01 dark:text-heading-02 dark:hover:text-heading-01 dark:aria-pressed:bg-foreground-02 dark:aria-pressed:text-heading-02"
            >
              {label}
            </button>
          ))}
        </div>
        {ready ? (
          <a
            href={src}
            target="_blank"
            rel="noreferrer"
            className="rounded-md border-(length:--line-hairline) border-stroke bg-surface-modal px-1.5 py-0.5 shadow-light transition-colors duration-150 ease-out outline-none hover:bg-foreground-01 focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="block py-1 text-type-caption-1 font-medium text-heading-02">
              Open in new tab
            </span>
          </a>
        ) : null}
      </div>
      <div className="flex min-h-0 flex-1 justify-center bg-foreground-02 p-2.5">
        <div
          ref={frame}
          className={cn(
            "divider-l-preview flex min-w-0 bg-surface-modal",
            viewport === "phone" ? "w-preview-mobile max-w-full" : "flex-1",
          )}
        >
          {ready ? (
            <iframe
              key={src}
              src={`${src}${hash}`}
              title="Page preview"
              sandbox=""
              className="size-full border-0 bg-page-canvas"
            />
          ) : (
            <p className="m-auto max-w-60 px-4 text-center text-type-caption-1 font-medium text-heading-05">
              {failed
                ? "This build failed. The steps on the right say where."
                : "The preview appears when the build finishes."}
            </p>
          )}
        </div>
      </div>
    </>
  );
}
