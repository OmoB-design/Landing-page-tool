# CLAUDE.md — LP Platform

You are building **LP Platform** (working name; the owner may rename it): a multi-tenant SaaS that produces direct-to-consumer (DTC) landing pages for a brand's product, either by **cloning a proven competitor landing page and rebranding it**, or by **rebranding a template the user owns** from a curated starter library. Both paths run through **one shared build pipeline** that forks only where the page skeleton comes from.

The owner is **Bolaji**, a product designer and developer. He designs the UI in Figma and will replace the starter shadcn components with his own designs through the Figma MCP. He wants to understand every build, test it himself, and approve each step before the next one starts.

Read this file fully at the start of every session. It is the contract.

---

## 0. Read order for a new session

1. `CLAUDE.md` (this file): rules, decisions, paths, protocol.
2. `docs/BUILD_SPEC.md`: what to build, in full detail. **Source of truth for behaviour.**
3. `docs/DECISIONS.md`: every locked decision and why. Do not reopen these without asking.
4. `docs/MILESTONES.md`: the ordered list of builds. Find the current build here.
5. `docs/DESIGN.md`: UI style, tokens, layout, and the Figma MCP replacement process.
6. `docs/DEPENDENCIES.md`: packages, services, environment variables.
7. `docs/schema/001_init.sql`: the database schema draft.
8. `docs/pipeline/graph_sketch.py`: the LangGraph pipeline sketch.
9. `docs/reference/LP_Tool_How_It_Works.md`: **reference only** (see §3).
10. `docs/BUILD_LOG.md`: what has been built so far. Append to it after every build.

If `docs/BUILD_LOG.md` shows a build in progress, resume that build. Never start the next build on your own.

---

## 1. The working protocol (non-negotiable)

The owner works **document-first and confirmation-gated**. Every build follows the `milestone-build` skill at `.claude/skills/milestone-build/SKILL.md`. In short:

1. **Plan before code.** At the start of a build, write a short plan: scope, files you will create or change, schema changes, new dependencies, risks, and anything you need from the owner. **Stop and wait for the owner to say go.**
2. **Build only the agreed scope.** If you discover something outside the scope, note it and ask. Do not quietly expand the build.
3. **Verify before reporting.** Type-check, lint, run the tests, run the app, and exercise the feature yourself where you can.
4. **Hand over with the Build Report** (template in the skill). Every build ends with:
   - **What was built**: key information, in summary.
   - **What to test**: a numbered checklist with exact steps and the expected result for each.
   - **What you need to do**: explicit, comprehensive directives for the owner: accounts to create, keys to paste and exactly where, commands to run, Figma work to do, decisions to make. If there is nothing, say "Nothing required from you."
   - Known limitations, deviations from the spec, and the proposed next build.
5. **Append to `docs/BUILD_LOG.md`.**
6. **Stop.** Do not begin the next build until the owner confirms.

Never `git push`, deploy, run paid API calls against real providers, or run destructive database operations without explicit permission in the current conversation. Commit locally at the end of each build only when the owner asks you to.

---

## 2. Decisions (summary; full rationale and status in `docs/DECISIONS.md`)

Numbering matches `docs/DECISIONS.md`, which is canonical. Every decision here is **Locked** unless marked *(Default)*; a Default can be changed by the owner at the build where it first matters. D21 onwards (pipeline behaviour, publishing defaults, build decisions) are in `docs/DECISIONS.md` only.

**Product**
- D1. One platform, two template origins: `cloned` and `owned`. One pipeline. The `origin` flag on a template is the only thing that switches the clone-only stages on.
- D2. The owned path is a **curated starter library** the owner designs. After picking a template the user can **reorder, remove and duplicate sections**. No blank-canvas block builder in v1 (deferred to v3).
- D3. Multi-tenant from day one: every row is scoped to an `org`. No query crosses orgs. Row-level security is on for every tenant table.
- D4. The clone path's legal controls are **enforced gates**, not banners: the residue score must clear a threshold and the compliance scan must pass before publish (owner override allowed and logged). The proxied bot-wall fetch is a feature flag that is off by default.
- D5. Milestone order: M0 Spine, M1 Owned path, M2 Clone path, M3 Review and edit, M4 Editable Shopify publish. M1 must be a complete, shippable product with no clone machinery.

