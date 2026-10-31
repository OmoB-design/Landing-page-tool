"use client";

import { useId, useRef, useState } from "react";

import { formatCost } from "@/components/app/row-meta";
import { SkeletonText } from "@/components/app/skeletons";
import { cn } from "@/lib/utils";

export type SpendColumn = {
  /** "12 Oct", "w/c 12 Oct" or "Oct 2026", formatted on the server. */
  label: string;
  spendUsd: number;
};

/** The exact figure for the tooltip: cents, or up to four places under a dollar ($0.0532). */
const EXACT = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});

/** A clean top for the axis: 1, 2, 2.5 or 5 × a power of ten, at or above the largest value. */
function niceMax(value: number) {
  if (value <= 0) return 1;
  const power = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find((m) => m * power >= value) ?? 10;
  return step * power;
}

/**
 * Spend over time (the dataviz method): one series, so one hue (Spot-500-Indigo, validated in
 * both themes) and no legend; columns at most 24 px with 4 px rounded tops on one baseline, a
 * hairline grid at 0, half and the top.
 *
 * The tooltip, as charting libraries and accessibility guidance do it (Observable Plot's tip,
 * PatternFly, MDN's tooltip role, WCAG 1.4.13): it sits above the hovered column with a caret
 * pointing at it, kept inside the chart at the edges; the exact figure leads, the period follows.
 * The whole column is the hover target, not just its painted bar. Keyboard: the columns are one
 * tab stop, arrow keys (and Home/End) move between them and show the tooltip, Escape hides it;
 * the column names the tooltip with `aria-describedby`. It stays open while the pointer is on it,
 * fades in the first time (150 ms) and moves between columns instantly. A hidden table keeps
 * every value for screen readers.
 */
