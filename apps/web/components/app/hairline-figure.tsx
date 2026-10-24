"use client";

import { type CSSProperties, useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

/** What a figure drawn with the hairline-create skill declares (its last `hairline({ … })` call). */
type FigureDef = {
  name: string;
  means: string;
  range: [number, number, number];
  tour: ([number, number] | null)[] | null;
  mount: (
    host: {
      stage: HTMLElement;
      svg: SVGSVGElement;
      read: { textContent: string };
    },
    value: number,
  ) => { set: (value: number) => void; destroy: () => void };
};

/** The few kernel calls the host needs (public/hairline/kernel.js, the skill's engine, unchanged). */
type Kernel = {
  inject: (root: Document) => void;
  mk: (
    tag: string,
    attrs: Record<string, string>,
    parent: Element,
  ) => SVGSVGElement;
  tour: (
    stage: HTMLElement,
    stops: ([number, number] | null)[],
  ) => { stop: () => void };
  LAP: ([number, number] | null)[];
};

declare global {
  interface Window {
    HL?: Kernel;
    hairline?: (figure: FigureDef) => void;
    __hairlineFigures?: Record<string, FigureDef>;
  }
}

const loading = new Map<string, Promise<void>>();

/** Loads a script once (the kernel as a classic script, so it sets window.HL; a figure as a module). */
function load(src: string, module = false): Promise<void> {
  let promise = loading.get(src);
  if (!promise) {
    promise = new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      if (module) script.type = "module";
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`Could not load ${src}`));
      document.head.append(script);
    });
    loading.set(src, promise);
  }
  return promise;
}

/** The kernel, then the figure, which hands itself over through window.hairline. */
async function figureNamed(
  name: string,
): Promise<{ HL: Kernel; figure: FigureDef }> {
  window.__hairlineFigures ??= {};
  window.hairline ??= (figure) => {
    window.__hairlineFigures![figure.name] = figure;
  };
  await load("/hairline/kernel.js");
  await load(`/hairline/${name}.js`, true);
  const figure = window.__hairlineFigures[name];
  if (!window.HL || !figure)
    throw new Error(`Hairline figure ${name} didn't load.`);
  return { HL: window.HL, figure };
}

/**
 * A continuous lap in place of the figure's tour (whose stops each wait 1.2 s): an unseen pointer
 * eases from `from` to `to` (viewBox points), holds, eases back and rests, round and round.
 */
export type Sweep = {
  from: [number, number];
  to: [number, number];
  downMs: number;
  holdMs: number;
  upMs: number;
  restMs: number;
};

/** How far along the sweep's path (0 at `from`, 1 at `to`) its pointer is `elapsed` ms into a lap, on
 * a sine ease in and out. */
function lapAt(sweep: Sweep, elapsed: number): number {
  const ease = (t: number) => 0.5 - 0.5 * Math.cos(Math.PI * t);
  const lap = sweep.downMs + sweep.holdMs + sweep.upMs + sweep.restMs;
  let t = elapsed % lap;
  if (t < sweep.downMs) return ease(t / sweep.downMs);
  t -= sweep.downMs;
  if (t < sweep.holdMs) return 1;
  t -= sweep.holdMs;
  if (t < sweep.upMs) return 1 - ease(t / sweep.upMs);
  return 0;
}

/** How quickly the pointer glides to a new progress (time constant, s), and its slow bob while a step
 * runs: a fraction of the path either way, over a 2.4 s breath. */
const GLIDE = 0.45;
const BOB = 0.025;
const BREATH = 2400;

/**
 * Drives the figure by moving an unseen pointer along the sweep's path each frame, as the figure's
 * own pointer handling reads it. With a progress (0–1, read from `progress.current` every frame),
 * the pointer glides to that point of the path and, short of the end, bobs slowly there, so the
 * figure follows real work; without one it walks the lap. A real pointer takes over while it is on
 * the figure; the lap starts again when it leaves. Off screen it does nothing; under reduced motion
 * it never starts.
 */