**Architecture**
- D6. *(Default)* Monorepo: `apps/web` (Next.js) and `services/worker` (Python). Shared database. No shared runtime code between them; the database and the HTTP API are the contract.
- D7. The build pipeline is a **LangGraph `StateGraph`** with conditional edges on `origin`. Not one long imperative function.
- D8. **Postgres is the primary store.** Not JSON files. HTML and assets live in object storage and are referenced by path. The fully inlined, self-contained page is an **export format** produced on demand for static deploys. It is never the working format.
- D9. **No state in process memory** that matters: jobs, OAuth state, provider locks and progress all live in the database.
- D10. *(Default)* Background work runs on a **Postgres-backed job queue** (`jobs` table, workers claim with `FOR UPDATE SKIP LOCKED`). No Redis in v1.
- D11. *(Default)* Progress reaches the browser by **polling** with React Query (fast while a job runs, slow when idle). Realtime push is a later upgrade.
- D12. *(Default)* **Supabase** provides Postgres, Auth, Storage and Vault. Migrations live in `supabase/migrations/`, which is the single schema source. TypeScript types are generated from it; Python uses Pydantic models that mirror it.
- D13. Every AI and image call goes through one provider interface per vendor (`services/worker/app/providers/`) that records cost per call and per node. One pricing table, in one place.
- D14. Model names are configuration (environment variables), never hard-coded in node logic.
- D15. **Mock mode is the default in development and tests.** Image generation returns a local placeholder and costs nothing unless `LP_MOCK_IMAGES=0` is set explicitly. Tests never call live providers.
- D16. *(Default)* Use the official Anthropic Python SDK and the fal client. Do not hand-roll HTTP calls to these providers.
- D17. **No n8n.** The pipeline and peripheral glue (notifications, digests, cleanups) live in the worker, not in an external workflow tool.

**Frontend**
- D18. Next.js App Router, TypeScript strict, Tailwind v4 with design tokens declared in `@theme` in `apps/web/app/globals.css`, Radix through shadcn, React Query, zod, react-hook-form, date-fns, lucide-react for icons, `motion/react` for animation (never `framer-motion`).
- D19. UI style: a calm, dense workspace. *Superseded by D67 (2026-10-10):* the Quality app's look and layout — one sidebar on a grey canvas, the page in a floating white panel, Inter 13 px with Crimson Pro serif greetings, indigo primary. See `docs/DESIGN.md`.
- D20. shadcn is **scaffolding**. It will be replaced component by component from Figma via the Figma MCP. Feature code imports UI only from `@/components/ui/*` and `@/components/app/*`, never from a third-party UI package directly, so a redesign touches one folder. Once the owner provides Figma frames, **Figma (through the MCP) is the authoritative source for tokens and component styling.** Do not invent values that conflict with it.

---

## 3. About the reference document

`docs/reference/LP_Tool_How_It_Works.md` describes a different, existing internal tool that inspired this one. Use it to understand **mechanics and hard-won algorithms**: the order of pipeline steps, the fragment copy system, length budgets, the image-plan fix-ups, the finalize steps, the residue scoring, the Shopify editable-publish rules and limits.

Do **not** copy its architecture. It is a single Python process on the standard-library HTTP server, keeps jobs and OAuth state in memory, stores JSON files as primary data, inlines every image as a data URI, has no application auth, and runs one replica. Every one of those is deliberately reversed in this project (see D3, D8, D9, D10).

When `docs/BUILD_SPEC.md` and the reference document disagree, **`BUILD_SPEC.md` wins.** When the spec is silent and the reference has a detail, use the reference detail and say so in the Build Report.

---

## 4. Repository layout and useful paths

