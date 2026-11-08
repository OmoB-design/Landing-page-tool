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
*Split (owner, 2026-10-28): **B1.6a** removing a Shopify draft and Trash (D92); **B1.6b** Library, Analytics and per-brand AI budgets; **B1.6c** hardening (rate limits, empty and error states) and the end-to-end test.*
- Library archive, analytics roll-ups, notifications, soft delete/restore (7 days), empty states, error states, rate limits, e2e test.
- Per-brand monthly AI budget (BUILD_SPEC §6.5, D54).
- **Acceptance:** a new user can sign up, create a brand, build from a library template, edit, and publish to Vercel without help.
  *Checked by `pnpm e2e` (B1.6c, D94) up to Publish asking for Vercel; a real deploy needs a Vercel token, so that last step is checked by hand.*

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
- *Split (owner, 2026-11-04, D102):* **B2.4a** the competitors come in (the wizard's Competitors step, the competitor pull with ratings and reviews, `build_competitors`, the Competitors card, a starter shell); **B2.4b** the page goes out ("Our take" and the comparison table from the pulled data only, the trace check and comparison rules, the disclosures filled with the brand and date; D103); **B2.4c** the owner's designed ranking shell, onboarded when the Figma frames are ready; *deferred by the owner (2026-11-04) to the later to-do list, revisited with it.*

---

## M3 — Review and edit

- B3.1 Full editor: section rail, canvas editing, element popover, improve section/element. *Split (owner, 2026-11-04, D104):* **B3.1a** the editor (full screen; sections on the left, the page in the middle, typing on the page with autosave and one undo step per line, section move/duplicate/remove by the template's rules, Redo, Ask AI on the right starting as an Improve box that runs the section redraft); **B3.1b** the full AI composer (the old B3.4 moved up: a thread per page, plan then steps then result, image attachments, every change undoable; built from AffectUI's composer components, Antigravity and Claude chat studied for a design of its own). The element popover follows later, mostly as composer requests. *Split again (owner, 2026-11-04, D105):* **B3.1b** the editor reorganised around Lander, a floating composer modelled on Shopify's Sidekick (page first; Sections in a drawer; "Work with Lander" at the foot of the page; the panel that squeezes the page; each request runs today's redraft, with plan, steps, a change card and Undo; dictation; motion on DialKit); **B3.1c** Lander as an agent with the editor's tools, image attachments, stop, saved conversations. *Split (owner, 2026-11-04, D106):* **B3.1c** the agent (tool loop on Sonnet 5.5: lines, sections, colours, claims; one request one undo step; Stop; the conversation kept per page); **B3.1d** image attachments as context, Recents, thumbs on replies. *Rescoped (owner, 2026-11-04, D107):* **B3.1d** Lander styles what it sees (inspect, style, look; image attachments); **B3.1e** Recents (earlier conversations) and thumbs on replies. *Done 2026-11-05 (D108): Recents per page; Copy, thumbs up and down with quick reasons and a note.* **B3.1f** (owner, 2026-11-06, D114): a request's budget (30 rounds, $1, 5 minutes) instead of 8 rounds, Keep going, styling every element alike in one call, the page itself as a target; done 2026-11-06. **B3.1g** (owner, 2026-11-06, D118): a formatting toolbar on selected text (bold, italic, underline, strikethrough, link, colour, highlight, Word's text sizes, clear), applied to exactly the selection across lines, one undo step; Buddy's `format_text`; done 2026-11-06. **B3.1h** (owner, 2026-11-08, D136): Buddy turns his face to the Sections panel, gives a small shake when the bar is clicked into, and morphs into the recording signal while dictating (a stop disc in place of the red ring); done 2026-11-08. **B3.1i** (owner, 2026-11-08, D137): Buddy's lag fixed (transforms only), eyes tracking over Sections with an exact mirror, a smoother staged morph, "Listening…" shimmering, and dictation that keeps listening and says why when it can't; done 2026-11-08.
- B3.2 Image studio. *Split (owner, 2026-11-05, D109):* **B3.2a** the studio without AI (click an image: replace with a product photo, another image on the page or an upload; shape, fit, focus, alt text; the last five versions with restore; every change one undo step; Lander's `replace_image` and `adjust_image`); **B3.2b** AI images on fal (generate, AI edit with up to 3 product photos, "Match product everywhere"; Lander generates and edits), built in mock mode until the owner adds a fal key. *B3.2a done 2026-11-05.* *Split again (2026-11-05, D110):* **B3.2b** generate and edit (studio and Lander), done 2026-11-05 in mock mode; **B3.2c** "Match product everywhere" (a vision step choosing which images show a generic product, then an edit per image), shared with the build pipeline's product-matching step. *B3.2c done 2026-11-06 (D116), in mock mode until fal; the check runs in every build.*
- B3.3 Mobile optimise + QA screenshots + OG image. *Split (owner, 2026-11-05, D111):* **B3.3a** the preview check (screenshots at desktop and phone widths after every build and on Refresh) and the share image (the top of the page, written into exports and publishes), done 2026-11-05; **B3.3b** automatic phone rules and an automatic phone check in every build, with Fix for phone (Claude) on the review desk and in Lander, done 2026-11-05 (D112).
- B3.4 Edit agent chat. *Moved up as B3.1b (owner, 2026-11-04).*
- B3.5 Batch build (all templates for one product). *Done 2026-11-06 (D115): the wizard's "Build with every template", all-or-nothing starts within the hourly cap, and the batch screen.*
- B3.5c Builds panel frames. *Done 2026-11-08 (D132): each page in a batch's Builds panel is its build happening (the build page's illustration), the step it's on in words, and its steps a click away; the count chip reads "01/13" rolling up to "13/13 completed" (on the build page too).*
- B3.6 Client review link (BUILD_SPEC §11.4, D55). *Done 2026-11-06 (D119): Approve keeps the approved copy; the review desk's Client link (one link per page that follows re-approvals, 30 days, opens counted, Turn off); `/review/<token>` without sign-in, Desktop / Phone, scripts off.*

## M4 — Editable Shopify publish

- B4.1 Editor map tooling (backfill, validation). *Done 2026-11-06 (D120): the map from our markers (no AI), the dry run and its check, maps for every template saved, the template editor's Shopify editing card. B4.2 to write theme files through the store's Theme Access password (D121, proposed; no paid Shopify app).*
- B4.2 Emit files, size guards, two-batch upload, versioned draft pages. *Done 2026-11-06 (D121): through the store's Theme Access password with Shopify CLI; Settings → Connections takes the password; the published modal's Shopify row offers Editable sections or One block; tested on FourU (the owner's BRĒZ page: 15 sections, 113 texts, 18 pictures; 27 s). Found for B4.3: side-by-side and sticky layouts across sections.*
- B4.3 Parity simulator with retry and coarse fallback. *Done 2026-11-06 (D122): Shopify's render worked out locally and compared with the page at desktop, tablet and phone on every editable publish; shared wrappers made transparent, side-by-side parts kept together as one section with group blocks, then coarse; Check layout on the template editor's Shopify card and `app.cli.shopify_check`. Every template with sections matches.*
- B4.4 A section tree in the page editor, after Shopify's theme editor (study: `docs/reference/shopify-editor-study.md`). *Done 2026-11-07 (D123): sections open into their parts named as in Shopify; hover and picking shared between the tree and the page (first click picks, second types); a part's panel framed as Buddy's change card with its words to edit; Buddy pointed at one part (chip, panel, pill on the page).*
- B4.5 Speed pass. *Done 2026-11-07 (D124): the editor's changes and state read cut to the fewest round trips (one storage client kept open, the build and its rules in one read, the state from the page just written, no route rebuild in the editor); from the owner's Mac a hide went from 11.4 s to 2.0 s and reading the editor's state from 4.0 s to 0.55 s.*

## M5 — Hardening

From the state-machine audit (2026-11-07): the app behaves the same, but stops misbehaving when things fail or happen at once.

- B5.1 Publishing and the B4 regressions. *Done 2026-11-07 (D125): a publish sends only the approved version; a worker stopping isn't a failure; a publication always ends (trigger); Remove drafts for editable Shopify pages; the part panel and the review desk save against what they showed; the page and the tree stay in step; tokens tolerate 30 s of clock difference.*
- B5.2 Stuck states and background jobs. *Done 2026-11-07 (D126): unclaimed page jobs end after 15 minutes; a Buddy turn settles from its own job; approval waits for background picture, match and phone jobs; the picture spinner can't stick and pictures are made one at a time; a trashed product stays in Trash on import; pages from a trashed template keep working; double starts answer "already running".*
- B5.3 Direct database writes. *Done 2026-11-07 (D127): members write only what the app's forms write (add a brand, the Brand DNA and product forms, a template's name and description); everything else on brands, products, templates, sections, versions, assets, strategy and template files is the worker's.*
- B5.4 Screens that follow jobs. *Done 2026-11-07 (D128): one shared way of following a job by its id; a quick publish opens the live modal; "Take it down?" doesn't come back; "Fixed" only for a phone fix that worked; "Analysing…" ends with a failed analysis; the layout check survives tab switches and reloads; the floating bar keeps your words while Buddy works.* M5 Hardening complete.

## M6 — Team

- B6.1 Members and invites. *Done 2026-11-07 (D129): Settings → Members (roles, remove, leave; the last owner stays; owners make owners); invites by email and role as a link to copy (7 days, revocable); someone new signs up from the link straight into the workspace; someone with an account signs in and joins with the invited email.*
- B6.2 Account page. *Done 2026-11-07 (D130): Settings → Account: your name, your email (shown), a new password once the current one checks out (other devices signed out), the theme; people can change only their name and current workspace in their profile.*
- B6.3 Account and Members, reorganised. *Done 2026-11-08 (D131): Account as Quality's (name saved on leaving the field, the theme as three pictures of the app, Password in a modal); Members as one table with Search, a filter, Invite in a modal and each row's actions in a ⋯ menu.*
- B6.4 Theme and modal polish. *Done 2026-11-08 (D133): Light, Dark, System; on hover the lights come on in macOS's colours and a shimmer crosses the page; a 1.3 px blue edge; the frames inside redrawn; the dropdowns inside modals padded and lifted.*
- B6.5 Back to app and the resizable edit card. *Done 2026-11-08 (D134): Back to app returns to the last page outside Settings; the editor's edit card resizes from its top edge (remembered); settings headers without Jobs and Notifications; the Everyone filter and the modal fields matched to the menus.*
- B6.6 Settings speed. *Done 2026-11-08 (D135): measured live; the worker's membership check and the settings reads no longer open transactions (2 to 6 fewer database round trips per page, about 20 ms each); Back to app level with the header's title; the in-modal menu on the field's surface.*

## v3 — Someday

Blank-canvas block builder.
