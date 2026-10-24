---
name: figma-screen-build
description: How to turn a screen, section or component from the owner's Figma file into LP Platform pixel for pixel, in light and dark — studying every frame and variable, mapping to the app's tokens, covering the states the frames don't draw, motion that follows Emil, tuning with DialKit, Hairline illustrations, verifying in a real browser against Figma with throwaway data, then documenting and shipping. Use this skill whenever the owner shares a Figma link or node, names a Figma section or frame ("look at the Build section", "Build/Fail"), asks to implement, restyle, match or "make pixel perfect" a page or component, asks for light/dark fixes, loaders, states, demos, a tuning dial or an illustration, or pastes a DialKit "Update the useDialKit configuration" block — even if they don't say "Figma".
---

# Figma screen build

The owner designs in Figma and wants each screen built to the pixel, in both themes, with every
state accounted for, motion that feels right, and proof that it matches. They review visually and
iterate fast: expect follow-ups like "look at the X frame again", "the text is too far", or a
pasted DialKit config. This skill is the routine that worked for the Build page (D82); follow it in
order the first time, and jump to the matching phase on follow-ups.

It sits under `milestone-build`: for a new feature, plan and wait for the owner's go as that skill
says. A design pass the owner asks for directly ("implement this frame", "fix this") is done
directly, then reported.

The Figma file is `WJylkbnRxmt6QfEXWQ2m2h`. Read it freely; write to it only when asked.

A general version for other projects lives in `~/.claude/skills/figma-pixel-perfect`. When a
pass teaches something that isn't specific to LP Platform, add it there too.

## The phases

### 1. Orient (a few minutes, always)

- Read the tail of `docs/BUILD_LOG.md` and `git log -5`: other sessions edit this repo too.
- List the Figma section's frames and component sets (light, dark, full screen, mobile, failure
  and other variants), and screenshot each frame. Frames often share a name; the mode is in
  `explicitVariableModes`, not the name.
- Find the screen's code and data flow before touching styles: where the data comes from, which
  parts are server and which client, what tests exist.

### 2. Study the frames — `references/figma-study.md`

Dump every visible node of the main frame (layout, sizes, fills and strokes with variable names,
radii, effects, text styles) with the script in that file, and screenshot crops. Then:

- Resolve the variables' values in **both modes** and diff them against `apps/web/app/globals.css`.
  Code follows Figma: when the owner has changed a token, change it in code and say so (it touches
  every screen).
- Read component sets through their **instances in the frames**: a set renders in the mode of
  wherever it sits, so its own values can be the other theme's.
- Check visibility up the parent chain — `findOne` happily returns hidden duplicates.
- Note where frames disagree (an older frame not updated, a variant left in the wrong state) and
  where content is a **placeholder** (filler copied from another screen, a dashed "illustration
  goes here" box). Pick the main frame, and list each choice in the report. Ask only when a choice
  changes behaviour.
- When the owner says "look at it again", re-dump: new node ids (higher numbers) mean they edited.

### 3. Map to the app — `references/styling.md`

Figma variable names are the class names (`bg-surface-primary`, `text-heading-05`). Sub-pixel
strokes, dashes, per-theme values and line heights each have a known recipe there. No raw colours
or arbitrary values in feature code (the token lint enforces it); new values become tokens or
utilities in `globals.css`, registered in `lib/utils.ts` when they are shadows, radii or ring widths.

### 4. Build

- Reuse before adding: `components/ui`, `components/app`, the existing features. Feature code
  imports UI only from `ui/` and `app/`.
- Split a component into a view and its wiring when a showcase or demo needs to render a state
  without the real data (`ExportButtonView`, `BuildStepsCard`).
- Map real data honestly: if a frame shows something the data can't support, show what the data
  says and tell the owner.
- Known traps: event handlers can't cross from a server component to a client one; Next keeps a
  left page alive (React Activity) and restores its state, so close dialogs on the way out; the
  React lint rejects setState in effects (read storage with `useSyncExternalStore`) and ref writes
  during render; a scroll column's children need `*:shrink-0` or an `overflow-hidden` card
  collapses to nothing; an iframe of a built page needs a white canvas in dark mode.

### 5. States and motion — `references/states-motion.md`

Frames draw the happy path. Enumerate the rest (loading, queued, running, failed, empty, long
content, phone width, reduced motion, both themes), give each a sensible stand-in, and show them
all on a development page (`/dev/<screen>-states`) with when each appears and what a design needs.
The owner redesigns from that page. For anything that runs over time, add a `?demo` replay
(and `?demo=fail`) so they can watch it without paying for a real run.

Motion follows `emil-design-eng` (load it): name the properties, 250 ms ease-out, no snaps,
continuous rather than stop-and-go, reduced motion keeps fades and drops movement. When the owner
asks whether something follows Emil, review it in the skill's Before | After | Why table and fix
what fails.

Tuning: when values are a matter of taste (stroke, size, intensity, gaps), give the owner a DialKit
panel; they tune and paste back a config. Illustrations: Hairline (`@lucasmarkes/hairline`, and the
`hairline-create` skill for new figures). Recipes for both are in the reference.

### 6. Verify — `references/verification.md`

Run the checks, then look. Nothing is reported as matching that wasn't compared:

```bash
pnpm --filter web typecheck && pnpm --filter web lint && pnpm lint:tokens
pnpm exec prettier --check apps/web docs
cd apps/web && pnpm exec vitest run --maxWorkers=2   # the machine times tests out under load
cd services/worker && uv run ruff check . && uv run mypy && uv run pytest -q tests/<file>  # if the worker changed
```

In the browser: a throwaway account with seeded data (`scripts/`), every state in both themes,
crops side by side with the Figma screenshots (`scripts/compare_crops.py`), measured values where
it matters (gaps, stroke widths, heights), reduced motion and 390 px width. Never start a real
pipeline run to see a state: seed the database or intercept the job polling. Delete the account
and its stored files at the end.

### 7. Deliver — `references/delivery.md`

Record the decision (DECISIONS.md, a new Dxx or a follow-up on the screen's), the screen row in
DESIGN.md, a BUILD_LOG entry, and DEPENDENCIES / THIRD_PARTY_NOTICES for anything added. Then a
short report: what changed, where to see it (full localhost URLs), what was verified, the choices
made where frames disagreed or were silent, and what is not committed. Commit only when asked,
and only your own changes; a push to main deploys production.

## Working with this owner

- Short replies. Do the safe to-dos yourself instead of listing them. Flag anything that costs
  money before doing it (real AI runs, new paid services).
- Figma is authoritative, but they welcome a reasoned recommendation; give one, not a survey.
- They often describe intent loosely ("make the flow more fluid", "the text is so far"): find the
  cause (the tour's 1.2 s stops; the figure's empty margins), fix that, and say what it was.
- An experiment stays uncommitted until they approve it. Say so in each report.
- A pasted "Update the useDialKit configuration … with these values" block means: set those as
  the defaults in that `useDialKit` call (and the CSS fallbacks that mirror them). If they send two
  (e.g. "this one for dark, this one for light"), the control becomes per theme.