```
lp-platform/
├── CLAUDE.md                          ← this file
├── .claude/
│   └── skills/
│       ├── milestone-build/SKILL.md   ← the per-build protocol and report template
│       └── template-onboarding/SKILL.md ← onboarding a library or cloned template
├── docs/
│   ├── BUILD_SPEC.md                  ← what to build (source of truth)
│   ├── DECISIONS.md                   ← locked decisions + rationale
│   ├── MILESTONES.md                  ← ordered builds with acceptance criteria
│   ├── DESIGN.md                      ← UI style, tokens, Figma MCP process
│   ├── DEPENDENCIES.md                ← packages, services, env vars
│   ├── BUILD_LOG.md                   ← append-only log of completed builds
│   ├── schema/001_init.sql            ← schema draft (copy into supabase/migrations at B0.2)
│   ├── pipeline/graph_sketch.py       ← LangGraph sketch (port into the worker at B0.6)
│   └── reference/LP_Tool_How_It_Works.md ← reference only
├── apps/
│   └── web/                           ← Next.js app
│       ├── app/
│       │   ├── globals.css            ← Tailwind v4 @theme tokens (single token source in code)
│       │   ├── (auth)/                ← sign-in, sign-up, invite accept
│       │   ├── (app)/                 ← authenticated shell: rail + sidebar + main
│       │   │   ├── layout.tsx         ← AppShell
│       │   │   ├── home/
│       │   │   ├── pages/             ← builds list (grouped by status) and new-page wizard
│       │   │   │   ├── new/           ← create wizard
│       │   │   │   └── [buildId]/     ← review desk; /editor sub-route from M3
│       │   │   ├── templates/         ← library gallery (Library / Yours)
│       │   │   ├── brands/            ← brand list; [brandId] with tabs
│       │   │   ├── library/           ← all builds archive + ledger
│       │   │   ├── analytics/
│       │   │   └── settings/          ← org, members, integrations (Vercel, Shopify)
│       │   ├── (editor)/templates/[templateId]/ ← full-screen section editor (no workspace shell)
│       │   ├── preview/[buildId]/route.ts ← serves built HTML into a sandboxed iframe
│       │   └── api/                   ← thin route handlers that call the worker API
│       ├── components/
│       │   ├── ui/                    ← shadcn primitives (replaced from Figma later)
│       │   ├── app/                   ← app-level composites: AppShell, IconRail, Sidebar, GroupedList, ...
│       │   └── features/              ← feature components; import only from ui/ and app/
│       ├── lib/
│       │   ├── supabase/              ← browser and server clients
│       │   ├── api/                   ← typed client for the worker API
│       │   ├── queries/               ← React Query hooks
│       │   └── validators/            ← zod schemas
│       └── types/database.ts          ← generated from Supabase; never hand-edit
├── services/
│   └── worker/                        ← Python service
│       ├── app/
│       │   ├── main.py                ← FastAPI app (internal API)
│       │   ├── config.py              ← settings from env (pydantic-settings)
│       │   ├── db.py                  ← psycopg pool, transactions
│       │   ├── models/                ← Pydantic models mirroring the schema
│       │   ├── jobs/                  ← queue: claim, heartbeat, progress, retry
│       │   ├── pipeline/
│       │   │   ├── graph.py           ← StateGraph assembly
│       │   │   ├── state.py           ← BuildState
│       │   │   └── nodes/             ← one module per node
│       │   ├── engines/               ← pure HTML/text logic, no I/O: fragments, recolor, finalize, residue, ...
│       │   ├── providers/             ← anthropic.py, fal.py, vercel.py, shopify.py, storage.py, cost.py
│       │   ├── fetch/                 ← page fetching ladder (clone path, M2)
│       │   └── publish/               ← static export, Vercel, Shopify
│       ├── tests/
│       │   ├── fixtures/              ← sample HTML pages, brand profiles
│       │   └── golden/                ← expected outputs for engine tests
│       └── worker.py                  ← job loop entry point
├── templates/
│   └── library/<slug>/                ← curated owned templates: index.html, template.json, instructions.json
├── supabase/
│   ├── migrations/                    ← SQL migrations (schema source of truth)
│   └── seed.sql                       ← dev seed
└── scripts/                           ← dev scripts: gen-types, seed-library, smoke-build
```

Engines are pure functions (HTML in, HTML plus a stats dict out). All network and database access lives in nodes and providers. This keeps the hard logic unit-testable with fixtures and no mocks.

---

## 5. Commands (keep this section current)

Repo root: `~/lp-platform`. Toolchain: Node 24 LTS (`.nvmrc`), pnpm 10.33 (`packageManager`), Python 3.12 (`services/worker/.python-version`), uv.

```bash
# first time / after pulling dependency changes (repo root)
pnpm install                     # JS deps for the root and apps/web
pnpm worker:sync                 # = cd services/worker && uv sync

# everything (repo root)
pnpm dev                         # web (next dev, :3000) + worker API (uvicorn --reload, :8000) + job loop (watchfiles, restarts on code changes)
pnpm typecheck                   # web: next typegen && tsc --noEmit · worker: mypy (strict)
pnpm lint                        # web: eslint · token check · prettier --check · worker: ruff check + ruff format --check
pnpm lint:tokens                 # no raw colours / arbitrary Tailwind values outside components/ui (D38); no retired token names anywhere (D68)
pnpm test                        # web: vitest run · worker: pytest
pnpm format                      # prettier --write · ruff check --fix · ruff format

# shadcn components (run in apps/web). Radix base (D37). After adding, switch `from "cn"` to
# `from "@/lib/utils"` and remap any `bg-accent`/`text-accent-foreground` hover classes.
pnpm dlx shadcn@latest add <component>
# AffectUI (D48): pnpm dlx shadcn@latest add https://www.affectui.com/r/<name>.json, then read the
# file, map its --ui-* colour variables to tokens in app/globals.css, note "LP changes" in its
# header, and list it in THIRD_PARTY_NOTICES.md and DESIGN.md §5.4.

# web only
pnpm --filter web dev            # Next.js on :3000 (if :3000 is taken, Next silently picks another port)
pnpm --filter web typecheck
pnpm --filter web lint
pnpm --filter web test           # component tests opt into the DOM with a `// @vitest-environment jsdom` first line

