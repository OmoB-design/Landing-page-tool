"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";

import { ShimmerText } from "./shimmer-loader";

/*
 * Progress Tracker – a checklist with a progress bar, in a single self-contained file.
 * The styles are injected below, so no extra files are needed.
 *
 * From AffectUI (https://www.affectui.com, MIT – see THIRD_PARTY_NOTICES.md). Colours, radius and
 * font follow our design tokens via app/globals.css (DECISIONS.md D48).
 * LP changes: `readOnly` mode where steps reflect real state and link to where they are done
 * (`href`); read-only steps can also be "running" (spinner, shimmering label) or "failed" (cross
 * and a note); the title is an h2; every timing is 300 ms or less and rows stagger 50 ms
 * apart (D51).
 */

export type ProgressStep = {
  id: string;
  label: string;
  done?: boolean;
  /** Small icon on the right, e.g. the app the step belongs to */
  icon?: ReactNode;
  /** LP: in read-only mode the step links here (where the user does it) */
  href?: string;
  /** LP: read-only live state; "running" shows a spinner, "failed" a cross and `note` */
  status?: "running" | "failed";
  /** LP: a line under the label, e.g. why the step failed */
  note?: string;
};

export type ProgressTrackerProps = {
  title?: string;
  steps: ProgressStep[];
  /** Ticks the open steps one after another, then starts over – stops as soon as someone interacts */
  autoPlay?: boolean;
  /** Pause between two automatic steps, in ms */
  interval?: number;
  onChange?: (steps: ProgressStep[]) => void;
  /** LP: steps show their `done` state and cannot be ticked by hand; steps with `href` link there */
  readOnly?: boolean;
  className?: string;
};

