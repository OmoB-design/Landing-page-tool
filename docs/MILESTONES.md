# MILESTONES.md — Ordered builds

Each milestone is broken into **builds** (B-numbers). One build = one plan → confirm → build → verify → Build Report → stop cycle (see `.claude/skills/milestone-build/SKILL.md`). Do them in order. A build may be split into smaller builds if the plan shows it is too big; propose the split in the plan.

"Owner actions" lists what Bolaji is expected to do in that build. The Build Report must still list every action explicitly, with exact steps.

---

## M0 — Spine

Goal: the shared foundation and one owned template building end to end in mock mode.

### B0.1 — Repository scaffold
- Monorepo with pnpm workspaces: `apps/web` (Next.js App Router, TS strict, Tailwind v4, ESLint, Prettier), `services/worker` (Python 3.12, uv, FastAPI, ruff, mypy, pytest).
- Move these handoff docs into `docs/`, `CLAUDE.md` to the root, skills into `.claude/skills/`.
- Root scripts: `dev`, `typecheck`, `lint`, `test`, `gen:types`.
- `.env.example` files for both apps listing every variable from DEPENDENCIES.md (no values).
- `docs/BUILD_LOG.md` created with the B0.1 entry.
- **Acceptance:** `pnpm dev` serves a placeholder page; `uv run pytest` passes an empty suite; typecheck and lint clean.
- **Owner actions:** install Node LTS, pnpm, Python 3.12, uv, Supabase CLI, Docker (for local Supabase); create a Git repo.

### B0.2 — Supabase, schema, auth
- Local Supabase; migration `001_init.sql` from `docs/schema/001_init.sql` (review and adjust; report changes).
- RLS policies; storage buckets (`library`, `templates`, `builds`, `assets`) with policies.
- Auth pages: sign up, sign in, magic link, sign out; first-org creation on sign-up.
- Generated types in `apps/web/types/database.ts`.
- **Acceptance:** sign up creates user + org + owner membership; a second user cannot read the first user's org rows (tested).
- **Owner actions:** create a Supabase cloud project (or confirm local-only for now); paste URL and keys into `.env.local`.

### B0.3 — App shell UI (shadcn starter)
- Install shadcn; build `AppShell`, `IconRail`, `Sidebar`, `TopBar`, `PageHeader` with tabs, `GroupedList` (group headers + rows + nested rows), `EmptyState`, `CountBadge`, per DESIGN.md.
- Routes stubbed: Home, Pages, Templates, Brands, Library, Analytics, Settings; org switcher; search box (non-functional placeholder); notifications bell (stub).
- Tokens in `globals.css` `@theme` from DESIGN.md.
- **Acceptance:** shell matches the reference layout (rail, sidebar, tabbed main, grouped list with sample data); light and dark themes; keyboard focus visible; responsive collapse of the sidebar under 1024 px.
- **Owner actions:** review the shell against the reference screenshot; note what to change in Figma later (no Figma needed yet).

### B0.4 — Worker, job queue, providers, progress
- FastAPI internal API with Supabase JWT verification and org membership check.
- Job loop: claim, heartbeat, reaper, dedupe, concurrency limits, typed `UserFacingError`.
- `job_events` progress; `GET /jobs/:id`; web polling hook `useJob(id)`; jobs tray in the UI.
- Providers: Anthropic, fal (with mock mode), storage, cost table, provider locks; ledger recording.
- A `noop_demo` job kind that emits 5 progress events, to prove the loop.
- **Acceptance:** start a demo job from the UI, watch real progress, see it finish, see a notification; restart the worker mid-job and see it resume or retry.
- **Owner actions:** create Anthropic and fal accounts/keys (keys only in `.env`); decide worker hosting (O6) or confirm local for now.

### B0.5 — Brand intake and product pull
- Brands list and Brand DNA editor (`/brands`, `/brands/[id]` tabs: Overview, Products, Pages, Brand DNA).
- `brand_autofetch` job (static + Playwright + AI), draft returned to the form, save on confirm.
- `product_pull` job (public Shopify JSON → JSON-LD → OG → h1), enrichment, images into `assets`.
- Product strategy cache: briefing (angle library can come in B1.3).
- **Acceptance:** paste a real brand URL → sensible draft (name, palette, fonts, logo, voice); pull a real Shopify product → price, images, USPs.
- **Owner actions:** supply 2–3 real brand URLs and product URLs to test with.

