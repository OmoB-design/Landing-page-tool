/**
 * Assemble: a landing page lying on the desk, built from the top down. The
 * pointer's height is how far the build has reached: sections above it sit in
 * their slots; those below hover over their dashed slots, the farther below the
 * higher, gliding down as the line comes to them, and the next to land has the
 * bright edge. The read-out names it. The slider is how high a section floats.
 *
 * The pattern: a field along one axis. A spring per section, the pointer read
 * on the ground plane (which never moves), and a falloff that reaches a floor.
 */
const {
  Cam, circ, clamp, facing, fit, poly, prism, proj, ringAt, rings, rrect, seg, spring, stepS, unproj,
  disposer, flatDot, mk, place, pointer, put, register, solid,
} = HL;

const W = 118, L = 178, PT = 3, T = 2.4, B = 1, REST = 104, BAR = 12;
/** The sections, top to bottom: their plates (x0, y0, x1, y1, radius) and what is printed on them. */
const SECTIONS = [
  { name: "hero", plates: [[8, 18, W - 8, 66, 3]], marks: hero },
  { name: "features", plates: [[8, 72, 39, 102, 3], [43.5, 72, 74.5, 102, 3], [79, 72, W - 8, 102, 3]], marks: features },
  { name: "proof", plates: [[8, 108, W - 8, 130, 3]], marks: proof },
  { name: "offer", plates: [[34, 136, W - 34, 150, 7]], marks: offer },
  { name: "footer", plates: [[8, 158, W - 8, 168, 3]], marks: footer },
];
const mid = (s) => (s.plates[0][1] + s.plates[0][3]) / 2;

/** Lines and outlines printed on a section's top face at height z, as one path; P projects. */
function hero(P, z) {
  const ln = (x0, x1, y) => seg(P(x0, y, z), P(x1, y, z));
  return poly(ringAt(P, rrect(64, 24, W - 14, 60, 3, 4), z)) + ln(14, 54, 28) + ln(14, 50, 34) + ln(14, 44, 40) +
    poly(ringAt(P, rrect(14, 48, 38, 56, 4, 4), z));
}
function features(P, z) {
  return SECTIONS[1].plates.map(([x0]) =>
    poly(ringAt(P, rrect(x0 + 4, 76, x0 + 12, 84, 2, 3), z)) + seg(P(x0 + 4, 90, z), P(x0 + 26, 90, z)) + seg(P(x0 + 4, 95, z), P(x0 + 20, 95, z)),
  ).join("");
}
function proof(P, z) {
  const face = circ(5, 12).map((q) => ({ ...q, u: q.u + 18, v: q.v + 119 }));
  return poly(ringAt(P, face, z)) + seg(P(28, 115, z), P(100, 115, z)) + seg(P(28, 121, z), P(86, 121, z)) + seg(P(28, 126, z), P(70, 126, z));
}
function offer(P, z) {
  return seg(P(W / 2 - 10, 143, z), P(W / 2 + 10, 143, z));
}
function footer(P, z) {
  return seg(P(14, 163, z), P(40, 163, z)) + seg(P(W - 40, 163, z), P(W - 14, 163, z));
}

/** How high a section floats when the build has reached `line`: in its slot once the line is past
 * its middle, and rising smoothly with its distance below the line to the full lift 60 units on, so
 * a section glides down into place as the line comes to it rather than dropping in one step. */
const REACH = 60;
const height = (s, line, lift) => {
  const t = clamp((mid(s) - line) / REACH, 0, 1);
  return lift * t * t * (3 - 2 * t);
};
/** The next section to land: the first below the line, or the last once every section is built. */
const next = (line) => {
  const i = SECTIONS.findIndex((s) => mid(s) > line);
  return i < 0 ? SECTIONS.length - 1 : i;
};

function mount({ stage, svg, read }, value) {
  const bag = disposer();
  let lift = value, line = REST, held = false;

  // The camera is fitted to the page with its last section floating at the slider's far end.
  const C = Cam(45, 0.5, 1.45);
  fit(C, [[0, 0, -PT], [W, 0, -PT], [0, L, -PT], [W, L, -PT], [8, 158, 36 + T], [W - 8, 168, 36 + T], [W, 0, 0]], 200, 166);
  const P = proj(C), front = facing(C);

  const g = mk("g", {}, svg);
  // the page: a slab, the browser bar's three dots and its rule, then each slot's dashed outline on the page
  const [pRing, pInner] = rings(0, 0, W, L, 4, 1.6);
  put(solid(g), prism(P, front, pRing, pInner, -PT, 0));
  [6, 11, 16].forEach((x, k) => place(flatDot(g, C, 1.1, k === 0 ? "dot m" : "dot off"), P(x, BAR / 2, 0)));
  mk("path", { d: seg(P(4, BAR, 0), P(W - 4, BAR, 0)), class: "nf lo" }, g);
  for (const s of SECTIONS) for (const [x0, y0, x1, y1, r] of s.plates) mk("path", { d: poly(ringAt(P, rrect(x0, y0, x1, y1, r, 4), 0)), class: "nf dash" }, g);

  // the sections, back to front; each is its plates and its printed marks, drawn at the height its spring gives
  const parts = SECTIONS.map((s) => {
    const grp = mk("g", {}, g);
    const plates = s.plates.map(([x0, y0, x1, y1, r]) => ({ rr: rings(x0, y0, x1, y1, r, B), el: solid(grp) }));
    const marks = mk("path", { class: "nf lo" }, grp);
    return { s, plates, marks, sp: spring(height(s, line, lift)), drawn: NaN };
  });

  function draw(p, z) {
    if (z === p.drawn) return;
    p.drawn = z;
    for (const q of p.plates) put(q.el, prism(P, front, q.rr[0], q.rr[1], z, z + T));
    p.marks.setAttribute("d", p.s.marks(P, z + T));
  }

  const loop = register(stage, (dt) => {
    let moving = false;
    for (const p of parts) {
      if (stepS(p.sp, dt)) moving = true;
      draw(p, Math.round(p.sp.x * 100) / 100);
    }
    return moving;
  });
  bag.add(loop.unregister);

  /** Moves the build to `to` (null: back to rest). The bright edge goes to the next section to land. */
  function setLine(to) {
    held = to !== null;
    line = held ? clamp(to, -10, L + 10) : REST;
    const n = next(line);
    parts.forEach((p, i) => {
      p.sp.t = height(p.s, line, lift);
      for (const q of p.plates) q.el.sil.classList.toggle("hi", i === n);
    });
    read.textContent = held ? SECTIONS[n].name : "rest";
    loop.wake();
  }

  setLine(null);
  // The pointer is read on the ground plane, which never moves: its world y is the line.
  bag.add(pointer(stage, { move: ([x, y]) => setLine(unproj(C, x, y, 0)[1]), leave: () => setLine(null) }));
  bag.add(() => svg.replaceChildren());

  return {
    set: (v) => {
      lift = v;
      if (!held) setLine(null);
      else setLine(line);
    },
    destroy: bag.dispose,
  };
}

hairline({
  name: "assemble",
  means: "A landing page built from the top: sections above the pointer sit in place, the rest hover over their slots.",
  rules: [1, 3, 5, 6],
  range: [10, 22, 36],
  tour: [[245, 140], [201, 162], [155, 185], [117, 204], null],
  mount,
});