export function ProgressTracker({
  title = "Getting started",
  steps: initial,
  autoPlay = false,
  interval = 2200,
  onChange,
  readOnly = false,
  className,
}: ProgressTrackerProps) {
  const [done, setDone] = useState(
    () => new Set(initial.filter((s) => s.done).map((s) => s.id)),
  );
  const [playing, setPlaying] = useState(autoPlay);

  // LP: read-only trackers always show the state they are given.
  const doneIds = readOnly
    ? new Set(initial.filter((s) => s.done).map((s) => s.id))
    : done;
  const total = initial.length;
  const count = doneIds.size;
  const progress = total ? count / total : 0;

  const toggle = (id: string) =>
    setDone((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      onChange?.(initial.map((s) => ({ ...s, done: next.has(s.id) })));
      return next;
    });

  // Auto play: tick the next open step; when all are done, start over
  useEffect(() => {
    if (!playing) return;
    const open = initial.find((s) => !done.has(s.id));
    const t = window.setTimeout(
      () => {
        if (open) toggle(open.id);
        else setDone(new Set(initial.filter((s) => s.done).map((s) => s.id)));
      },
      open ? interval : interval * 2,
    );
    return () => clearTimeout(t);
  }, [playing, done]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      className={["ui-progress", className].filter(Boolean).join(" ")}
      data-complete={count === total || undefined}
      onPointerDown={() => setPlaying(false)}
      onKeyDown={() => setPlaying(false)}
    >
      {/* React 19 hoists this into <head> once, no matter how many trackers render */}
      <style href="ui-progress-tracker" precedence="default">
        {css}
      </style>

      <div className="ui-progress__head">
        <h2 className="ui-progress__title">{title}</h2>
        <span className="ui-progress__count" aria-hidden="true">
          <span className="ui-progress__digit" key={count}>
            {count}
          </span>
          /{total}
        </span>
      </div>

      <div
        className="ui-progress__bar"
        role="progressbar"
        aria-label={title}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={count}
        aria-valuetext={`${count} of ${total} done`}
      >
        <span
          className="ui-progress__fill"
          style={{ transform: `scaleX(${progress})` }}
        >
          {/* A new key replays the shine each time progress grows */}
          <span className="ui-progress__shine" key={count} />
        </span>
      </div>

      <ul className="ui-progress__list">
        {initial.map((step, index) => {
          const checked = doneIds.has(step.id);
          const status = readOnly && !checked ? step.status : undefined;
          const stateWord = checked
            ? "Done"
            : status === "running"
              ? "In progress"
              : status === "failed"
                ? "Failed"
                : "To do";
          const content = (
            <>
              <span className="ui-progress__check" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  {status === "failed" ? (
                    <path d="M8 8l8 8M16 8l-8 8" pathLength={1} />
                  ) : (
                    <path d="M6.5 12.5l3.5 3.5 7.5-8" pathLength={1} />
                  )}
                </svg>
              </span>
              <span className="ui-progress__label">
                {/* LP: read-only steps say their state to screen readers */}
                {readOnly ? (
                  <span className="sr-only">{`${stateWord}: `}</span>
                ) : null}
                <span>
                  {status === "running" ? (
                    <ShimmerText>{step.label}</ShimmerText>
                  ) : (
                    step.label
                  )}
                </span>
                {step.note ? (
                  <span className="ui-progress__note">{step.note}</span>
                ) : null}
              </span>
              {step.icon && (
                <span className="ui-progress__icon" aria-hidden="true">
                  {step.icon}
                </span>
              )}
            </>
          );
          return (
            <li
              key={step.id}
              style={{ animationDelay: `${60 + index * 50}ms` }}
            >
              {readOnly ? (
                step.href ? (
                  <Link
                    aria-label={`${stateWord}: ${step.label}`}
                    href={step.href}
                    className="ui-progress__step"
                    data-checked={checked || undefined}
                    data-status={status}
                  >
                    {content}
                  </Link>
                ) : (
                  <div
                    className="ui-progress__step"
                    data-checked={checked || undefined}
                    data-status={status}
                  >
                    {content}
                  </div>
                )
              ) : (
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={checked}
                  className="ui-progress__step"
                  onClick={() => toggle(step.id)}
                >
                  {content}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ---------- Styles ---------- */

const css = /* css */ `
/* Colors and motion as variables – override them on .ui-progress (see Theming in the docs) */
.ui-progress {
  --ui-pg-card: #ffffff;
  --ui-pg-line: #e5e5e5;
  --ui-pg-ink: #171717;
  --ui-pg-muted: #a3a3a3;
  --ui-pg-ring: #8f8f8f;
  --ui-pg-track: #f0f0f0;
  --ui-pg-hover: #f7f7f7;
  --ui-pg-danger: #d93f3f; /* LP */
  --ui-pg-ease: cubic-bezier(0.22, 1, 0.36, 1);
  --ui-pg-pop: cubic-bezier(0.34, 1.56, 0.64, 1);

  box-sizing: border-box;
  width: 100%;
  max-width: 360px;
  padding: 22px 16px 14px;
  background: var(--ui-pg-card);
  border: 1px solid var(--ui-pg-line);
  border-radius: 20px;
  box-shadow:
    0 1px 2px rgba(0, 0, 0, 0.03),
    0 8px 24px rgba(0, 0, 0, 0.035);
  font-family: "Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  color: var(--ui-pg-ink);
  -webkit-font-smoothing: antialiased;
}
.ui-progress *,
.ui-progress *::before,
.ui-progress *::after {
  box-sizing: border-box;
}

.ui-progress__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding: 0 6px;
}
.ui-progress__title {
  margin: 0;
  font-size: 16px;
  font-weight: 500;
  letter-spacing: -0.01em;
}
.ui-progress__count {
  font-size: 14px;
  color: var(--ui-pg-muted);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
/* The number rolls in from below whenever it changes */
.ui-progress__digit {
  display: inline-block;
  animation: ui-progress-roll 200ms var(--ui-pg-ease);
}

.ui-progress__bar {
  position: relative;
  height: 8px;
  margin: 16px 6px 12px;
  border-radius: 999px;
  background: var(--ui-pg-track);
  overflow: hidden;
}
.ui-progress__fill {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: var(--ui-pg-ink);
  transform-origin: 0 50%;
  overflow: hidden;
  transition: transform 300ms var(--ui-pg-ease);
}
.ui-progress__shine {
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, transparent 30%, rgba(255, 255, 255, 0.28) 50%, transparent 70%) 0 0 / 220% 100%
    no-repeat;
  animation: ui-progress-shine 700ms ease-out both;
}

.ui-progress__list {
  display: grid;
  gap: 2px;
  margin: 0;
  padding: 0;
  list-style: none;
}
/* On mount the card settles in, then the rows fade up one after another */
.ui-progress {
  animation: ui-progress-in 240ms var(--ui-pg-ease) both;
}
.ui-progress__list > li {
  position: relative;
  animation: ui-progress-row-in 240ms var(--ui-pg-ease) both;
}

.ui-progress__step {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  margin: 0;
  padding: 9px 6px;
  border: 0;
  border-radius: 12px;
  background: transparent;
  font: inherit;
  font-size: 15px;
  line-height: 1.45;
  color: inherit;
  text-align: left;
  text-decoration: none;
  cursor: pointer;
  transition: background-color 160ms ease;
}
div.ui-progress__step { cursor: default; }
.ui-progress__step:hover {
  background: var(--ui-pg-hover);
}
.ui-progress__step:focus-visible {
  outline: 2px solid rgba(23, 23, 23, 0.22);
  outline-offset: 0;
}

/* Checkbox: the ring fills and pops, then the tick draws itself */
.ui-progress__check {
  position: relative;
  flex: none;
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  border: 1.5px solid var(--ui-pg-ring);
  border-radius: 50%;
  background: transparent;
  transition:
    background-color 220ms var(--ui-pg-ease),
    border-color 220ms var(--ui-pg-ease);
}
.ui-progress__check svg {
  width: 14px;
  height: 14px;
  fill: none;
  stroke: #ffffff;
  stroke-width: 2.4;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-dasharray: 1;
  stroke-dashoffset: 1;
  transition: stroke-dashoffset 120ms var(--ui-pg-ease);
}
.ui-progress__step[aria-checked="true"] .ui-progress__check,
.ui-progress__step[data-checked] .ui-progress__check {
  background: var(--ui-pg-ink);
  border-color: var(--ui-pg-ink);
  animation: ui-progress-pop 240ms var(--ui-pg-ease);
}
.ui-progress__step[aria-checked="true"] .ui-progress__check svg,
.ui-progress__step[data-checked] .ui-progress__check svg {
  stroke-dashoffset: 0;
  transition: stroke-dashoffset 200ms var(--ui-pg-ease) 80ms;
}

/* Label: grays out while a line strikes through it, line by line */
.ui-progress__label {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: color 200ms ease;
}
.ui-progress__label > span:last-child {
  background: linear-gradient(currentColor, currentColor) 0 58% / 0% 1.5px no-repeat;
  transition: background-size 200ms var(--ui-pg-ease);
}
.ui-progress__step[aria-checked="true"] .ui-progress__label,
.ui-progress__step[data-checked] .ui-progress__label {
  color: var(--ui-pg-muted);
}
.ui-progress__step[aria-checked="true"] .ui-progress__label > span:last-child,
.ui-progress__step[data-checked] .ui-progress__label > span:last-child {
  background-size: 100% 1.5px;
  transition: background-size 240ms var(--ui-pg-ease) 100ms;
}

.ui-progress__icon {
  flex: none;
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  transition: opacity 200ms ease;
}
.ui-progress__icon > svg {
  width: 100%;
  height: 100%;
}
.ui-progress__step[aria-checked="true"] .ui-progress__icon,
.ui-progress__step[data-checked] .ui-progress__icon {
  opacity: 0.45;
}

/* LP: live states for read-only trackers (job steps) */
.ui-progress__step[data-status="running"] .ui-progress__check {
  border-color: var(--ui-pg-ink);
  border-right-color: transparent;
  animation: ui-progress-spin 600ms linear infinite;
}
.ui-progress__step[data-status="failed"] .ui-progress__check {
  background: var(--ui-pg-danger);
  border-color: var(--ui-pg-danger);
}
.ui-progress__step[data-status="failed"] .ui-progress__check svg {
  stroke-dashoffset: 0;
}
.ui-progress__step[data-status="failed"] .ui-progress__label { color: var(--ui-pg-danger); }
.ui-progress__note {
  display: block;
  white-space: normal;
  font-size: 13px;
  line-height: 1.4;
  color: var(--ui-pg-muted);
}
.ui-progress__step[data-status="failed"] .ui-progress__note { color: var(--ui-pg-danger); }
@keyframes ui-progress-spin { to { transform: rotate(360deg); } }

@keyframes ui-progress-pop {
  0% { transform: scale(0.9); }
  60% { transform: scale(1.06); }
  100% { transform: scale(1); }
}
@keyframes ui-progress-in {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
}
@keyframes ui-progress-row-in {
  from {
    opacity: 0;
    filter: blur(3px);
    transform: translateY(8px);
  }
}
@keyframes ui-progress-roll {
  from { opacity: 0; transform: translateY(60%); }
  to { opacity: 1; transform: none; }
}
@keyframes ui-progress-shine {
  from { background-position: 120% 0; opacity: 1; }
  to { background-position: -20% 0; opacity: 0; }
}

/* LP: reduced motion is gentler, not none (D51): fades stay, movement goes, and a running
   step keeps turning slowly so it still reads as "working". */
@media (prefers-reduced-motion: reduce) {
  .ui-progress,
  .ui-progress__list > li,
  .ui-progress__digit {
    animation-name: ui-progress-fade !important;
  }
  .ui-progress__shine,
  .ui-progress__check {
    animation: none !important;
  }
  .ui-progress__fill,
  .ui-progress__label > span:last-child,
  .ui-progress__check svg {
    transition-duration: 1ms !important;
    transition-delay: 0ms !important;
  }
  .ui-progress__step[data-status="running"] .ui-progress__check {
    animation: ui-progress-spin 1600ms linear infinite !important;
  }
}
@keyframes ui-progress-fade { from { opacity: 0; } }

/* Dark mode: follows a .dark class or data-theme="dark" on any ancestor, e.g. <html> */
:where(.dark, [data-theme="dark"]) .ui-progress {
  --ui-pg-card: #232326;
  --ui-pg-line: rgba(255, 255, 255, 0.08);
  --ui-pg-ink: #ededed;
  --ui-pg-muted: #8f8f8f;
  --ui-pg-ring: #6b6b70;
  --ui-pg-track: rgba(255, 255, 255, 0.1);
  --ui-pg-hover: #2a2a2d;
  box-shadow:
    0 1px 2px rgba(0, 0, 0, 0.4),
    0 8px 24px rgba(0, 0, 0, 0.35);
}
/* The filled check is light in dark mode, so the tick turns dark */
:where(.dark, [data-theme="dark"]) .ui-progress__check svg { stroke: #121213; }
:where(.dark, [data-theme="dark"]) .ui-progress__shine {
  background-image: linear-gradient(90deg, transparent 30%, rgba(255, 255, 255, 0.7) 50%, transparent 70%);
}
:where(.dark, [data-theme="dark"]) .ui-progress__step:focus-visible { outline-color: rgba(237, 237, 237, 0.3); }
`;