### B0.6 — Pipeline skeleton, one owned template, export
- Port `docs/pipeline/graph_sketch.py` into `services/worker/app/pipeline/`.
- Engines and nodes for the owned path: load_inputs, apply_section_layout, recolor, swap_logos, regenerate_variants, copy_rewrite (full fragment system), purge_terms, prepare_media_slots, image_pass (mock), finalize_common, product_fidelity (skipped in mock), compliance_scan, write_report.
- One hand-made fixture library template (simple advertorial) in `templates/library/`.
- `export` job: inline everything into `export/index.html`; download.
- Preview route serving `working.html` in a sandboxed iframe.
- **Acceptance:** run a mock build from a script and from a temporary button; preview shows recoloured, rewritten page with mock images; export downloads one self-contained HTML; ledger shows copy cost; node order logged; owned build skips every clone node.
- **Owner actions:** approve spending ~$0.10–0.50 on one real copy pass (images still mocked) if you want to see real copy.

---

## M1 — Owned path (shippable product)

### B1.1 — Template library and section editor
*Split (owner approved, 2026-10-09):* **B1.1a** library from the owner's live sites (importer, `library-assets`, thumbnails, gallery Library/Yours, Use template, preview, template picker on test builds); **B1.1b** the section editor, laid out like the owner's reference screenshot (full-screen; Content / Look / Details / Issues tabs; selected-section card with move, duplicate and remove; numbered section list; Desktop/Phone; click-to-select in the preview; undo/redo across 12 versions).
- `templates/library/` seeding script; library gallery; "Use template" creates an org template.
- Section editor: rail with drag reorder (`@dnd-kit`), remove, duplicate, rename; preview updates; template versions (12) with undo.
- **Owner actions:** design and hand over the first 3–5 library templates following the `template-onboarding` skill (HTML with `data-lp-*` attributes, `template.json`, `instructions.json`, thumbnail).

### B1.2 — Create wizard
- Seven-step wizard with real data, zod validation, URL state, real progress screen.
- Briefing call (cached), targeting composition.
- **Acceptance:** wizard creates a build job with the right payload; progress shows real node events; lands on the review desk.

### B1.3 — Real images and product fidelity
- fal text-to-image, edit compositing, headshots, product fidelity pass, provider locks, image versions.
- Angle library.
- **Owner actions:** approve a real-images build (~$1–3); review image quality.

### B1.4 — Review desk (basic)
- Banners, overview, copy panel with inline edit, proof frame click-to-edit, inks recolour, legal desk, status changes, snapshots/undo, redraft (as a job).
- Pages list grouped by status (Building / Needs review / Approved / Published), like the reference screenshot.

### B1.5 — Publish: export, Vercel, Shopify draft page
- Publish gate with override dialog.
- Vercel connection (token in Vault), per-brand project, READY polling, URL recorded.
- Shopify connection (custom app credentials → Vault, OAuth install/callback with DB state), Files CDN offload, draft page. *B1.5b (D90): the store owner's own Dev Dashboard app with the client credentials grant replaces the custom app and OAuth install; a free Shopify Partner account and a development store to test.*
- `publications` history on the build.
- **Owner actions:** Vercel token; a Shopify development store and custom app (exact steps in the Build Report).

### B1.6 — Library, analytics, notifications, hardening
- Library archive, analytics roll-ups, notifications, soft delete/restore (7 days), empty states, error states, rate limits, e2e test.
- Per-brand monthly AI budget (BUILD_SPEC §6.5, D54).
- **Acceptance:** a new user can sign up, create a brand, build from a library template, edit, and publish to Vercel without help.

---

## M2 — Clone path

### B2.1 — Fetch and clone
- Clone terms acceptance; `template_clone` job with the fetch ladder (proxy behind flag), validation, platform fingerprint, deterministic clone; paste-HTML alternative.

### B2.2 — Analysis
- Blueprint, section tagging, instructions draft, editor map (saved only on AI success); review screen for the user to confirm sections and instructions.

### B2.3 — Clone-only pipeline nodes
- strip_chrome, scrub_source_brand, scrub_scripts, rewrite_links, purge_foreign_assets, residue_scan; strict copy mode; residue gate.
- **Acceptance:** clone fixture builds with residue score 100 in tests; real clone shows a high score; publish blocked below threshold.
- **Owner actions:** supply 3 competitor URLs for testing; decide on proxy usage (D4).

### B2.4 — Top 5 ranking builder
- `top5_ranking` template type: four competitor URLs → competitor pulls with reviews → ranked page with the brand at #1 (BUILD_SPEC §8.7, D53).
- **Owner actions:** design the ranking shell template; confirm naming default and comparison wording rules.

---

## M3 — Review and edit

- B3.1 Full editor: section rail, canvas editing, element popover, improve section/element.
- B3.2 Image studio.
- B3.3 Mobile optimise + QA screenshots + OG image.
- B3.4 Edit agent chat.
- B3.5 Batch build (all templates for one product).
- B3.6 Client review link (BUILD_SPEC §11.4, D55).

## M4 — Editable Shopify publish

- B4.1 Editor map tooling (backfill, validation).
- B4.2 Emit files, size guards, two-batch upload, versioned draft pages.
- B4.3 Parity simulator with retry and coarse fallback.

## v3 — Someday

Blank-canvas block builder.
