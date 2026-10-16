"use client";

import { type KeyboardEvent, type PointerEvent, useRef, useState } from "react";

import { cn } from "@/lib/utils";

/** Keyboard steps move the handle by 16 px. */
const STEP = 16;

/**
 * The Mover (Figma Build): a handle on the edge between two panes that you drag to widen or narrow
 * the pane beside it, like the split handle in Claude's artifact view. A 10 × 22 px pill with 24 px
 * corners in a 16 × 40 px grab area: Foreground-03 lit from inside in light, Surface-Primary in a
 * 0.5 px Icon-System line in dark (`--mover-fill`, `shadow-mover`). It is a separator:
 * the arrow keys move it 16 px a press, Home and End go to the narrowest and widest, and Enter or
 * a double click put it back. While dragging, a cover keeps the page (and any frame under the
 * pointer, like the build preview) from taking the pointer.
 */
export function Mover({
  value,
  min,
  max,
  defaultValue,
  side,
  label,
  onChange,
  onCommit,
  className,
}: {
  /** The pane's width in px. */
  value: number;
  min: number;
  /** The widest the pane may go now (the room depends on the window). */
  max: () => number;
  defaultValue: number;
  /** Where the resized pane is: "right" means dragging left widens it. */
  side: "left" | "right";
  label: string;
  onChange: (value: number) => void;
  /** After a drag or a key press: a good moment to remember the width. */
  onCommit?: (value: number) => void;
  className?: string;
}) {
  const drag = useRef<{ x: number; start: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const clamp = (next: number) =>
    Math.round(Math.min(Math.max(next, min), Math.max(min, max())));

  const set = (next: number, commit = false) => {
    const clamped = clamp(next);
    onChange(clamped);
    if (commit) onCommit?.(clamped);
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, start: value };
    setDragging(true);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const delta = event.clientX - drag.current.x;
    set(drag.current.start + (side === "right" ? -delta : delta));
  };
  const onPointerEnd = () => {
    if (!drag.current) return;
    drag.current = null;
    setDragging(false);
    onCommit?.(value);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const wider = side === "right" ? "ArrowLeft" : "ArrowRight";
    const narrower = side === "right" ? "ArrowRight" : "ArrowLeft";
    const next =
      event.key === wider
        ? value + STEP
        : event.key === narrower
          ? value - STEP
          : event.key === "Home"
            ? min
            : event.key === "End"
              ? max()
              : event.key === "Enter"
                ? defaultValue
                : null;
    if (next === null) return;
    event.preventDefault();
    set(next, true);
  };

  return (
    <>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={label}
        aria-valuenow={value}
        aria-valuemin={min}
        aria-valuemax={Math.max(min, Math.round(max()))}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onKeyDown={onKeyDown}
        onDoubleClick={() => set(defaultValue, true)}
        className={cn(
          "group z-10 flex h-10 w-4 cursor-col-resize touch-none items-center justify-center rounded-sm outline-none select-none",
          className,
        )}
      >
        <span
          aria-hidden
          className={cn(
            "h-5.5 w-2.5 rounded-xl bg-(--mover-fill) shadow-mover transition-transform duration-150 ease-out group-hover:scale-y-110 group-focus-visible:ring-2 group-focus-visible:ring-ring motion-reduce:transition-none",
            dragging && "scale-y-110",
          )}
        />
      </div>
      {dragging ? (
        <div aria-hidden className="fixed inset-0 z-50 cursor-col-resize" />
      ) : null}
    </>
  );
}
