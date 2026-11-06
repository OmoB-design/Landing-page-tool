"use client";

import { animate, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

/*
 * Buddy, the editor's AI collaborator (owner, 2026-11-06; once called Lander), from the owner's
 * portfolio (omob.work): a round body with two tall eyes tilted up and to the right, black on
 * white or white on black. Everything he does there, he does here, and more lifelike: his eyes
 * follow the pointer (over the page too, relayed from its frame) the way eyes do, jumping to it
 * after a human reaction time (saccades) and riding a stiff spring, following small moves smoothly,
 * foreshortening as they turn, converging when it comes close and making tiny jumps when it's
 * still; they glance somewhere when the pointer has been still
 * for a while, blink every 2.5 to 6 s (a quick close, a slower open, one in five a double blink),
 * and on hover go wide while he hops; his mouth opens when it's asked for (the bar once you click
 * into it; always on Improve with Buddy). While he works
 * he looks around and breathes. Geometry is in body radii (the portfolio's, scaled up a little so
 * the eyes read at 16 and 24 px); one animation loop writes the transforms and sleeps when he's
 * still. Reduced motion: he only blinks.
 */
const EYE = { w: 0.17, h: 0.46, gap: 0.35 }; // width, height, centre to centre
const FACE = { x: 0.2, y: -0.1 }; // the eyes' midpoint from the body's centre
const TILT = [-26.7, -28.7] as const; // each eye, degrees (the portfolio's)
const MOUTH = { w: 0.34, h: 0.2, below: 0.44 }; // under the eyes, in the face's frame
const TRAVEL = 0.2; // how far the eyes look toward the pointer
const REACH = 4; // pointer distance, in radii, for the whole travel
// Realistic gaze (owner, 2026-11-06): saccades (a jump past this far, in radii), smooth pursuit for
// smaller moves (per 60 fps frame), and the stiff spring the eyes ride.
const SACCADE_MIN = 0.05;
const PURSUIT = 0.08;
const SPRING = 1600;
const WIDE = 0.8; // the portfolio's eyes.wide
const BLINK_MIN = 2.5;
const BLINK_MAX = 6;

const SIZES = { xs: 16, sm: 24, md: 28, lg: 44 } as const;
/** The pointer over the page in the canvas's frame, as the editor relays it (page-canvas.tsx):
 * a window event with `{ x, y }` in the editor's px, since the frame keeps its own pointer moves. */
export const BUDDY_POINTER = "buddy-pointer";

/** One blink's lid (1 open, 0.06 shut) `t` ms after it started; null once it's over. */
function lid(t: number, double: boolean): number | null {
  const shut = 0.06;
  const close = (x: number) => 1 - (1 - shut) * x * x; // power2.in
  const open = (x: number) => shut + (1 - shut) * (1 - (1 - x) * (1 - x)); // power2.out
  if (t < 70) return close(t / 70);
  if (t < 210) return open((t - 70) / 140);
  if (!double) return null;
  if (t < 260) return 1;
  if (t < 320) return close((t - 260) / 60);
  if (t < 460) return open((t - 320) / 140);
  return null;
}

export function LanderMark({
  size = "sm",
  working = false,
  excited = false,
  mouth = false,
  className,
}: {
  size?: "xs" | "sm" | "md" | "lg";
  working?: boolean;
  /** The pointer is over what he belongs to (the bar): eyes wide and a hop. */
  excited?: boolean;
  /** His mouth is open (owner, 2026-11-06: in the bar once you click into it; always on Improve
   * with Buddy); shut, it isn't there. */
  mouth?: boolean;
  className?: string;
}) {
  const reduced = useReducedMotion() ?? false;
  const px = SIZES[size];
  const r = px / 2;
  const body = useRef<HTMLSpanElement>(null);
  const eyes = useRef<(HTMLSpanElement | null)[]>([null, null]);
  const mouthEl = useRef<SVGSVGElement>(null);
  const live = useRef({ working, excited, mouth });
  const kick = useRef<() => void>(() => {});

  // The face: the eyes' midpoint, and where each eye and the mouth sit around it.
  const tilt = ((TILT[0] + TILT[1]) / 2) * (Math.PI / 180);
  const fx = r + FACE.x * r;
  const fy = r + FACE.y * r;
  const along = (d: number) => ({
    x: Math.cos(tilt) * d,
    y: Math.sin(tilt) * d,
  });
  const down = (d: number) => ({
    x: -Math.sin(tilt) * d,
    y: Math.cos(tilt) * d,
  });
  const eyeW = Math.max(1.5, EYE.w * r);
  const eyeH = EYE.h * r;
  const seats = [-1, 1].map((side) => {
    const o = along((side * EYE.gap * r) / 2);
    return { left: fx + o.x - eyeW / 2, top: fy + o.y - eyeH / 2 };
  });
  const m = down(MOUTH.below * r);
  const mouthW = MOUTH.w * r;
  const mouthH = MOUTH.h * r;

  useEffect(() => {
    const was = live.current;
    live.current = { ...was, working, excited, mouth };
    kick.current();
    if (excited && !was.excited && !reduced && body.current)
      // The portfolio's hop: up and stretched, then an elastic settle.
      animate(
        body.current,
        { y: [0, -0.15 * r, 0], scaleX: [1, 0.96, 1], scaleY: [1, 1.06, 1] },
        { duration: 0.66, times: [0, 0.24, 1], ease: ["easeOut", "backOut"] },
      );
  }, [working, excited, mouth, reduced, r]);

  useEffect(() => {
    const el = body.current;
    if (!el || typeof window.requestAnimationFrame !== "function") return;
    const s = {
      ex: 0, ey: 0, vx: 0, vy: 0, // where the eyes are, and how fast they're moving
      gx: 0, gy: 0, // where they're fixed on (they jump to it, then hold)
      dx: 0, dy: 0, // where the pointer asks them to look
      jump: null as { at: number; x: number; y: number } | null, // a saccade, after its delay
      near: 0, // how close the pointer is (the eyes converge)
      wide: 0,
      open: live.current.mouth ? 1 : 0,
      blink: null as { at: number; double: boolean } | null,
      glance: null as { until: number; x: number; y: number } | null,
      seen: false,
      moved: 0,
    }; // prettier-ignore
    let frame = 0;
    let last = performance.now();
    let blinkTimer = 0;
    let glanceTimer = 0;
    let driftTimer = 0;
    const span = TRAVEL * r;

    const draw = (lidNow: number) => {
      const w = s.wide * WIDE;
      // Turned away, an eye foreshortens a little (narrower looking sideways, shorter up or down).
      const nx = Math.min(1, Math.abs(s.ex) / span);
      const ny = Math.min(1, Math.abs(s.ey) / span);
      // Wide eyes, kept apart at Buddy's small sizes (the portfolio's 1 + 0.9w is for a 90 px face).
      const sx = (1 + 0.45 * w) * (1 - 0.16 * nx);
      const sy = lidNow * (1 + 0.25 * w) * (1 - 0.1 * ny);
      // With the pointer close, the eyes converge: each moves a little toward the other.
      const cross = 0.05 * r * s.near;
      eyes.current.forEach((eye, i) => {
        if (!eye) return;
        const toward = (i === 0 ? 1 : -1) * cross;
        const x = s.ex + Math.cos(tilt) * toward;
        const y = s.ey + Math.sin(tilt) * toward;
        eye.style.transform = `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) rotate(${TILT[i]}deg) scale(${sx.toFixed(3)}, ${sy.toFixed(3)})`;
      });
      if (mouthEl.current) {
        const open = s.open;
        // The face turns less than the eyes: the mouth follows at 60 % (depth).
        mouthEl.current.style.transform = `translate(${(s.ex * 0.6).toFixed(2)}px, ${(s.ey * 0.6).toFixed(2)}px) rotate(${(tilt * 180) / Math.PI}deg) scale(1, ${open.toFixed(3)})`;
        // Shut, it's gone: a squashed path still paints a hairline.
        mouthEl.current.style.opacity = open > 0.02 ? "1" : "0";
      }
    };

    // A saccade: the eyes jump to where they're asked to look after a human reaction time
    // (70 to 110 ms), and a big one sometimes comes with a blink.
    const aim = (x: number, y: number, now: number) => {
      const far = Math.hypot(x - s.gx, y - s.gy);
      if (far < SACCADE_MIN * r) return false;
      if (s.jump) {
        s.jump.x = x;
        s.jump.y = y;
      } else s.jump = { at: now + 70 + Math.random() * 40, x, y };
      return true;
    };

    const tick = (now: number) => {
      frame = 0;
      const dt = Math.min(50, now - last) / 1000;
      const steps = dt * 60;
      last = now;
      const glancing = s.glance && now < s.glance.until;
      if (s.glance && !glancing) {
        s.glance = null;
        aim(s.dx, s.dy, now);
      }
      if (s.jump && now >= s.jump.at) {
        if (
          Math.hypot(s.jump.x - s.gx, s.jump.y - s.gy) > 0.7 * span &&
          !s.blink
        )
          if (Math.random() < 0.3) s.blink = { at: now, double: false };
        s.gx = s.jump.x;
        s.gy = s.jump.y;
        s.jump = null;
      } else if (!s.jump && !glancing) {
        // Smooth pursuit: small, slow moves are followed rather than jumped to.
        const ease = 1 - Math.pow(1 - PURSUIT, steps);
        s.gx += (s.dx - s.gx) * ease;
        s.gy += (s.dy - s.gy) * ease;
      }
      // The eyes ride a stiff, critically damped spring to the fixation: a quick dart that lands.
      const ax = SPRING * (s.gx - s.ex) - 2 * Math.sqrt(SPRING) * s.vx;
      const ay = SPRING * (s.gy - s.ey) - 2 * Math.sqrt(SPRING) * s.vy;
      s.vx += ax * dt;
      s.vy += ay * dt;
      s.ex += s.vx * dt;
      s.ey += s.vy * dt;
      const wideTo = live.current.excited && !reduced ? 1 : 0;
      s.wide += (wideTo - s.wide) * (1 - Math.pow(1 - 0.22, steps));
      if (Math.abs(wideTo - s.wide) < 0.004) s.wide = wideTo;
      const openTo = live.current.mouth ? 1 : 0;
      s.open += (openTo - s.open) * (1 - Math.pow(1 - 0.25, steps));
      if (Math.abs(openTo - s.open) < 0.004) s.open = openTo;
      let lidNow = 1;
      if (s.blink) {
        const v = lid(now - s.blink.at, s.blink.double);
        if (v === null) s.blink = null;
        else lidNow = v;
      }
      draw(lidNow);
      const moving =
        Math.abs(s.gx - s.ex) > 0.01 ||
        Math.abs(s.gy - s.ey) > 0.01 ||
        Math.abs(s.vx) > 0.02 ||
        Math.abs(s.vy) > 0.02 ||
        (!glancing && Math.hypot(s.dx - s.gx, s.dy - s.gy) > 0.01) ||
        Math.abs(wideTo - s.wide) > 0.004 ||
        Math.abs(openTo - s.open) > 0.004;
      if (moving || s.jump || s.blink || glancing)
        frame = requestAnimationFrame(tick);
    };
    const wake = () => {
      if (!frame) {
        last = performance.now();
        frame = requestAnimationFrame(tick);
      }
    };
    kick.current = wake;

    const look = (clientX: number, clientY: number) => {
      if (reduced) return;
      const box = el.getBoundingClientRect();
      const px = clientX - (box.left + box.width / 2);
      const py = clientY - (box.top + box.height / 2);
      const d = Math.hypot(px, py) || 1;
      // The farther the pointer, the farther he looks, easing out toward the edge of the eye.
      const reach = span * (1 - Math.exp(-d / (REACH * r * 0.6)));
      s.dx = (px / d) * reach;
      s.dy = (py / d) * reach;
      s.near = Math.max(0, Math.min(1, 1 - (d - r) / (2 * r)));
      s.seen = true;
      const now = performance.now();
      s.moved = now;
      if (!s.glance) aim(s.dx, s.dy, now);
      wake();
    };
    const onMove = (event: PointerEvent) => look(event.clientX, event.clientY);
    const onRelayed = (event: Event) => {
      const at = (event as CustomEvent<{ x: number; y: number }>).detail;
      if (at && typeof at.x === "number") look(at.x, at.y);
    };
    // Still for a moment, the eyes make the tiny jumps real eyes make (micro-saccades).
    const drift = () => {
      driftTimer = window.setTimeout(
        () => {
          const now = performance.now();
          if (!reduced && !s.glance && !s.jump && now - s.moved > 1500) {
            const a = Math.random() * Math.PI * 2;
            const m = 0.035 * r * (0.5 + Math.random());
            s.jump = {
              at: now,
              x: s.dx + Math.cos(a) * m,
              y: s.dy + Math.sin(a) * m,
            };
            wake();
          }
          drift();
        },
        500 + Math.random() * 900,
      );
    };
    const blink = () => {
      blinkTimer = window.setTimeout(
        () => {
          s.blink = { at: performance.now(), double: Math.random() < 0.2 };
          wake();
          blink();
        },
        1000 * (BLINK_MIN + Math.random() * (BLINK_MAX - BLINK_MIN)),
      );
    };
    // A glance somewhere when the pointer has been still for 2.5 s; often, while Lander works.
    const glance = () => {
      const busy = live.current.working;
      glanceTimer = window.setTimeout(
        () => {
          const now = performance.now();
          if (!reduced && (busy || !s.seen || now - s.moved > 2500)) {
            const angle = Math.random() * Math.PI * 2;
            const reach = TRAVEL * r * (0.6 + 0.4 * Math.random());
            const x = Math.cos(angle) * reach;
            const y = Math.sin(angle) * reach * 0.7;
            s.glance = {
              until:
                now + (busy ? 500 : 700) + Math.random() * (busy ? 600 : 900),
              x,
              y,
            };
            s.jump = { at: now, x, y };
            wake();
          }
          glance();
        },
        busy ? 900 + Math.random() * 700 : 2500 + Math.random() * 4000,
      );
    };

    draw(1);
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener(BUDDY_POINTER, onRelayed);
    blink();
    glance();
    drift();
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener(BUDDY_POINTER, onRelayed);
      window.clearTimeout(blinkTimer);
      window.clearTimeout(glanceTimer);
      window.clearTimeout(driftTimer);
      if (frame) cancelAnimationFrame(frame);
      kick.current = () => {};
    };
  }, [r, reduced, tilt]);

  return (
    <motion.span
      aria-hidden
      className={cn(
        "relative flex shrink-0",
        size === "xs" && "size-4",
        size === "sm" && "size-6",
        size === "md" && "size-7",
        size === "lg" && "size-11",
        className,
      )}
      // While Lander works he breathes (the old mark's slow scale), still with reduced motion.
      animate={working && !reduced ? { scale: [1, 1.06, 1] } : { scale: 1 }}
      transition={
        working && !reduced
          ? { duration: 1.8, ease: "easeInOut", repeat: Infinity }
          : { duration: 0.3 }
      }
    >
      <span
        ref={body}
        data-buddy=""
        className="absolute inset-0 rounded-full bg-buddy-body"
      >
        {seats.map((seat, i) => (
          <span
            key={i}
            ref={(node) => {
              eyes.current[i] = node;
            }}
            className="absolute block origin-center rounded-full bg-buddy-eye will-change-transform"
            // Buddy's geometry, in px from his radius (data, not spacing).
            style={{
              left: seat.left,
              top: seat.top,
              width: eyeW,
              height: eyeH,
              transform: `rotate(${TILT[i]}deg)`,
            }}
          />
        ))}
        <svg
          ref={mouthEl}
          aria-hidden
          className="pointer-events-none absolute overflow-visible text-buddy-eye"
          style={{
            left: fx + m.x - mouthW / 2,
            top: fy + m.y,
            width: mouthW,
            height: mouthH,
            transformOrigin: "50% 0",
            transform: "scale(1, 0)",
            opacity: 0,
          }}
          viewBox={`0 0 ${mouthW} ${mouthH}`}
        >
          <path
            d={`M0 0H${mouthW}C${mouthW} ${1.33 * mouthH} 0 ${1.33 * mouthH} 0 0Z`}
            fill="currentColor"
          />
        </svg>
      </span>
    </motion.span>
  );
}
