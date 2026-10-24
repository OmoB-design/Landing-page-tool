# States, motion, tuning and illustrations

## States the frames don't draw

Go through this list for every screen and decide what each shows:

- loading (a skeleton in the shape of the content; real labels stay, only data shimmers; skeletons
  wait 150 ms so quick loads show nothing)
- not started / queued, running, finished, failed (and the reason), retried
- empty, one item, very long content (the Build page's 130+ copy changes)
- buttons: ready, unavailable (tooltip saying why), busy (spinner + "…ing"), done, error (toast)
- phone width (390 px: what stacks, what hides), sidebar collapsed ("full screen")
- reduced motion, both themes, keyboard focus

Give each a stand-in built from the screen's own pieces, then show them all on a development page,
`app/(app)/dev/<screen>-states/page.tsx` (guard with `if (process.env.NODE_ENV !== "development")
notFound()`), as `/dev/build-states` does: for each state, **When it shows**, **What it shows
today**, **For your design**, and the real component rendered with sample data underneath.
Interactive samples (a retry that only toasts, a toast trigger) go in a client component — a server
page can't pass handlers. Database reads on the page go inside `<Suspense>` (Cache Components).

## Demo replays

For anything that runs over time, add `?demo` to the real page (development only), so the owner
can watch it from the start with the real report at the end: a client component plays a fixed
timeline over the real components (`build-demo.tsx`). `?demo=fail` stops at a step until Retry. No
job runs and nothing is saved. Give it a small "Demo · Step n of 13 · Replay" pill.

## Motion (with the emil-design-eng skill loaded)

- Name the transitioned properties; `transition` alone animates everything. Make a utility when a
  pair is needed (`transition-card`: fill and shadow; `transition-label`: transform and colour).
- 250 ms on the strong `ease-out` for state changes; spinners linear and fast (0.8 s).
- No snaps: a loader that stops should hold its angle, or swap to a different icon; a card that
  appears should fade its fill and shadow in.
- Continuous beats stop-and-go: Hairline's built-in `play` walks stops with 1.2 s waits — for a
  calm loop drive the figure yourself (below).
- Reduced motion: keep fades, drop movement (`motion-reduce:transition-colors` on a scaling label;
  a slower spinner rather than none).
- Spinners: the owner's spoke spinner for a running step (`BuildSpinnerIcon`), Quality's arc
  `Spinner` for buttons.
- When asked "does this follow Emil?", answer with the skill's Before | After | Why table, then fix.

## DialKit (owner tuning)

`dialkit` + `motion` are installed. In a client component:

```tsx
import "dialkit/styles.css";
import { DialRoot, useDialKit } from "dialkit";

const dial = useDialKit("Build illustration", {
  stroke: { light: [0.9, 0.4, 3, 0.05], dark: [0.9, 0.4, 3, 0.05] }, // [default, min, max, step]
  size: [280, 120, 480, 4],
  figure: { type: "select", options: ["assemble", "terminal"], default: "assemble" },
  play: true,
  preview: { _collapsed: true, scrub: false, progress: [0.4, 0, 1, 0.01] },
}, { id: "build-illustration-v2", persist: true });
```

- `DialRoot` hides itself in production builds; values still apply as defaults there.
- The screen's corners are taken (header, sidebar, Next's dev badge bottom-right), so render the
  panel inline in a corner of the thing being tuned:
  `<div className="absolute top-3 right-3 w-65"><DialRoot mode="inline" /></div>`.
- The owner tunes, presses Copy, and pastes "Update the useDialKit configuration … with these
  values". Apply them as the defaults, update any CSS fallback that mirrors them, and mention it.
- Change the panel `id` (`…-v2`) when the config's shape changes or defaults must override what the
  owner's browser saved.
- Per-theme values: two controls feeding CSS variables (`--well-stroke-light`, `--well-stroke-dark`)
  that a utility picks per theme.

## Hairline illustrations

- Package figures: `import { Terminal } from "@lucasmarkes/hairline/react"` (33 figures; see its
  README). Theme with `--hairline-plate` (set it to the surface it sits on), `--hairline-hi`,
  `--hairline-edge`, `--hairline-mid`, `--hairline-lo`, `--hairline-stroke` — the `hairline-well`
  utility maps them to tokens.
- New figures: the `hairline-create` skill. Write the figure in a scratch folder, run its
  `build.mjs`, `validate.mjs` and `look.mjs` (a "moving" verdict on a busy machine: check the svg is
  unchanged a second apart, then re-run). The concept is one object, one gesture, one read-out.
- Serving a skill-made figure: copy the engine `kernel.js` **unchanged** and the figure to
  `apps/web/public/hairline/`, and mount with `components/app/hairline-figure.tsx`
  (`<HairlineFigure name="assemble" … />`). ESLint and Prettier ignore that folder; `.js` files skip
  the auth proxy.
- `HairlineFigure` can drive the figure: `sweep` (a continuous lap along a path of viewBox points)
  and `progress` (stand at a point of that path, gliding there, with a slow bob short of the end) —
  that is how Assemble follows a real build. It dispatches pointer moves the figure reads; a real
  pointer takes over; nothing runs under reduced motion or off screen.
- Figures sit in a 5:4 box with empty margins; measure the drawing (the look's "Rest fills …" line)
  and trim them with negative margins so gaps are measured from the drawing.
- Record the licence in THIRD_PARTY_NOTICES.md (MIT, Lucas Marques).