function startSweep(
  el: HTMLElement,
  sweep: Sweep,
  progress: { current: number | undefined },
): () => void {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches)
    return () => {};
  let start = performance.now();
  let last = start;
  let at = progress.current ?? 0;
  let held = false;
  let visible = true;
  let raf = 0;
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (held || !visible) return;
    const target = progress.current;
    if (target === undefined) {
      at = lapAt(sweep, now - start);
    } else {
      const bob = target < 1 ? BOB * Math.sin((now / BREATH) * 2 * Math.PI) : 0;
      at +=
        (Math.min(1, Math.max(0, target + bob)) - at) *
        (1 - Math.exp(-dt / GLIDE));
    }
    const x = sweep.from[0] + (sweep.to[0] - sweep.from[0]) * at;
    const y = sweep.from[1] + (sweep.to[1] - sweep.from[1]) * at;
    const box = el.getBoundingClientRect();
    el.dispatchEvent(
      new PointerEvent("pointermove", {
        pointerType: "mouse",
        clientX: box.left + (x / 400) * box.width,
        clientY: box.top + (y / 320) * box.height,
      }),
    );
  };
  const hold = (event: PointerEvent) => {
    if (event.isTrusted) held = true;
  };
  const release = (event: PointerEvent) => {
    if (!event.isTrusted) return;
    held = false;
    start = performance.now();
  };
  const seen = new IntersectionObserver(([entry]) => {
    visible = entry?.isIntersecting ?? true;
  });
  seen.observe(el);
  el.addEventListener("pointermove", hold);
  el.addEventListener("pointerleave", release);
  raf = requestAnimationFrame(frame);
  return () => {
    cancelAnimationFrame(raf);
    seen.disconnect();
    el.removeEventListener("pointermove", hold);
    el.removeEventListener("pointerleave", release);
  };
}

/** The slider's 0–1 on a figure's own number: two straight lines meeting at 0.5, as the package does. */
function valueAt([lo, mid, hi]: FigureDef["range"], intensity: number): number {
  const i = Math.min(1, Math.max(0, intensity));
  return i <= 0.5
    ? lo + (i / 0.5) * (mid - lo)
    : mid + ((i - 0.5) / 0.5) * (hi - mid);
}

/**
 * A figure drawn with the hairline-create skill, mounted the way the package mounts its own: a
 * 5:4 box that fills its width, an svg the figure draws into, `intensity` from 0 to 1, and `play`
 * walking the figure's tour in a loop until a pointer arrives (resting under reduced motion), or,
 * given a `sweep`, one continuous lap instead, or the point of it that `progress` names. The
 * engine and the figure are static files in public/hairline/, loaded once. Theme and stroke come
 * from the --hairline-* custom properties (`stroke` sets --hairline-stroke, in CSS pixels).
 */
export function HairlineFigure({
  name,
  label,
  intensity = 0.5,
  play = false,
  sweep,
  progress,
  stroke,
  className,
}: {
  name: string;
  label: string;
  intensity?: number;
  play?: boolean;
  /** With `play`, a continuous lap instead of the figure's tour. */
  sweep?: Sweep;
  /** With a `sweep`, how far along its path the figure should stand (0–1), e.g. a build's progress;
   * undefined walks the lap. */
  progress?: number;
  stroke?: number;
  className?: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const handle = useRef<{
    set: (value: number) => void;
    range: FigureDef["range"];
  } | null>(null);
  // The intensity the figure mounts with; later changes reach the running figure through `set`.
  const latest = useRef(intensity);
  // The progress the sweep reads each frame (a ref, so a new value never remounts the figure).
  const progressRef = useRef(progress);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let cancelled = false;
    let cleanup = () => {};
    figureNamed(name)
      .then(({ HL, figure }) => {
        if (cancelled) return;
        HL.inject(document);
        el.setAttribute("data-hairline", figure.name);
        const svg = HL.mk(
          "svg",
          { viewBox: "0 0 400 320", "aria-hidden": "true" },
          el,
        );
        const mounted = figure.mount(
          { stage: el, svg, read: { textContent: "" } },
          valueAt(figure.range, latest.current),
        );
        handle.current = { set: mounted.set, range: figure.range };
        const walking =
          play && !sweep ? HL.tour(el, figure.tour ?? HL.LAP) : null;
        const stopSweep =
          play && sweep ? startSweep(el, sweep, progressRef) : () => {};
        cleanup = () => {
          walking?.stop();
          stopSweep();
          mounted.destroy();
          svg.remove();
          handle.current = null;
        };
      })
      .catch(() => {
        // The drawing is decoration: without it the caption still says what is happening.
      });
    return () => {
      cancelled = true;
      cleanup();
    };
    // The sweep is a constant per figure (read at mount).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, play]);

  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);

  useEffect(() => {
    latest.current = intensity;
    handle.current?.set(valueAt(handle.current.range, intensity));
  }, [intensity]);

  return (
    <div
      ref={host}
      role="img"
      aria-label={label}
      className={cn("aspect-5/4", className)}
      // The stroke is a live, tunable number (data, not styling).
      style={
        stroke === undefined
          ? undefined
          : ({ "--hairline-stroke": String(stroke) } as CSSProperties)
      }
    />
  );
}
