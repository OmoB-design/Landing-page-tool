"use client";

import Link from "next/link";
import { type CSSProperties, useLayoutEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

export type PagesTab = {
  id: "all" | "mine";
  label: string;
  count: number;
  href: string;
};

/**
 * All pages / My pages (Figma: All Pages and My Pages): 13 px medium labels with a count pill,
 * 32 px apart, and a 2 px line under the current view that slides to the other on click. The
 * line moves as soon as you click (the list follows when the server answers); before the first
 * measurement it is drawn under the current tab so nothing jumps on load.
 */
export function PagesTabs({
  tabs,
  active,
}: {
  tabs: PagesTab[];
  active: PagesTab["id"];
}) {
  const [pending, setPending] = useState<PagesTab["id"] | null>(null);
  const [shown, setShown] = useState(active);
  // A new view from the server replaces the optimistic one.
  if (shown !== active) {
    setShown(active);
    setPending(null);
  }
  const current = pending ?? active;

  const refs = useRef<Partial<Record<PagesTab["id"], HTMLAnchorElement>>>({});
  const [line, setLine] = useState<{ x: number; width: number } | null>(null);
  const [animate, setAnimate] = useState(false);

  useLayoutEffect(() => {
    const tab = refs.current[current];
    if (!tab) return;
    const measure = () =>
      setLine({ x: tab.offsetLeft, width: tab.offsetWidth });
    measure();
    // Only slide after the first placement, so the line doesn't fly in on load.
    const frame = requestAnimationFrame(() => setAnimate(true));
    const observer = new ResizeObserver(measure);
    observer.observe(tab);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [current]);

  return (
    <nav aria-label="Page views" className="relative flex h-full gap-8">
      {tabs.map((tab) => {
        const isCurrent = tab.id === current;
        return (
          <Link
            key={tab.id}
            ref={(element) => {
              if (element) refs.current[tab.id] = element;
            }}
            href={tab.href}
            aria-current={isCurrent ? "page" : undefined}
            onClick={() => setPending(tab.id)}
            className="relative flex h-full items-center gap-1 text-type-body-small font-medium text-heading-01 outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {tab.label}
            <span className="min-w-5.75 rounded-lg bg-foreground-01 px-1 text-center text-type-caption-1 font-medium text-heading-01 tabular-nums">
              {tab.count}
            </span>
            {isCurrent && line === null ? <Line className="inset-x-0" /> : null}
          </Link>
        );
      })}
      {line ? (
        <Line
          className={cn(
            "left-0",
            animate && "transition-slide motion-reduce:transition-none",
          )}
          // Where the current tab is (measured), not a style choice.
          style={{ translate: `${line.x}px 0`, width: line.width }}
        />
      ) : null}
    </nav>
  );
}

/** The current-view line (Figma: Surface/Tab-Indicator; near-black in light, Foreground-03 in dark). */
function Line({
  className,
  style,
}: {
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "pointer-events-none absolute bottom-0 h-0.5 bg-tab-indicator",
        className,
      )}
      style={style}
    />
  );
}
