"use client";

import { motion } from "motion/react";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { MorphText } from "@/components/ui/text-morph";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { useLanderMotion } from "../lander-motion";

/** A run of this many one-line change cards or more is stacked (owner, 2026-11-05). */
export const STACK_FROM = 4;
/** Sent up to the thread when a stack opens or closes, so the thread stops following the bottom
 * and the stack stays where it was clicked (the cards fan out below it). */
export const UNPIN_EVENT = "lander-unpin";

export type ChangeGroup =
  { kind: "single"; index: number } | { kind: "stack"; indices: number[] };

/**
 * The change cards in order, with each run of STACK_FROM or more one-line cards (a box restyled,
 * a section moved, the page recoloured, an image changed) gathered into a stack. Line cards stay
 * on their own: they have their own controls and fold.
 */
export function groupChanges(kinds: string[]): ChangeGroup[] {
  const groups: ChangeGroup[] = [];
  let run: number[] = [];
  const flush = () => {
    if (run.length >= STACK_FROM) groups.push({ kind: "stack", indices: run });
    else for (const index of run) groups.push({ kind: "single", index });
    run = [];
  };
  kinds.forEach((kind, index) => {
    if (kind === "lines") {
      flush();
      groups.push({ kind: "single", index });
    } else run.push(index);
  });
  flush();
  return groups;
}

const GAP = 8; // the thread's gap between cards (gap-2)
const PEEK_Y = [6, 12];
const PEEK_SCALE = [0.95, 0.9];
const PEEK_ROOM = 12; // under the top card, for the two edges
// The drawer curve (emil-design-eng): moving on screen, quick to start, soft to land.
const DRAWER = [0.32, 0.72, 0, 1] as const;

const place = (y: number, scale: number) =>
  `translateY(${y}px) scale(${scale})`;

/** Each card's natural height, kept up to date (ResizeObserver; none in tests). */
function useHeights(): [
  Record<string, number>,
  (key: string) => (node: HTMLElement | null) => void,
] {
  const [heights, setHeights] = useState<Record<string, number>>({});
  const observer = useRef<ResizeObserver | null>(null);
  const nodes = useRef(new Map<string, HTMLElement>());
  useEffect(() => {
    if (typeof ResizeObserver === "undefined") return;
    const watcher = new ResizeObserver((entries) => {
      setHeights((current) => {
        let next = current;
        for (const entry of entries) {
          const key = (entry.target as HTMLElement).dataset.stackKey;
          const height = Math.round(entry.contentRect.height);
          if (key && current[key] !== height) next = { ...next, [key]: height };
        }
        return next;
      });
    });
    observer.current = watcher;
    for (const node of nodes.current.values()) watcher.observe(node);
    return () => watcher.disconnect();
  }, []);
  const measure = useCallback(
    (key: string) => (node: HTMLElement | null) => {
      const known = nodes.current.get(key);
      if (known && known !== node) observer.current?.unobserve(known);
      if (node) {
        node.dataset.stackKey = key;
        nodes.current.set(key, node);
        observer.current?.observe(node);
      } else nodes.current.delete(key);
    },
    [],
  );
  return [heights, measure];
}

/**
 * Many one-line change cards as a stack (owner, 2026-11-05: "stack them so they don't extend so
 * much … with a number count of the total frames at the top right"; Sonner's toast stack). The
 * first card on top, the edges of two more under it, and the count in a white chip on its
 * top-right corner, rolling up as cards arrive (the top card stays put). Clicking the stack or
 * the chip fans the cards out of it, each sliding from under the top card to its place in the
 * list (0.32 s on the drawer curve, 10 ms apart) while the stack's height opens with them; the
 * chip folds them back in, faster (0.24 s). Interruptible: a click mid-way reverses from where
 * they are. Reduced motion: fades only.
 */