# worker only
cd services/worker
uv sync
uv run uvicorn app.main:app --reload --port 8000   # internal API (GET /health)
uv run pytest -q
uv run ruff check . && uv run ruff format --check . && uv run mypy
uv run python worker.py                            # job loop on its own (Ctrl+C pauses running jobs; they resume on restart)
uv run python -m app.providers.smoke --org <uuid>  # ONE real Claude Haiku call (< $0.01) to check the key; owner's go only
uv run playwright install chromium                 # once per machine (brand fetch, M2 cloning, QA); ~300 MB
uv run python -m app.cli.seed_library [slug] [--no-thumbnails]
                                                   # load templates/library/* into storage + DB, upload assets/ to the
                                                   # public library-assets bucket, render thumbnails (= pnpm seed:library)
uv run python -m app.cli.import_template <url> <slug> --type <type> --name "<name>"
                                                   # import a live site as a draft library template (template-onboarding skill)
uv run python -m app.cli.smoke_build --email <you> --brand <name> [--product <name|handle>] [--template <slug>]
                                                   # build a test page; the job loop must be running (= pnpm smoke:build ...)
# Builds: LangGraph checkpoints live in the private `langgraph` schema, one thread per build; a
# restarted or retried build resumes after its last finished node. Page revisions go to the
# `builds` bucket and only working.html is kept once a build finishes.
# Worker tests use the local Supabase Postgres (skipped when it is down); services/worker/.env holds
# local keys (gitignored; recreate from .env.example + `supabase status`).

# database (needs Docker Desktop running)
pnpm db:start                    # supabase start --ignore-health-check (see note below)
pnpm db:stop                     # supabase stop (data is kept)
pnpm db:reset                    # re-apply migrations + seed (LOCAL ONLY; wipes local data, including accounts)
supabase migration up --local    # apply new migrations without wiping local data
supabase migration new <name> < /dev/null   # create an empty migration (without < /dev/null it waits for SQL on stdin)
pnpm test:db                     # pgTAP tests in supabase/tests (tenant isolation)
pnpm gen:types                   # regenerate apps/web/types/database.ts after schema changes
supabase status                  # local URLs and keys
# Local URLs: API http://127.0.0.1:54321 · Studio http://127.0.0.1:54323 · Mailpit (emails) http://127.0.0.1:54324
```

On the owner's 8 GB Intel Mac, Supabase services take 1–2 minutes to become healthy, longer than the CLI's health-check wait, so `db:start` skips the gate and `db reset` may print "container is not ready: unhealthy". Confirm with `docker ps` that all `supabase_*_lp-platform` containers show `(healthy)` before testing.

`apps/web/.env.local` holds the local Supabase URL and publishable key (gitignored). To recreate it, copy `apps/web/.env.example` and fill `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` from `supabase status`.

---

## 6. Coding rules

- TypeScript strict; no `any` without a comment explaining why. zod validates every boundary (forms, route handlers, worker responses).
- Python 3.12, type-hinted, `ruff` and `mypy` clean. Pydantic v2 for every structured value crossing a boundary.
- Every database table that holds tenant data has `org_id` and an RLS policy. The worker uses the service role and **must** filter by `org_id` explicitly in every query.
- Every paid call goes through `providers/` and records a `ledger_entries` row with the build, node, provider, model, tokens and cost.
- No secrets in the repo. Shopify credentials live in Supabase Vault, referenced by id.
- Long work is always a job. Route handlers never run a pipeline or an LLM call inline (the reference tool's synchronous "redraft" timed out; do not repeat it).
- Every destructive edit to a build (image replace, section remove, agent edit, recolor) takes a snapshot first so it can be undone.
- UI: no raw colour values or ad-hoc spacing in feature code. Use tokens. Icons from `lucide-react` only, except the Figma icons in `components/ui/lp-icons.tsx` (D69). Animation from `motion/react` only.
- Write tests alongside engines. Engines get fixture-based tests; nodes get tests with provider fakes.

---

## 7. Things to ask the owner rather than assume

- Any new paid service, or any change to a locked decision.
- Product names, copy and naming in the UI beyond placeholders.
- Visual design beyond `docs/DESIGN.md`. If a screen needs a layout the doc does not cover, propose it in words or a quick sketch and ask.
- Anything legal or compliance related on the clone path.
