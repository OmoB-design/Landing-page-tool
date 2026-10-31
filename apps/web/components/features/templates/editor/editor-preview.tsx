"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { MonitorIcon, PhoneIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

type Viewport = "desktop" | "phone";

/**
 * The template's page in a sandboxed frame that runs only the editor's bridge script
 * (`/preview/template/[id]?editor=1`): the selected section has a solid highlight outline and a
 * hovered one a dashed outline; clicking a section selects it here too. The frame reloads when
 * a change saves a new version, and scrolls back to the selected section.
 */
export function EditorPreview({
  templateId,
  version,
  selected,
  onSelect,
  sections,
  minutes,
}: {
  templateId: string;
  version: number;
  selected: string | null;
  onSelect: (key: string) => void;
  sections: number;
  minutes: number;
}) {
  const [viewport, setViewport] = useState<Viewport>("desktop");
  const frame = useRef<HTMLIFrameElement>(null);
  // A click inside the frame already shows its section; only scroll for outside selections.
  const fromFrame = useRef(false);
  const src = `/preview/template/${templateId}?editor=1&v=${version}`;

  const send = useCallback(
    (scroll: boolean, instant: boolean) => {
      const colour = getComputedStyle(document.documentElement)
        .getPropertyValue("--color-highlight-yellow-500")
        .trim();
      // The frame has an opaque origin, so "*" is the only target; nothing sensitive is sent.
      frame.current?.contentWindow?.postMessage(
        { type: "lp-select", key: selected, colour, scroll, instant },
        "*",
      );
    },
    [selected],
  );

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.source !== frame.current?.contentWindow) return;
      const data = event.data as { type?: unknown; key?: unknown } | null;
      if (data?.type === "lp-ready") send(true, true);
      if (data?.type === "lp-select" && typeof data.key === "string") {
        fromFrame.current = true;
        onSelect(data.key);
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [onSelect, send]);

  useEffect(() => {
    send(!fromFrame.current, false);
    fromFrame.current = false;
  }, [send]);

  return (
    <section
      aria-label="Preview"
      className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 p-4 lg:px-6 lg:py-5"
    >
      <div className="flex items-center justify-between gap-3">
        {/* Figma 739:16891 (light): a Foreground-03 track with a 0.4 px Stroke edge, 26 px segments
            in 12 px Heading-02, the chosen one Surface-Primary. Dark keeps 739:16489's colours: a
            Foreground-01 track and the chosen segment on Letter-Paper, raised. */}
        <div
          role="group"
          aria-label="Preview width"
          className="flex items-center rounded-md bg-foreground-03 p-0.5 ring-hair ring-stroke ring-inset dark:bg-foreground-01 dark:ring-0"
        >
          {(
            [
              ["desktop", "Desktop", MonitorIcon],
              ["phone", "Phone", PhoneIcon],
            ] as const
          ).map(([id, label, ViewIcon]) => (
            <Button
              key={id}
              variant="ghost"
              size="sm"
              aria-pressed={viewport === id}
              onClick={() => setViewport(id)}
              className="group/view h-6.5 gap-1 rounded-sm px-1.5 text-type-caption-1 font-medium text-heading-02 hover:bg-transparent hover:text-body aria-pressed:bg-surface-primary dark:text-sub-text dark:aria-pressed:bg-letter-paper dark:aria-pressed:text-body dark:aria-pressed:shadow-sm"
            >
              <ViewIcon
                aria-hidden
                className="size-3.5 text-icon-system group-aria-pressed/view:text-stroke-input-active"
              />
              {label}
            </Button>
          ))}
        </div>
        <p className="text-type-caption-1 text-sub-text tabular-nums">
          {sections} {sections === 1 ? "section" : "sections"} · about {minutes}{" "}
          min read
        </p>
      </div>
      {/* The page sits 12 px inside a square well with a 0.7 px line: Foreground-02 in light
          (Figma 739:16891), Surface-Modal in dark (722:14843). */}
      <div className="flex min-h-0 flex-1 justify-center overflow-hidden bg-foreground-02 p-3 ring-thin ring-stroke ring-inset dark:bg-surface-modal">
        <iframe
          ref={frame}
          key={src}
          src={src}
          title="Template preview"
          sandbox="allow-scripts"
          className={cn(
            "h-full border-0 bg-surface-primary",
            viewport === "phone"
              ? "w-preview-mobile border-x border-stroke"
              : "w-full",
          )}
        />
      </div>
    </section>
  );
}
