/**
 * The Home cards' canvas (I1, after Quality's in-app Home): every scene is drawn on Quality's
 * 398 px design canvas, so its UI is laid out at real sizes, and the canvas is zoomed to the
 * card's 283 px picture (0.711). Zoom, not a transform: the browser lays the text out and draws it
 * at its final size, so it stays sharp (a scaled layer is drawn large and shrunk, and blurs). The
 * Stage itself draws 1:1 at the picture's size; the cursor moves in its pixels. Our pictures are
 * 207 px tall, so the canvas is 291 high (Quality's is 283); the frames sit at Quality's
 * coordinates.
 */
export const STAGE = { width: 283, height: 207 } as const;
export const CANVAS = { width: 398, height: 291 } as const;
export const ZOOM = STAGE.width / CANVAS.width;

type Point = { x: number; y: number };

/** A point on the canvas, in the stage's pixels (where the cursor moves). */
export const onStage = (p: Point): Point => ({ x: p.x * ZOOM, y: p.y * ZOOM });

/**
 * The gutter around each card's frame, on every side it doesn't bleed past: 36 canvas px (about
 * 26 on screen). Even all round (owner, 2026-11-03: "more spacing around"), where Quality's frames
 * sit 20 to 38 in; their style, chrome and scale are kept.
 */
export const GUTTER = 36;

/** A whole frame on the canvas, a gutter in from every edge. */
export const FRAMED = {
  left: GUTTER,
  top: GUTTER,
  width: CANVAS.width - GUTTER * 2,
  height: CANVAS.height - GUTTER * 2,
} as const;