export function ChangeStack({
  cards,
}: {
  cards: { key: string; node: ReactNode }[];
}) {
  const { reduced } = useLanderMotion();
  const [open, setOpen] = useState(false);
  const [spread, setSpread] = useState(false);
  const [heights, measure] = useHeights();
  const box = useRef<HTMLDivElement>(null);
  const toggle = (to: boolean) => {
    box.current?.dispatchEvent(new Event(UNPIN_EVENT, { bubbles: true }));
    setSpread(false);
    setOpen(to);
  };
  const count = cards.length;
  const known = cards.every((card) => heights[card.key] !== undefined);
  const first = cards[0];
  const topHeight = first ? (heights[first.key] ?? 0) : 0;
  const offsets: number[] = [];
  let next = 0;
  for (const card of cards) {
    offsets.push(next);
    next += (heights[card.key] ?? 0) + GAP;
  }
  const total = next - GAP;
  const move = reduced
    ? { duration: 0 }
    : open
      ? { duration: 0.32, ease: DRAWER }
      : { duration: 0.24, ease: DRAWER };

  // Where a card under the top one sits: in the list when open, else tucked under the top card
  // at the second edge (and hidden).
  const pose = (i: number) => {
    if (open) return { transform: place(offsets[i] ?? 0, 1), opacity: 1 };
    const peek = Math.min(i, 2) - 1;
    const y = (PEEK_Y[peek] ?? 0) + (spread ? 2 * (peek + 1) : 0);
    return { transform: place(y, PEEK_SCALE[peek] ?? 1), opacity: 0 };
  };

  const chip = (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-expanded={open}
          aria-label={
            open ? `Stack the ${count} changes` : `Show all ${count} changes`
          }
          onClick={(event) => {
            event.stopPropagation();
            toggle(!open);
          }}
          className="absolute -top-2 -right-2 z-30 flex h-5 min-w-5 items-center justify-center rounded-full bg-surface-primary px-1.5 text-type-caption-2 font-medium text-heading-02 tabular-nums shadow-light ring-thin ring-stroke transition-transform duration-150 ease-out outline-none hover:text-body focus-visible:ring-2 focus-visible:ring-ring active:scale-95"
        >
          <MorphText>{String(count)}</MorphText>
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">
        {open ? "Stack them" : `Show all ${count}`}
      </TooltipContent>
    </Tooltip>
  );

  return (
    <motion.div
      ref={box}
      initial={false}
      animate={{
        height: !known ? "auto" : open ? total : topHeight + PEEK_ROOM,
      }}
      transition={move}
      onClick={() => !open && toggle(true)}
      onPointerEnter={(event) =>
        event.pointerType === "mouse" && !open && setSpread(true)
      }
      onPointerLeave={() => setSpread(false)}
      className={cn("relative", !open && "cursor-pointer")}
    >
      {/* The two edges under the top card while stacked (they spread 2 px on hover). */}
      {PEEK_Y.map((y, i) => (
        <motion.div
          key={y}
          aria-hidden
          initial={false}
          animate={{
            transform: place(
              y + (spread ? 2 * (i + 1) : 0),
              PEEK_SCALE[i] ?? 1,
            ),
            opacity: open ? 0 : 1,
          }}
          transition={{
            ...move,
            opacity: {
              duration: reduced ? 0.15 : open ? 0.12 : 0.16,
              delay: open || reduced ? 0 : 0.1,
            },
          }}
          // The top card's measured height (data, not spacing).
          style={{ height: topHeight || undefined }}
          className={cn(
            "pointer-events-none absolute inset-x-0 top-0 origin-bottom rounded-item bg-surface-primary shadow-light ring-thin ring-stroke",
            i === 0 ? "z-10" : "z-0",
          )}
        />
      ))}
      {cards.map((card, i) =>
        i === 0 ? (
          <div key={card.key} ref={measure(card.key)} className="relative z-20">
            {card.node}
          </div>
        ) : (
          <motion.div
            key={card.key}
            ref={measure(card.key)}
            aria-hidden={!open}
            inert={!open}
            initial={open ? { ...pose(i), opacity: 0 } : pose(i)}
            animate={pose(i)}
            transition={{
              ...move,
              delay: reduced ? 0 : Math.min(i, 12) * 0.01,
              opacity: {
                duration: reduced ? 0.15 : open ? 0.16 : 0.12,
                delay: reduced ? 0 : open ? Math.min(i, 12) * 0.01 : 0.1,
              },
            }}
            className={cn(
              "absolute inset-x-0 top-0 origin-top",
              i < 3 ? "z-10" : "z-0",
              !open && "pointer-events-none",
            )}
          >
            {card.node}
          </motion.div>
        ),
      )}
      {chip}
    </motion.div>
  );
}