export function SpendChart({ columns }: { columns: SpendColumn[] }) {
  const tipId = useId();
  const [active, setActive] = useState<number | null>(null);
  const [focusIndex, setFocusIndex] = useState(columns.length - 1);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const top = niceMax(Math.max(0, ...columns.map((c) => c.spendUsd)));
  const ticks = [top, top / 2, 0];
  const shown = active === null ? null : columns[active];
  // Few x labels, so they never collide: the first, the middle and the last period.
  const labelled = new Set([
    0,
    Math.floor((columns.length - 1) / 2),
    columns.length - 1,
  ]);

  const move = (to: number) => {
    const index = Math.max(0, Math.min(columns.length - 1, to));
    setFocusIndex(index);
    setActive(index);
    buttons.current[index]?.focus();
  };

  // The tooltip's place: centred on its column, held inside the chart near the edges.
  const centre = active === null ? 0 : ((active + 0.5) / columns.length) * 100;
  const edge = centre < 12 ? "start" : centre > 88 ? "end" : "middle";
  const barTop = shown ? Math.min(shown.spendUsd / top, 1) * 100 : 0;

  return (
    <figure
      className="flex flex-col gap-2"
      onKeyDown={(event) => {
        if (event.key === "Escape") setActive(null);
      }}
    >
      <div className="flex gap-3 pt-10">
        <div
          aria-hidden
          className="flex h-40 w-12 shrink-0 flex-col justify-between text-right text-type-caption-2 text-heading-05 tabular-nums"
        >
          {ticks.map((tick) => (
            <span
              key={tick}
              className="-translate-y-1/2 first:translate-y-0 last:translate-y-0"
            >
              {formatCost(tick)}
            </span>
          ))}
        </div>
        <div
          className="relative h-40 min-w-0 flex-1"
          onPointerLeave={() => setActive(null)}
        >
          <div
            aria-hidden
            className="absolute inset-0 flex flex-col justify-between"
          >
            {ticks.map((tick) => (
              <span key={tick} className="h-px w-full bg-stroke" />
            ))}
          </div>
          {columns.every((column) => column.spendUsd === 0) ? (
            <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-type-caption-1 text-heading-05">
              No spend in this period
            </p>
          ) : null}
          <div className="absolute inset-0 flex items-end gap-0.5">
            {columns.map((column, index) => (
              <button
                key={column.label}
                ref={(node) => {
                  buttons.current[index] = node;
                }}
                type="button"
                tabIndex={index === focusIndex ? 0 : -1}
                aria-label={`${column.label}: ${EXACT.format(column.spendUsd)}`}
                aria-describedby={active === index ? tipId : undefined}
                onPointerEnter={() => setActive(index)}
                onFocus={() => {
                  setFocusIndex(index);
                  setActive(index);
                }}
                onBlur={() => setActive(null)}
                onKeyDown={(event) => {
                  const to =
                    event.key === "ArrowRight"
                      ? index + 1
                      : event.key === "ArrowLeft"
                        ? index - 1
                        : event.key === "Home"
                          ? 0
                          : event.key === "End"
                            ? columns.length - 1
                            : null;
                  if (to === null) return;
                  event.preventDefault();
                  move(to);
                }}
                className="group/col flex h-full min-w-0 flex-1 items-end justify-center rounded-xsm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span
                  className={cn(
                    "w-full max-w-6 rounded-t-xsm bg-spot-500-indigo transition-opacity duration-150 ease-out",
                    active !== null && active !== index && "opacity-60",
                  )}
                  style={{
                    height: `${(column.spendUsd / top) * 100}%`,
                    minHeight: column.spendUsd > 0 ? 2 : 0,
                  }}
                />
              </button>
            ))}
          </div>
          {shown ? (
            <div
              id={tipId}
              role="tooltip"
              // Hoverable (WCAG 1.4.13): over the tooltip, its column stays shown.
              onPointerEnter={() => setActive(active)}
              className={cn(
                "absolute z-10 mb-2 flex animate-tooltip-in flex-col gap-0.5 rounded-sm bg-surface-modal px-2 py-1.5 whitespace-nowrap shadow-float edge-hairline motion-reduce:animate-none",
                edge === "middle" && "-translate-x-1/2",
                edge === "end" && "-translate-x-full",
              )}
              style={{
                left:
                  edge === "start"
                    ? `${(active! / columns.length) * 100}%`
                    : edge === "end"
                      ? `${((active! + 1) / columns.length) * 100}%`
                      : `${centre}%`,
                bottom: `${barTop}%`,
              }}
            >
              <span className="text-type-caption-1 font-semibold text-heading-01 tabular-nums">
                {EXACT.format(shown.spendUsd)}
              </span>
              <span className="text-type-caption-2 text-heading-05">
                {shown.label}
              </span>
              <span
                aria-hidden
                className={cn(
                  "absolute top-full -mt-1 size-2 rotate-45 bg-surface-modal",
                  edge === "middle" && "left-1/2 -translate-x-1/2",
                  edge === "start" && "left-2",
                  edge === "end" && "right-2",
                )}
              />
            </div>
          ) : null}
        </div>
      </div>
      <div
        aria-hidden
        className="ml-15 flex text-type-caption-2 text-heading-05"
      >
        {columns.map((column, index) => (
          <span key={column.label} className="relative min-w-0 flex-1">
            {labelled.has(index) ? (
              <span
                className={
                  index === 0
                    ? "absolute left-0 whitespace-nowrap"
                    : index === columns.length - 1
                      ? "absolute right-0 whitespace-nowrap"
                      : "absolute left-1/2 -translate-x-1/2 whitespace-nowrap"
                }
              >
                {column.label}
              </span>
            ) : null}
          </span>
        ))}
      </div>
      <table className="sr-only">
        <caption>Spend by period</caption>
        <thead>
          <tr>
            <th scope="col">Period</th>
            <th scope="col">Spend</th>
          </tr>
        </thead>
        <tbody>
          {columns.map((column) => (
            <tr key={column.label}>
              <td>{column.label}</td>
              <td>{EXACT.format(column.spendUsd)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

/** The chart while analytics loads: its grid and axes in place, the values as lines (2026-10-31). */
export function SpendChartSkeleton() {
  return (
    <div aria-hidden className="flex flex-col gap-2">
      <div className="flex gap-3 pt-10">
        <div className="flex h-40 w-12 shrink-0 flex-col items-end justify-between">
          {[0, 1, 2].map((tick) => (
            <SkeletonText
              key={tick}
              className="text-type-caption-2"
              width={32}
            />
          ))}
        </div>
        <div className="relative h-40 min-w-0 flex-1">
          <div className="absolute inset-0 flex flex-col justify-between">
            {[0, 1, 2].map((tick) => (
              <span key={tick} className="h-px w-full bg-stroke" />
            ))}
          </div>
        </div>
      </div>
      {/* The loaded labels hang below a row with no height, so these do too. */}
      <div className="relative ml-15">
        <div className="absolute inset-x-0 top-0 flex justify-between">
          {[0, 1, 2].map((label) => (
            <SkeletonText
              key={label}
              className="text-type-caption-2"
              width={36}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
