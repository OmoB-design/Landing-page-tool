# Stageshow kit: LP changes

The `kit/` folder of Benji Taylor's Stageshow skill (github.com/benjitaylor/skills, commit
`8020574`, 2026-10-31; MIT, see `LICENSE`), copied for LP's illustrations (D101). Installed skill:
`~/.claude/skills/stageshow`. Everything here is the kit as published, except:

1. **No brand marks.** `brands/` (third-party logos under their own licences) and
   `parts/BrandMark.*` are left out, with their exports in `index.ts` and `parts/index.ts` and
   their `@import` in `stageshow.css`. LP draws other companies' marks with its own logos
   (`components/ui/icons`).
2. **Non-null assertions for `noUncheckedIndexedAccess`.** LP's TypeScript reports indexed reads
   as possibly undefined; the kit's own config doesn't. 98 `!` were added where the compiler
   pointed (`act.ts`, `chart.tsx`, `ios.tsx`, `measure.ts`, `motion/Connector.tsx`,
   `motion/Count.tsx`, `stage.tsx`). Type-only: nothing changes at run time.
3. **A name tag on the cursor.** `Stage`'s `cursor` takes `label`, and `Cursor` draws it as a tag
   below and right of the pointer in the pointer's ink (`.ss-cursor__label` in `cursor.css`), as a
   collaborator's cursor carries one (after Quality's homepage). Without `label` nothing changes;
   the Home cards don't use it (your own cursor carries no name), it waits for a scene with teammates.

4. **Rest after a few loops.** `Stage` takes `rest` (with `play="loop"`): after that many loops
   it holds at the loop's start (its seam) and stops its clock, until the pointer is over the
   stage, which plays it again while it stays there (it finishes the loop it's in when the pointer
   leaves, then rests). The Home cards loop twice, then rest (B6.8): a looping scene kept about a
   fifth of a CPU core busy while Home was open.

Kept in the skill's own format (no Prettier, no ESLint) so a newer version diffs cleanly:
`git diff --no-index ~/.claude/skills/stageshow/kit apps/web/components/ui/stageshow`.

How LP uses it: scenes live in `components/app/illustrations/`, styled by LP's look
(`components/app/illustrations/look.css`). Illustration timing follows Stageshow; real UI keeps
`motion/react` and the Emil curves (D51). A kit part goes into real UI only through an LP
wrapper at Emil timings, on the owner's call.
