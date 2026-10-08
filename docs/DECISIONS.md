# DECISIONS.md — Locked decisions

Each decision has an id, the decision, why, and what it rules out. Do not reopen a locked decision without asking the owner. When a new decision is made during a build, add it here with the next id and the date, and mention it in the Build Report.

Status values: **Locked** (agreed with the owner), **Default** (chosen by the spec author; the owner can change it at the build where it first matters — raise it in that build's plan).

---

## Product

**D1 — One platform, two origins, one pipeline.** Locked.
Templates carry `origin: owned | cloned`. The pipeline is shared; clone-only stages are conditional on `origin`.
*Why:* both paths need brand intake, copy, images, review and publish; only the source of the skeleton and the de-brand stages differ. Two pipelines would mean two codebases.
*Rules out:* separate products, separate build engines (the reference had two: `generate.generate` for seeds and `clonebuild.rebrand_into` for clones).

**D2 — Owned path = curated starter library + post-select section editing.** Locked.
The owner designs library templates. After picking one, users can reorder, remove and duplicate sections. No new section types.
*Why:* about 80 % of a builder's value for about 20 % of the effort. The owner is a designer; designed pages are his strength.
*Rules out:* blank-canvas block builder in v1 (deferred to v3).

**D3 — Multi-tenant from day one.** Locked.
Orgs, members, RLS on every tenant table, explicit `org_id` filtering in the worker.
*Why:* users select templates and clone pages; their brand data and cloned templates must never leak across tenants. Retrofitting tenancy is expensive.
*Rules out:* the reference's "no app auth, edge gate only" model.

**D4 — Clone-path legal controls are enforced gates.** Locked.
Residue threshold and compliance scan block publish (override allowed, logged). Proxied fetch is a flag, off by default. One-time clone terms acceptance per org.
*Why:* nearly all legal exposure sits on the clone path: copyright in surviving text/images, trademark/trade dress, unfair competition, terms-of-service breaches when evading bot protection, and false advertising from borrowed claims. The owner was advised to get legal counsel before operating the clone path commercially. These controls reduce, not remove, the risk.
*Rules out:* clone features that bypass the gates.

**D5 — Milestone order M0 → M1 → M2 → M3 → M4.** Locked.
*Why:* M1 is a complete, legally clean product; it proves the shared pipeline before the hard, gray-area half is added.

## Architecture

**D6 — Monorepo: Next.js web + Python worker.** Default.
*Why:* the pipeline needs Python (BeautifulSoup/lxml, Playwright, LangGraph, Pillow); the UI is Next.js, the owner's usual stack.

**D7 — Pipeline as a LangGraph StateGraph with conditional edges.** Locked.
*Why:* makes the fork visible; per-node retries, cost and progress; resume after crash with a Postgres checkpointer. The owner already works in the LangChain/LangGraph ecosystem.
*Rules out:* a long imperative function; n8n or any external workflow tool for the pipeline.

**D8 — Postgres primary; assets in object storage; inlined page is an export.** Locked.
*Why:* the reference's inlined data-URI pages were 2 MB+ and slowed every edit.

**D9 — No meaningful state in process memory.** Locked.
*Why:* the reference lost jobs on restart, could not run a second replica, and broke OAuth callbacks across restarts.

**D10 — Postgres-backed job queue (no Redis in v1).** Default.
*Why:* one less service; `FOR UPDATE SKIP LOCKED` is robust at this scale; jobs are already rows the UI reads.
*Revisit if:* throughput needs exceed a few hundred jobs per minute.

**D11 — Polling for progress in v1.** Default.
*Why:* simplest reliable option; React Query makes it trivial. Supabase Realtime can replace it later without schema changes.

**D12 — Supabase for Postgres, Auth, Storage, Vault.** Default.
*Why:* one managed service covers four needs; RLS integrates with Auth; Vault suits per-store Shopify credentials.
*Owner action:* create the Supabase project when B0.2 asks.

**D13 — One provider interface per vendor, one pricing table, every call recorded.** Locked.
*Why:* the reference duplicated pricing tables and skipped recording several calls.

**D14 — Model names in configuration.** Locked.
Defaults: copy, vision, analysis, agent, mobile → `claude-sonnet-5-5`; cheap helper calls (persona, short classifications) → `claude-haiku-5-5` (changed from `claude-haiku-4-5-20251001` by D42). Images: fal `fal-ai/nano-banana-pro` (text-to-image) and `fal-ai/nano-banana-pro/edit` (edits), as in the reference. All overridable by env.
*Note to Claude Code:* verify the current model ids against provider docs at B0.4 and record what you used.

**D15 — Mock mode default in dev and tests.** Locked.
*Why:* a real build costs about $1–3; iterating on UI must cost nothing. Mock builds cannot be published.

**D16 — Official SDKs.** Default. Anthropic Python SDK, fal client. *Why:* retries, types, streaming for free.

**D17 — No n8n.** Locked.
*Why:* the pipeline is the product's hot path (stateful, large payloads, Playwright, per-node cost). Peripheral glue (notifications, digests, cleanups) is a few lines in the worker. Revisit only if a specific external SaaS integration becomes painful to maintain in code.

## Frontend

**D18 — Stack.** Locked. Next.js App Router, TypeScript strict, Tailwind v4 (`@theme` tokens in `globals.css`), shadcn (Radix), React Query, zod, react-hook-form, date-fns, lucide-react, `motion/react` (never `framer-motion`), `@dnd-kit` for drag and drop, `sonner` for toasts.

**D19 — UI style: Notion-like workspace.** Locked. See DESIGN.md.

**D20 — shadcn is scaffolding; Figma replaces it via the Figma MCP.** Locked.
Feature code imports only from `@/components/ui` and `@/components/app`. Once frames exist, Figma is authoritative for tokens and components.

## Pipeline behaviour (carried from the reference, with changes)

**D21 — Strip chrome before the image pass (clones).** Locked. Never pay for an image inside a header or footer that is about to be deleted.

**D22 — Failed scene or person images are dropped, never replaced with a packshot.** Locked.

**D23 — A failed copy chunk keeps its source text and blocks publish; it never fails the build.** Locked.

**D24 — Analysis results (blueprint, editor map) are saved only when the AI call succeeded.** Locked. A heuristic fallback is never frozen into a template.

**D25 — Vercel: one project per brand, wait for READY, record URL.** Default. (Reference: one project per build, nothing recorded.)

**D26 — Shopify scopes include `write_files` and `read_products`.** Default. Verify against Shopify docs at the build that implements it.

**D27 — Build human keys `<PREFIX>-<n>` per brand.** Default. Mirrors the work-item ids in the reference UI screenshot (e.g. `LUM-12`).

**D28 — Residue publish threshold 85.** Default. Configurable via `LP_RESIDUE_MIN_SCORE`.

## Made during builds

**D29 — Repository root is `~/lp-platform`.** Locked (owner approved B0.1 plan, 2026-10-07).
*Why:* the handoff's suggested name; a path without spaces avoids quoting problems in shell scripts, venv shebangs and CLIs. The original handoff folder (`~/Landing Page tool/`) is left untouched.

**D30 — TypeScript pinned to 6.0.x (`~6.0.3`).** Default (B0.1, 2026-10-07).
*Why:* the latest TypeScript (7.0.2) is outside the peer range of `typescript-eslint` 8.71 (`>=4.8.4 <6.1.0`), which `eslint-config-next` depends on. *Revisit when:* `typescript-eslint` supports TypeScript 7.

**D31 — `LP_MOCK_LLM=1` is the development default.** Locked (owner approved B0.1 plan, 2026-10-07).
*Why:* with `LP_MOCK_LLM=0` and an Anthropic key in `.env`, any "mock" build would make real paid Claude calls, which conflicts with the standing rule that no live paid API is called without the owner's explicit go. The fake LLM writes ledger rows at $0. Real calls need `LP_MOCK_LLM=0` set explicitly, with the owner's go.

**D32 — Supabase publishable/secret API keys.** Locked (owner approved B0.2 plan, 2026-10-07).
The web app uses `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; the worker uses `SUPABASE_SECRET_KEY`. Replaces the legacy anon/service_role key names in the original DEPENDENCIES.md.
*Why:* Supabase's current key model; the keys can be rotated independently of the JWT signing key.

**D33 — Org feature flags and clone-terms acceptance are platform-controlled.** Locked (B0.2, 2026-10-07).
Tenants, including org owners and admins, can only update `orgs.name` and `orgs.slug` (column-level grants). `orgs.settings` (`clone_enabled`, `proxy_fetch_enabled`, `ai_images_enabled`) and `clone_terms_accepted_*` are written by the worker / service role only. Clone-terms acceptance will go through a worker endpoint or a security-definer function at M2.
*Why:* `proxy_fetch_enabled` turns on bot-wall evasion, which carries platform-level legal exposure (D4); a tenant admin must not be able to switch it on.

**D34 — Invites deferred to the members build (B1.6).** Default (B0.2, 2026-10-07).
No invites table or invite-accept route yet. When added, invited sign-ups must skip the personal-org trigger.

**D35 — Auth forms are server actions validated with zod; react-hook-form arrives with shadcn.** Default (B0.2, 2026-10-07).
*Why:* the B0.2 forms are temporary plain HTML until B0.3 brings the shadcn Form components, which wrap react-hook-form.

**D36 — Layout tokens live in Tailwind's spacing namespace.** Locked (owner approved B0.3 plan, 2026-10-08).
`--size-rail` etc. from DESIGN.md became `--spacing-rail`, `--spacing-sidebar`, `--spacing-topbar`, `--spacing-row`, `--spacing-nav-item` (utilities `w-rail`, `h-row` …).
*Why:* Tailwind v4 generates no utilities from `--size-*`, which would have forced arbitrary values in feature code.

**D37 — shadcn on Radix, preset Nova; `accent` keeps its DESIGN meaning.** Locked (B0.3, 2026-10-08).
shadcn 4.x defaults to Base UI; we pass `--base radix` (D18). Its variables are mapped onto DESIGN tokens in `globals.css`. Where shadcn's grey hover "accent" collides with DESIGN's blue `accent`, DESIGN wins and `components/ui` hover classes use `surface-hover`. Components import `cn` from `@/lib/utils` (token-aware), not the bare `cn` package.

**D38 — Icons only through `components/ui/icons`; tokens enforced by a check.** Locked (B0.3, 2026-10-08).
ESLint forbids `lucide-react` outside `components/ui` and `components/app`; `pnpm lint:tokens` (`scripts/check-tokens.sh`) fails on raw colours or arbitrary Tailwind values in `app/`, `components/app` and `components/features`.

**D39 — Theme and sidebar state are per-browser and applied before paint.** Locked (B0.3, 2026-10-08).
Theme (light/dark/system, default system) in `localStorage`; sidebar collapse in the `lp_sidebar` cookie (DESIGN.md §5.2). An inline script in the root layout applies both before first paint (Next's "preventing flash before hydration" pattern), so no theme package and no request-time cookie read, which would make every page dynamic.

**D40 — Forms: react-hook-form + shadcn Field in front of server actions, one zod schema.** Default (B0.3b, 2026-10-08). Supersedes the "until shadcn" part of D35.
`useActionForm` (`apps/web/lib/forms/use-action-form.ts`) validates in the browser with the server action's own zod schema, then posts the form to the action as FormData; without JavaScript the form posts natively and the action validates on the server. Fields use shadcn's `Field` components (shadcn 4.x's successor to its `Form` wrapper). Supabase Auth errors are mapped to plain messages by code (`lib/auth/errors.ts`); raw messages such as "fetch failed" are logged on the server, never shown.
*Why:* one schema on both sides; immediate feedback; progressive enhancement kept.

**D41 — Residue score chip bands.** Default (B0.3b, 2026-10-08).
Green at or above the publish threshold (D28, 85), amber up to 15 points below it, red beneath. Shown next to cloned pages in lists.
*Why:* the spec says green/amber/red by score but gives no amber band; this ties the bands to the gate.

**D42 — Cheap helper calls default to Claude Haiku 5.5.** Locked (owner approved B0.4 plan, 2026-10-08). Updates D14's default.
`LP_MODEL_FAST` defaults to `claude-haiku-5-5` (was `claude-haiku-4-5-20251001`). Copy, vision, analysis, agent and mobile stay on `claude-sonnet-5-5`. Model ids and prices checked at B0.4 against Anthropic's current model table (2026-10-06): Sonnet 5.5 $2 / $10 per million input/output tokens; Haiku 5.5 $0.10 / $0.50 (prompts up to 100K tokens).
*Why:* newer and about 10× cheaper than Haiku 4.5 for persona and short classification calls.

**D43 — The worker verifies user JWTs with Supabase's JWKS.** Locked (B0.4, 2026-10-08).
Supabase signs access tokens with asymmetric keys (ES256); the worker checks them against `<SUPABASE_URL>/auth/v1/.well-known/jwks.json` (PyJWT), including audience `authenticated`, issuer and expiry, then checks `org_members` for the requested org. `SUPABASE_JWT_SECRET` is dropped.
*Why:* no shared secret to distribute or rotate; matches how the web app's `getClaims()` verifies.

**D44 — Storage over HTTP, Vault over SQL.** Locked (B0.4, 2026-10-08).
The worker talks to Supabase Storage through its REST API with `httpx` and the secret key, and to Vault through SQL on `DATABASE_URL`. The `supabase` Python package is not used.
*Why:* fewer dependencies; both paths are small and testable.

**D45 — Server-side refusal fallback on by default for Claude calls.** Locked (owner approved B0.4 plan, 2026-10-08).
Requests to models that support it (e.g. Claude Sonnet 5.5) send the server-side `fallbacks` option, so a safety decline is re-run on a fallback model inside the same call. The model that actually served the request and its cost are what the ledger records. The final response's `stop_reason` is still checked: a refusal from the whole chain is a copy error, not a crash.
*Why:* a declined copy chunk would otherwise keep source text and block publish (D23); the fallback rescues most of those.

**D46 — Workers claim only the job kinds they can run; stopped workers hand jobs back.** Default (B0.4a, 2026-10-08).
`claim` filters on the worker's registered kinds, so specialised workers (e.g. Playwright-only) can share one queue later. On SIGINT/SIGTERM a worker stops claiming, and running jobs pause at their next progress step and return to the queue without using an attempt; a killed worker's jobs are requeued by any worker's reaper once their heartbeat is 90 s old. Handlers can read their last reported progress (`ctx.last_progress`) to resume instead of starting over; `noop_demo` does.
*Why:* restarts (deploys, `pnpm dev` reloads) must not lose or duplicate work (D9).

**D47 — Costs keep six decimal places; provider calls must run inside a cost context.** Locked (B0.4b, 2026-10-08).
`ledger_entries.cost_usd` and `builds.cost_usd` are `numeric(12,6)` (migration `20261008123003`), because `numeric(10,4)` stored a Claude Haiku 5.5 call ($0.000008) as $0. Every provider call raises unless it runs inside `cost_context()` (set by the job runner; pipeline nodes add `node_context()`), so no paid call can go unrecorded. The demo job and the UI only ever use mock providers; the one live check is a CLI run on purpose (`python -m app.providers.smoke`).
*Why:* D13 requires every call recorded; rounding small calls to zero under-reports spend.

**D48 — AffectUI joins shadcn as a component source.** Locked (owner approved B0.4c plan, 2026-10-08).
Free (MIT) components from AffectUI (https://www.affectui.com) are added with the shadcn CLI into `components/ui/`, like shadcn scaffolding: Figma replaces them later (D20). Their colour variables, radii and font are mapped onto the design tokens in `app/globals.css` (`:root .ui-*` blocks), so light/dark and future token changes apply; their own motion is kept (DESIGN.md §6). Each file's header says where it came from and lists any "LP changes"; the licence is in `THIRD_PARTY_NOTICES.md`. Components are installed when a build needs them (DESIGN.md §5.4 has the map). Not used: `email-draft`, `reaction-bar`, AffectUI `button` (would replace the app-wide button), and the illustration blocks (marketing graphics, some with third-party logos).
*Why:* the owner wants AffectUI's calm, finished components wherever the product needs them; vendoring keeps us independent of the young upstream project.

**O6 resolved — Worker runs locally for now.** Locked (owner approved B0.4 plan, 2026-10-08). Choose a host (needs Playwright Chromium) before the first deploy.

## Open (ask the owner when the related build starts)

- O1 — Product name and logo (placeholder "LP Platform" until then).
- O2 — Clone-path terms text (placeholder until legal review).
- O3 — Which library templates ship first, and their HTML (owner designs; see `template-onboarding` skill).
- O4 — Billing/plans: out of scope for v1 unless the owner adds it.
- O5 — Whether "doctor/expert" author type is allowed at all, and how bylines are labelled.
- O6 — Hosting for the worker (Railway, Fly.io, Render, or a VM). Needs Chromium. *Local for now (see above); decide before the first deploy.*
