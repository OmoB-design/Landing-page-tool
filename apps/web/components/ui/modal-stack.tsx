"use client";

// Stacked modals (the owner's reference: Emil Kowalski's "stacked modals"). One dialog holds a
// stack of layers; each layer is a card (the published modal's rim and panel). Pushing a layer
// brings a new card to the front while the one below steps back: a little smaller, raised so a
// strip of its top edge shows above the new card, and dimmed. Every card in the stack takes the
// front card's height (the dialog's height follows it), so one surface reads as going a level
// deeper; the contents cross-fade with a slight blur. Back (Esc, ← Back, or the peeking edge)
// reverses it. Springs keep it interruptible; reduced motion keeps only the fade.
//
// The dialog's top stays where the first card put it (it only moves up if a deeper card wouldn't
// fit), so a stack grows and shrinks downward instead of re-centring on every step.

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Dialog as DialogPrimitive } from "radix-ui";
import {
  type ComponentProps,
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { DialogOverlay, DialogPortal } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/** A layer pushed onto the stack: `label` names it for the way back ("Back to …"). */
export type StackLayer = {
  key: string;
  label: string;
  render: () => ReactNode;
};

type StackApi = {
  push: (layer: StackLayer) => void;
  pop: () => void;
  depth: number;
};

const StackContext = createContext<StackApi | null>(null);
const LayerContext = createContext<{ front: boolean }>({ front: true });

/** The stack the caller is in (null outside one): push a layer, pop back. */
export function useModalStack(): StackApi | null {
  return useContext(StackContext);
}

/** The dialog's title when its card is at the front (one title per dialog); a heading below. */
export function ModalStackTitle(props: ComponentProps<"h2">) {
  const { front } = useContext(LayerContext);
  return front ? <DialogPrimitive.Title {...props} /> : <h2 {...props} />;
}

export function ModalStackDescription(props: ComponentProps<"p">) {
  const { front } = useContext(LayerContext);
  return front ? <DialogPrimitive.Description {...props} /> : <p {...props} />;
}

// Emil: an Apple-style spring with no bounce for things moving on screen; about 300 ms.
const SPRING = { type: "spring", duration: 0.32, bounce: 0 } as const;
const PEEK = 12; // px of each card's top edge that shows above the next
const SHRINK = 0.04; // each level back is 4 % smaller
const GUTTER = 16; // the least space kept above and below the dialog
const RIM = 8; // the card's rim (4 px all round) around its panel
const EASE_OUT = [0.23, 1, 0.32, 1] as const; // Emil's strong ease-out

function useViewportHeight() {
  const [height, setHeight] = useState(0);
  useLayoutEffect(() => {
    const update = () => setHeight(window.innerHeight);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return height;
}

/** One card: its natural height is measured (the stack sizes everything from the front card). It
 * always fills the height it's given (so a card arriving at the old card's height covers it
 * entirely while both settle), with its content at the top. */
function StackCard({
  layerKey,
  depth,
  height,
  fromHeight,
  moving,
  entering,
  onMeasure,
  onBack,
  backLabel,
  children,
}: {
  layerKey: string;
  depth: number;
  height: number | undefined;
  /** An arriving card starts at the height of the card it covers. */
  fromHeight: number | undefined;
  /** A push or pop is under way: heights spring; otherwise they follow the card at once. */
  moving: boolean;
  entering: boolean;
  onMeasure: (key: string, height: number) => void;
  onBack: (() => void) | null;
  backLabel: string | null;
  children: ReactNode;
}) {
  const reduce = useReducedMotion();
  const content = useRef<HTMLDivElement>(null);
  const front = depth === 0;
  useLayoutEffect(() => {
    const node = content.current;
    if (!node) return;
    const report = () => onMeasure(layerKey, node.offsetHeight + RIM);
    report();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(report);
    observer.observe(node);
    return () => observer.disconnect();
  }, [layerKey, onMeasure]);
  // A card that just arrived takes the focus (its [data-autofocus] field, else the first control).
  const focused = useRef(false);
  useEffect(() => {
    if (focused.current || !front || !entering || !content.current) return;
    focused.current = true;
    const target =
      content.current.querySelector<HTMLElement>("[data-autofocus]") ??
      content.current.querySelector<HTMLElement>(
        "input, textarea, select, button, a[href]",
      );
    target?.focus({ preventScroll: true });
  }, [front, entering]);

  const fade = { duration: reduce ? 0.15 : 0.2, ease: EASE_OUT };
  const blur = { duration: reduce ? 0 : 0.2, ease: EASE_OUT };
  const motionSpring = reduce ? { duration: 0 } : SPRING;
  const variants = {
    // Leaving (a pop): it fades and blurs while settling to the new front card's height.
    exit: (toHeight: number | undefined) => ({
      opacity: 0,
      filter: "blur(4px)",
      transform: "translateY(8px) scale(1)",
      ...(toHeight ? { height: toHeight } : {}),
      transition: { default: motionSpring, opacity: fade, filter: blur },
    }),
  };
  return (
    <motion.div
      variants={variants}
      initial={
        entering
          ? {
              opacity: 0,
              filter: "blur(4px)",
              transform: "translateY(8px) scale(1)",
              height: fromHeight ?? "auto",
            }
          : false
      }
      animate={{
        opacity: depth <= 2 ? 1 : 0,
        filter: "blur(0px)",
        transform: `translateY(${-PEEK * depth}px) scale(${1 - SHRINK * depth})`,
        height: height ?? "auto",
      }}
      exit="exit"
      transition={{
        default: motionSpring,
        height: reduce || !moving ? { duration: 0 } : SPRING,
        opacity: fade,
        filter: blur,
      }}
      style={{ zIndex: 10 - depth, transformOrigin: "50% 0%" }}
      className="absolute inset-x-0 top-0 overflow-hidden rounded-well"
    >
      <div
        inert={!front}
        aria-hidden={front ? undefined : true}
        className="h-full rounded-well bg-surface-primary p-1 dark:ring-1 dark:ring-stroke"
      >
        <div className="h-full overflow-hidden rounded-lg bg-surface-modal shadow-float ring-half ring-stroke">
          <div ref={content}>{children}</div>
        </div>
      </div>
      {/* The dimming of a card that stepped back: solid, so nothing shows through it. */}
      <motion.div
        aria-hidden
        initial={false}
        animate={{ opacity: front ? 0 : depth === 1 ? 0.7 : 1 }}
        transition={{ duration: reduce ? 0 : 0.24 }}
        className="pointer-events-none absolute inset-0 rounded-well bg-overlay/12 dark:bg-overlay/55"
      />
      {/* The peeking edge of the card just behind the front one goes back to it. */}
      {depth === 1 && onBack ? (
        <button
          type="button"
          aria-label={backLabel ? `Back to ${backLabel}` : "Back"}
          onClick={onBack}
          className="absolute inset-x-0 top-0 h-3 cursor-pointer rounded-t-well outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      ) : null}
    </motion.div>
  );
}

/**
 * A dialog whose content is the first card of a stack. Inside it, `useModalStack().push()` adds
 * a card on top; `pop()`, Esc or the peeking edge goes back a level (Esc closes the dialog only
 * from the first card; clicking outside closes it only then too, so a half-filled form above
 * isn't lost). Focus moves into each new card and back to what opened it.
 */
export function ModalStack({
  open,
  onOpenChange,
  label,
  className,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The first card's name, for the way back to it. */
  label: string;
  /** The stack's width (all its cards share it), e.g. sm:max-w-151.5. */
  className?: string;
  children: ReactNode;
}) {
  const [layers, setLayers] = useState<StackLayer[]>([]);
  const [heights, setHeights] = useState<Record<string, number>>({});
  const [arrived, setArrived] = useState<Set<string>>(() => new Set());
  const [enterFrom, setEnterFrom] = useState<Record<string, number>>({});
  const frontHeightNow = useRef<number | undefined>(undefined);
  const returnTo = useRef<(HTMLElement | null)[]>([]);
  const viewport = useViewportHeight();
  const reduce = useReducedMotion();
  // The dialog's first placement isn't animated (only changes after it).
  const [placed, setPlaced] = useState(false);

  const [moving, setMoving] = useState(false);
  const settle = useRef<number | undefined>(undefined);
  const move = useCallback(() => {
    setMoving(true);
    window.clearTimeout(settle.current);
    settle.current = window.setTimeout(() => setMoving(false), 450);
  }, []);
  const push = useCallback(
    (layer: StackLayer) => {
      move();
      returnTo.current.push(document.activeElement as HTMLElement | null);
      const from = frontHeightNow.current;
      if (from) setEnterFrom((current) => ({ ...current, [layer.key]: from }));
      setArrived((set) => new Set(set).add(layer.key));
      setLayers((stack) =>
        stack.some((l) => l.key === layer.key) ? stack : [...stack, layer],
      );
    },
    [move],
  );
  const pop = useCallback(() => {
    move();
    setLayers((stack) => stack.slice(0, -1));
    const back = returnTo.current.pop();
    // After the card below is the front again (no longer inert).
    requestAnimationFrame(() => {
      if (back?.isConnected) back.focus({ preventScroll: true });
    });
  }, [move]);

  // A closed dialog starts again from its first card next time.
  useEffect(() => {
    if (open) return;
    const timer = window.setTimeout(() => {
      setLayers([]);
      returnTo.current = [];
      setPlaced(false);
    }, 200);
    return () => window.clearTimeout(timer);
  }, [open]);

  const all: StackLayer[] = [
    { key: "base", label, render: () => children },
    ...layers,
  ];
  const frontIndex = all.length - 1;
  const frontKey = layers.at(-1)?.key ?? "base";
  const frontHeight = heights[frontKey];
  useEffect(() => {
    frontHeightNow.current = frontHeight;
  }, [frontHeight]);
  const baseHeight = heights.base;
  const onMeasure = useCallback(
    (key: string, height: number) =>
      setHeights((current) =>
        current[key] === height ? current : { ...current, [key]: height },
      ),
    [],
  );

  const top =
    viewport && baseHeight
      ? Math.max(
          GUTTER,
          Math.min(
            (viewport - baseHeight) / 2,
            viewport - GUTTER - (frontHeight ?? baseHeight),
          ),
        )
      : undefined;
  const api: StackApi = { push, pop, depth: layers.length };
  const instant = reduce || !placed;
  const measured = open && top !== undefined && frontHeight !== undefined;
  useEffect(() => {
    // After the first measured placement is on screen, later changes animate. Deliberately a
    // state set after commit: the first placement must render once with no transition.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (measured && !placed) setPlaced(true);
  }, [measured, placed]);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content
          asChild
          onEscapeKeyDown={(event) => {
            if (layers.length > 0) {
              event.preventDefault();
              pop();
            }
          }}
          onInteractOutside={(event) => {
            if (layers.length > 0) event.preventDefault();
          }}
        >
          <motion.div
            initial={false}
            animate={{
              height: frontHeight ?? "auto",
              top: top ?? "50%",
            }}
            transition={{
              top: instant ? { duration: 0 } : SPRING,
              height: instant || !moving ? { duration: 0 } : SPRING,
            }}
            className={cn(
              "fixed left-1/2 z-50 w-full max-w-[calc(100%-2rem)] -translate-x-1/2 outline-none",
              top === undefined && "-translate-y-1/2",
              "duration-200 ease-out data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:duration-150 data-closed:fade-out-0 data-closed:zoom-out-95",
              className,
            )}
          >
            <StackContext.Provider value={api}>
              <AnimatePresence initial={false} custom={frontHeight}>
                {all.map((layer, index) => {
                  const depth = frontIndex - index;
                  const entering = index > 0 && arrived.has(layer.key);
                  return (
                    <StackCard
                      key={layer.key}
                      layerKey={layer.key}
                      depth={depth}
                      height={depth === 0 ? heights[layer.key] : frontHeight}
                      fromHeight={enterFrom[layer.key]}
                      moving={moving}
                      entering={entering}
                      onMeasure={onMeasure}
                      onBack={depth === 1 ? pop : null}
                      backLabel={depth === 1 ? layer.label : null}
                    >
                      <LayerContext.Provider value={{ front: depth === 0 }}>
                        {layer.render()}
                      </LayerContext.Provider>
                    </StackCard>
                  );
                })}
              </AnimatePresence>
            </StackContext.Provider>
          </motion.div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </DialogPrimitive.Root>
  );
}
