# HANDOFF.md — how to give this package to Claude Code

This file is for you (Bolaji), not for Claude Code. Delete it after setup or keep it in `docs/`.

## 1. What's in the package

| Path | What it is | Who reads it |
|---|---|---|
| `CLAUDE.md` | Project memory: rules, locked decisions, paths, the per-build protocol | Claude Code, automatically, every session |
| `.claude/skills/milestone-build/SKILL.md` | Plan → your go → build → verify → Build Report → stop | Claude Code, every build |
| `.claude/skills/template-onboarding/SKILL.md` | Markup contract and steps for library and cloned templates | Claude Code + you when designing templates |
| `docs/BUILD_SPEC.md` | Everything to build, extracted from the reference doc and adapted | Claude Code (source of truth) |
| `docs/DECISIONS.md` | Every decision we made, with rationale, plus open questions | Both |
| `docs/MILESTONES.md` | Ordered builds B0.1 → B4.3 with acceptance criteria and your actions | Both |
| `docs/DESIGN.md` | UI style from your screenshot, tokens, components, Figma MCP process | Both |
| `docs/DEPENDENCIES.md` | Packages, services, accounts, env vars | Both |
| `docs/schema/001_init.sql` | Full Postgres/Supabase schema draft (parses cleanly) | Claude Code at B0.2 |
| `docs/pipeline/graph_sketch.py` | Runnable LangGraph pipeline sketch with routing tests | Claude Code at B0.6 |
| `docs/reference/LP_Tool_How_It_Works.md` | Your original doc, framed as reference-only | Claude Code, for mechanics |
| `docs/BUILD_LOG.md`, `DESIGN_REPLACEMENTS.md`, `TEMPLATE_GUIDE.md` | Living logs Claude Code appends to | Both |

## 2. Setup (in this order)

1. Create an empty folder `lp-platform/` and `git init` it.
2. Copy the **contents** of this package into it, keeping the paths: `CLAUDE.md` at the root, `.claude/` at the root, `docs/` at the root. (The `.claude` folder is hidden in Finder; press `Cmd+Shift+.` to see it.)
3. Commit: `git add -A && git commit -m "docs: handoff package"`.
4. Make sure the Figma MCP is connected in Claude Code (you'll need it from Phase 2, not for M0).
5. Open Claude Code in `lp-platform/` and paste the first prompt below.

## 3. First prompt to paste

```
Read CLAUDE.md fully, then every file in docs/ in the order CLAUDE.md §0 lists, and both skills
in .claude/skills/. Treat docs/reference/ as reference only.

Before any code:
1. Summarise back to me, in your own words: what we're building, the owned/cloned fork, the
   milestone order, and the locked decisions you consider most important.
2. List anything in the docs that is contradictory, ambiguous, or that you'd challenge, with your
   recommendation for each.
3. Then post the plan for B0.1 following the milestone-build skill, and wait for my go.
```

The summary step is your check that Claude Code understood. Correct anything it gets wrong before saying go.

## 4. Each build after that

Say: **"Go"** to approve a plan, or give corrections. After the Build Report, do the "What you need to do" list, run the "What to test" checklist, then say **"Confirmed, plan B<next>"** (or report what failed).

## 5. Starting the Figma replacement (Phase 2)

When a component or screen is designed, say:

```
Replace <component or screen> from Figma: <frame URL with node-id>.
Follow DESIGN.md §7 and the milestone-build skill. Pull tokens first and show me the token diff.
```

One component or screen per build.

## 6. Should you also hand over the original doc?

Yes — it's already included at `docs/reference/LP_Tool_How_It_Works.md`, wrapped with instructions.
It carries algorithmic detail (fix-up order, length-budget formula, Shopify upload order, size limits)
that is useful when Claude Code implements a node and BUILD_SPEC is brief. The risk is that Claude Code
copies its architecture (single process, in-memory jobs, JSON files, no auth). That's handled by
CLAUDE.md §3, the reference README, and the rule that BUILD_SPEC.md wins on any conflict.

## 7. Things still open for you (from DECISIONS.md)

O1 product name · O2 clone-path terms text (get legal input) · O3 first library templates ·
O4 billing (out of scope for now) · O5 "doctor/expert" author type · O6 worker hosting (needs Chromium).
None block B0.1.
