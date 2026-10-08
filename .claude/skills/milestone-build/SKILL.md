---
name: milestone-build
description: The mandatory protocol for every build step of LP Platform — plan, wait for the owner's go, build only the agreed scope, verify, then hand over a Build Report (what was built, what to test, what the owner must do) and stop. Use this skill whenever starting, continuing, resuming or finishing any build, milestone, feature, fix, refactor or Figma component replacement in this repository, even if the request does not say "build" or "milestone". If you are about to write or change code in this repo, use this skill first.
---

# Milestone build protocol

The owner (Bolaji) works document-first and confirmation-gated. He needs to understand each build, test it himself, and know exactly what he must do. This skill is the procedure. Follow every phase in order.

## Phase 1 — Orient (no code yet)

1. Read `CLAUDE.md`, then `docs/BUILD_LOG.md` to find the last completed build and anything in progress.
2. Find the build in `docs/MILESTONES.md`. Read the matching sections of `docs/BUILD_SPEC.md`, any decisions in `docs/DECISIONS.md` it touches, and `docs/DESIGN.md` if it has UI.
3. Check the repo state: `git status`, current branch, tests passing before you start. If tests are red before you touch anything, report that first.

## Phase 2 — Plan and wait

Post a plan in this shape, then **stop and wait for the owner to say go**. Do not write code in the same turn.

```markdown
## Plan — B<x.y> <title>

**Goal:** one or two sentences.

**In scope**
- ...

**Out of scope (deliberately)**
- ...

**Files**
| Action | Path | Purpose |
|---|---|---|
| create | ... | ... |
| modify | ... | ... |

**Schema / migration changes:** none | list them
**New dependencies:** none | name — why — alternatives considered
**Decisions this build makes:** none | new decision with proposed id (add to DECISIONS.md after approval)
**Open questions for you:** numbered, each with my recommended answer
**Risks:** ...
**Cost:** $0 (mock mode) | estimated $ for any live provider call, and I will not run it without your go
**What I'll need from you during/after this build:** preview of owner actions
```

If the plan reveals the build is too big for one review, propose a split (B<x.y>a, B<x.y>b).

## Phase 3 — Build

- Build only the approved scope. If you find something necessary outside it, pause and ask, or note it for the next build.
- Follow `CLAUDE.md` coding rules: engines pure and tested, every paid call through `providers/`, `org_id` filtering, tokens not raw values, imports from `@/components/ui` and `@/components/app` only.
- Mock mode stays on. Never call live paid providers without explicit permission in this conversation.
- Never `git push`, deploy, or run destructive DB commands against non-local databases.
- Keep a running list of deviations from the spec and why.

## Phase 4 — Verify

Run and fix until clean:
- web: typecheck, lint, unit tests;
- worker: ruff, mypy, pytest;
- migrations apply from scratch (`supabase db reset`) if the schema changed;
- start the app and exercise the feature yourself (use Playwright screenshots for UI work where possible);
- for UI built from Figma: capture a screenshot and compare to the Figma screenshot.

Do not report success on anything you did not actually run. If something could not be verified (needs a real key, a real store), say so plainly.

## Phase 5 — Build Report

Post the report in exactly this structure. Write for someone who did not watch you work. Be concrete: exact paths, exact commands, exact URLs, exact expected results.

```markdown
# Build Report — B<x.y> <title>

## 1. What was built
Three to six bullet summary of the outcome in plain language.

**Key information**
- Architecture/flow added: ...
- Files created/changed (grouped, most important first): ...
- Schema changes: ...
- New dependencies (with versions): ...
- Decisions made (ids, added to DECISIONS.md): ...
- Deviations from the spec and why: ... | none

## 2. How to run it
Exact commands from a clean terminal, in order, with which directory to run them in.

## 3. What to test
A numbered checklist. Each item: steps → expected result. Cover the happy path, at least one failure path, and tenant isolation or permissions when relevant.

1. **<name>** — Steps: ... → Expected: ...
2. ...

## 4. What you need to do
Explicit, comprehensive directives, numbered, in the order to do them. For each: what, where exactly (URL, menu path, file and variable name), and how to tell it worked. Include accounts to create, keys to paste, settings to change, Figma frames to prepare, decisions to make (with my recommendation). If nothing: "Nothing required from you for this build."

## 5. Known limitations and follow-ups
...

## 6. Proposed next build
B<next> — one paragraph on scope, and anything to prepare for it.

## 7. Verification log
Commands run and their results (pass/fail counts), what was checked manually, what could not be checked and why.
```

## Phase 6 — Log and stop

1. Append an entry to `docs/BUILD_LOG.md` (template inside that file).
2. Update `CLAUDE.md` §5 Commands if commands changed, and `docs/DECISIONS.md` if decisions were made.
3. Offer to commit locally with a suggested message; commit only if the owner says so.
4. **Stop.** Do not start the next build until the owner confirms.

## Resuming

If `BUILD_LOG.md` shows a build marked in progress, summarise where it stands (done, remaining, blockers), and ask whether to continue before doing anything.

## Figma component replacement builds

Use this same protocol with `docs/DESIGN.md` §7. The plan lists the Figma node(s), the components affected, and a token diff table. The report includes side-by-side screenshots (or their paths) and an entry in `docs/DESIGN_REPLACEMENTS.md`.
