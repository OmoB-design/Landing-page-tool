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

**D19 — UI style: Notion-like workspace.** Superseded by D67 (2026-10-10). See DESIGN.md.

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

**D49 — Outbound fetching rules.** Locked (owner approved B0.5 plan, 2026-10-08).
Every user-supplied URL (and each redirect, every request a page makes in the browser, and every logo/image download) passes an SSRF guard: http(s) only, ports 80/443, and the host must resolve to public addresses only (no localhost, private ranges or cloud metadata). The fetch ladder is a plain GET (Chrome user agent, no Accept-Language), one retry on 403/429 after Retry-After capped at 8 s, then Playwright Chromium. Bot-wall markers count only in the page title or on pages under 5,000 bytes (Shopify ships `data-nocaptcha`). At most one browser runs per worker process (8 GB machine).
*Why:* the worker fetches whatever URL a user types; without the guard it could be pointed at internal services.

**D50 — Brand save flow.** Default (B0.5a, 2026-10-08).
`brand_autofetch` returns a draft only; the web app saves the brand directly under RLS (BUILD_SPEC §4, simple CRUD), then queues `brand_assets` to download the logo and favicon into `assets`, so abandoned drafts store nothing. Inline SVG logos are stored as SVG with their camelCase names restored (HTML parsers lowercase `viewBox`). The brand mark defaults to the brand's initial on its primary colour; the emoji is optional.

**D51 — Motion follows the emil-design-eng skill.** Locked (owner asked to apply it, 2026-10-08). Amends D48's "their own motion is kept".
The `emil-design-eng` skill (Emil Kowalski, MIT, installed in `.claude/skills/`) is the motion standard: strong custom curves as tokens (`--ease-out`, `--ease-in-out`, `--ease-drawer`), product-UI animation at 300 ms or less, exits faster than entrances, presses scale to 0.97, origin-aware popovers, delayed-then-instant tooltips, no animation on frequent or keyboard-driven toggles, only `transform` and `opacity` animated, and gentler (not no) motion under reduced-motion. AffectUI components keep their structure but use our curve and shortened timings. Rules in DESIGN.md §6.
*Why:* the owner wants the product to feel fast and deliberate; long, decorative motion in a tool used all day reads as slow.

**D52 — Product pull and briefing.** Default (B0.5b, 2026-10-09).
`product_pull` saves straight to the brand's products (the plan approved this; no draft step): one row per brand and handle, so adding the same product again, or **Pull again**, replaces the pulled details (including hand edits, which the confirm says) and brings back a removed product. Sources, best first: Shopify `/products/<handle>.json` (+ selling plans from `.js`), the `/products.json` catalogue matched by handle, then the page's JSON-LD `Product`, Open Graph tags, `<h1>` (a heading-only pull warns). `price` is the regular price and `sale_price` is set only when the compare-at price is higher; currency is the store's own (no Accept-Language). Up to 8 images are stored (Shopify CDN images at most 2048 px wide). Removing a product is a soft delete. The briefing is written on demand per product and refreshable. Paid jobs (`product_pull`, `product_briefing`) are deduplicated while one is queued or running, so a double click never pays twice.
*Why:* products are reference data the user tidies once; a review step would add a screen without adding safety, and re-pulling stays explicit.

**D53 — Top 5 ranking builder.** Locked (owner approved, 2026-10-09).
The previous tool's guided "Top 5" page joins the plan as B2.4: the brand ranked #1 on a neutral publisher page, ranks #2 to #5 filled from four competitor product URLs, with critiques that quote the competitors' own claims and reviews. Competitor pages go through the product pull ladder. Spec: BUILD_SPEC §8.7.
*Why:* it was one of the previous tool's working funnels, and the product pull already does most of the competitor reading.

**D54 — Per-brand monthly AI budget.** Locked (owner approved, 2026-10-09).
Each brand can have a monthly AI spending cap, enforced before paid calls using the ledger, with notices at 80 % and 100 %. Built in B1.6. Spec: BUILD_SPEC §6.5.
*Why:* agencies run many brands; a cap stops one brand's builds running up costs unnoticed.

**D55 — Client review link.** Locked (owner approved, 2026-10-09).
Approving a page unlocks a read-only, revocable, expiring link to the approved version for the client. Built in M3 (B3.6). Spec: BUILD_SPEC §11.4.
*Why:* clients review pages without accounts, and what they see is exactly the approved version.

**D56 — Pipeline checkpoints and page revisions.** Locked (owner approved B0.6 plan, 2026-10-09).
Each build is one LangGraph thread (`thread_id` = build id), checkpointed in Postgres after every node (`durability="sync"`) in a private `langgraph` schema that the browser API can't reach. Each node writes a new page revision to the `builds` bucket and puts its path in state, so a node re-run after a crash starts from the previous revision and never applies its change twice. A worker that is told to stop finishes recording the current node and stops at the next one; the job resumes from there. When a build finishes, its revisions and its checkpoint thread are deleted and only `working.html` stays. A `build` job that ends failed or cancelled marks its build failed (jobs trigger).
*Why:* builds are the long, paid work; resuming instead of restarting saves money and time, and keeping only the final page keeps storage small.

**D57 — Builds are created by the worker.** Locked (owner approved B0.6 plan, 2026-10-09).
`POST /builds` (worker) checks the template, brand and product belong to the org, allocates the build key and creates the build and its `build` job in one transaction; the web app calls it from a server action. Until the wizard (B1.2) and org template copies (B1.1) exist, test builds use the library template directly (`builds.template_id` points at it). The temporary "Build a test page" button on the product page uses the `advertorial-fixture` test template.
*Why:* only the worker may allocate keys (D27), and a build must never exist without its job.

**D58 — Markup contract additions.** Default (B0.6a, 2026-10-09).
Library templates may mark `data-lp-brand`, `data-lp-product-name`, `data-lp-compare-price`, `data-lp-usps` / `data-lp-usp-text`, `data-lp-promo`, `data-lp-sale-percent` and the variant unit parts (`data-lp-variant`, `-name`, `-price`, `-image`), and declare `--lp-on-primary`, `--lp-on-accent`, `--lp-on-dark` for text on brand colours. `data-lp-price` is the price paid now; the regular price shows only when on sale. A discount label or discount promo is removed for a brand with no sale. Sections reorder only within their container. Details in the template-onboarding skill.
*Why:* deterministic slots make the result predictable before (and after) the AI copy pass, and never show a discount the brand doesn't offer.

**D59 — Copy pass and export details.** Default (B0.6b, 2026-10-09).
The copy pass never touches slots the pipeline fills from data (brand and product names, prices, sale labels, variant parts, selling points when the product has some, a promo line that will be replaced or removed) or text marked `data-lp-lock`; brand and product names are filled in before the pass so the model reads sentences as they will appear. Replies use structured output (`{replacements: [{id, text}]}`), and complete pairs are salvaged from a cut-off reply. On owned templates an empty replacement keeps the original (only clones may delete navigation or UI text). Mock mode marks sentences with `[mock]` instead of rewriting them, at no cost. The export inlines only the org's own stored assets (images, icons, CSS `url()`s, linked stylesheets), keeps share-image metas as absolute URLs, and strips every `data-lp-*` marker.
*Why:* deterministic slots must stay exact; a model must never be able to delete a library template's copy by returning nothing; exports must not leak other orgs' assets.

**D60 — Testimonials are rewritten by the copy pass, with no label.** Locked (owner decision, 2026-10-09).
Testimonial sections are rewritten like any other copy, and the report and pages do not label them as AI-written. Real customer reviews will be pulled from product pages in a later build (alongside the review pull for the Top 5 builder, D53).
*Why:* the owner's call for now; real reviews come later.

**D61 — Two ways to hand over a library template: Figma or a live website.** Locked (owner, B1.1 plan, 2026-10-09).
Figma frames are read through the Figma MCP (read-only; no Figma files are created) and built as plain HTML. A live website is imported with `app.cli.import_template <url> <slug>`, which drops scripts that track or need jQuery/Webflow, prunes unused CSS, pulls embedded and linked images into `assets/` (photos over 250 KB become JPEGs at most 1600 px wide), drops bundled commercial fonts and links free stand-ins (Gilroy → Figtree, Circular → DM Sans, Interdisplay → Inter; free families from Google Fonts), and writes draft `template.json` / `instructions.json`. The section and slot markup is then finished by hand. Imported sites the owner made are owned templates: every image becomes a slot, the source brand names go in `forbidden_terms`, and small timers (the midnight countdown) stay and are noted in `instructions.notes`.
*Why:* the owner's first templates already exist as live sites made from the previous tool; importing them is faster and truer to the design than rebuilding them.

**D62 — Library template images live in a public `library-assets` bucket.** Default (B1.1a, 2026-10-09).
The seed script uploads a library template's `assets/*` to `library-assets/<slug>/` and points the HTML at their public URLs. Thumbnails stay in the private `library` bucket (a `thumb.png` in the folder, or an 800x600 JPEG the seed script renders with Playwright) and reach the gallery through an authenticated route. Exports inline `library-assets` images like org assets. A template's `status: "retired"` hides it from the gallery; builds made from it keep working (the B0.6 test template is retired).
*Why:* library images are the same for every org and not secret; public URLs keep previews fast and the HTML small, and exports stay self-contained.

**D63 — "Use template" copies are made by the worker.** Default (B1.1a, 2026-10-09).
`POST /templates/use` (worker) copies a library template into the org: the HTML to `templates/<org>/<id>/v1.html`, a template row (`parent_template_id`, version 1, slug made unique as `<slug>-2`, `-3`…), its section rows, and template version 1 ("Copied from the library"), in one transaction. Test builds can start from library templates or the org's own copies; Delete is a soft delete.
*Why:* like builds (D57), anything that writes several rows and files together runs in one place, with the service role, checked against the org.

**D64 — Markup contract additions: numbered items and sale-only blocks.** Default (B1.1a, 2026-10-09).
`data-lp-number` marks an item number (a listicle's "1"…"10", or "01"); after sections are reordered, removed or duplicated, numbered sections count up in page order, keeping zero-padding. `data-lp-alternate="<class>"` on a container gives every other numbered section that class (photos on alternating sides). `data-lp-sale-only` marks an element that is removed when the brand has no sale (a sale bar).
*B1.1b addition:* `data-lp-fixed` marks page frame left outside sections on purpose (a reading progress bar, a desktop side rail); the editor's Issues tab doesn't flag it.
*Why:* the section editor (B1.1b) reorders and duplicates sections, so numbering and alternation must follow automatically; a sale bar with no sale reads broken.

**D65 — Section editor rules.** Default (B1.1b, 2026-10-09).
The editor (`/templates/[id]`, full screen) edits only the org's own templates. Each edit (reorder, remove, duplicate, rename) is a worker call that rewrites the section rows and the page HTML and saves a new version; the call carries the version the editor showed, and a different current version is refused (409, "changed in another tab… reload"). `templates.version` points at the current version: Undo and Redo move it to the previous or next kept version; a new edit after an undo discards the redo history; Restore saves an earlier version again as a new one. Version numbers are never reused, the newest 12 are kept, and page files no kept version uses are deleted (rename and restore reuse the existing file). Sections only move within the element that holds them (the UI disables those moves; the worker refuses them). A duplicate gets the key `<key>-<n>` and the label "<label> (copy)", and can always be removed. A template's words are read-only in the editor (owner, B1.1 plan: they are rewritten for every build); its name and description can be changed (not versioned). The editor's preview runs one small bridge script of ours, allowed by a nonce, for outlines and click-to-select; the template's own scripts stay blocked.
*Why:* builds read the current rows and HTML directly, so the template is always in a buildable state; the version check stops two tabs silently overwriting each other; never reusing numbers keeps "built from version N" unambiguous.

**D66 — Create wizard rules.** Locked (owner approved B1.2 plan, 2026-10-09).
`/pages/new` has a step bar across the top, the step with the brand dossier beside it, and Back / Next (Build page on the last step) along the bottom (owner's choice after first trying the reference tool's left-hand step list, 2026-10-09). Every choice lives in the URL (a refresh or a shared link keeps it; step changes add a browser history entry), and a step opens only when the steps before it are ready. Library templates are built from directly: no copy is made in Yours (this replaces BUILD_SPEC §8.3.5's implicit copy). When a product has no briefing, the product_briefing job starts as soon as the product is chosen. Build page hands over to the build page, which shows the live steps and then the report (the spec's "Run" step). The worker stores the wizard payload and a `targeting` record (audience, gender, age, emphasis, author, image preferences, the copywriter's targeting block) on the build. Author types: article writer, customer, influencer and expert. The expert is a voice only: the copy is told never to state or imply credentials, and the claims check flags credentials (high) and adds an "Author: expert" note (low). The temporary "Build a test page" buttons are replaced by links into the wizard (product page: product chosen; template editor: template chosen).
*Why:* one path to a page; the URL keeps long choices safe; building straight from the library avoids filling Yours with copies nobody arranged; an invented expert with a credential would be a false claim.

**D67 — The app takes the Quality app's look and layout.** Locked (owner, 2026-10-10). Replaces D19's Notion-like style.
Layout: one sidebar on a light grey canvas (workspace menu and collapse; Home, New page, Search, Notifications and Jobs; Workspace and Your brands groups; Settings and the account at the bottom) and the page in a floating white panel with a 48 px text header (13 px regular title; sizes measured from the owner's screenshots); no icon rail or top bar. Look: Quality's public design tokens — Inter at 13 px for the interface, Crimson Pro serif for greetings and big titles, its grey scale (including `#8d8d8d` secondary text, the owner's choice over a darker accessible grey), an indigo primary (`#5c5aed`), 6 px controls and 10 px panels and cards, its soft shadow on outline buttons and inner edge on primary buttons, and its dark values. Workspace and people marks use its eight mark colours. Home opens with a serif welcome and three getting-started cards. Quality is not the owner's product: its look and layout are matched, but not its name, logo, wording, artwork or code. D20 still holds: Figma frames, when provided, become the source for tokens and components.
*Why:* the owner prefers this look for the dashboard.

**D68 — Token names come from the owner's Portfolio file; values stay D67's.** Locked (owner, 2026-10-10).
The LP Platform Figma file (`WJylkbnRxmt6QfEXWQ2m2h`) is where the owner designs. Its variables follow the structure and names of the owner's Portfolio file (`slaqL0U0LTOJL95Nw1856Y`): a single-mode **Primitives** collection (`Family/Family N`: Base, Grey, Indigo, Green, Yellow, Red, Amber, Blue, Pink, Purple, Mark, Glyph, Numbers) and a **Tokens** collection with modes **Light** and **Dark** (Portfolio's Brown mode is left out) grouped as Surface, Button, Spot, Highlights, Typography, Icon, Space, Radius, plus groups LP needs (Avatar, Template, Size). Values are Quality's full token set, read from its stylesheet (`usequality.app/assets/index-BGHD8ka6.css`, its `--Backgrounds-*`, `--Text-*`, `--Border-*`, `--Icon-*`, `--Button-*` and `--Tags-*` tokens) in light and dark; this corrects D67, which matched light mode but not all of dark mode (menus `#212121`, pressed `#595959`, dividers `#2a2a2a`, selected and status tints, secondary icons `#8d8d8d`) and lacked some tokens. Portfolio tokens with no Quality counterpart keep Portfolio values. New tokens: Foreground-03, Stroke-Strong, Stroke-Input-Hover/Active/Negative, Button-Danger-Active, Button-Neutral(-Active), Spot-500-Indigo, Highlight-Indigo-50, Text-Success/Warning/Danger/Info/Link, On-Light/On-Dark, Avatar-* (8 colours, 8 tints), Template-*, Size/*. Each variable's Web code syntax is its CSS variable (`var(--color-surface-primary)`, primitives `var(--grey-850)`), so code follows Figma name for name. Text styles keep Portfolio's Heading/Body/Caption structure with the app's sizes and fonts (Inter; Crimson Pro for H3); the four shadows are effect styles. Built in T1 (Figma); T2 renames the code to match.
*Why:* the owner designs in Figma with their own naming system; one set of names in Figma and code removes translation at every handover. Light mode looks the same as D67; dark mode and status text change to Quality's values.
*T2 (code, 2026-10-10):* `globals.css` is generated from the Figma export: primitives as plain `:root` variables, tokens as Tailwind theme colours, Tailwind's default type and radius scales switched off. Type sizes are `text-type-*` (a colour and a text style can't share the class `text-caption-1`); Figma's Radius-L is `--radius-lg` in code (Tailwind's `rounded-l` means left corners); Heading H4 is 30 px Crimson Pro (the sign-in and sign-up titles, previously Tailwind's `text-3xl`). Text-Danger in dark is `#f9dddd` (Quality's negative icon colour) instead of Quality's `#e26e6a`, which is 2.6:1 on the dark danger tint. Icons on plain surfaces use Spot colours; text on tints uses the Text-* tokens. `pnpm lint:tokens` rejects the retired names.

**D69 — Side nav, page header and menus follow the owner's Figma frames.** Locked (owner, 2026-10-11).
The owner's Figma frames (file `WJylkbnRxmt6QfEXWQ2m2h`: Side Nav 22:2445 with its five variants, User Option 18:878, Side nav item 22:1339, Home 17:978 and Home Dark 38:2392, Jobs 65:4877, Notification 65:4947, Sidebar Menu Option 65:4974, Sidebar Account Option 65:5031) replace D67's sidebar. Sidebar (240 px): the workspace menu (Settings, Invite and manage members, Logout; the org list when there is more than one), Search and collapse in the top row; Home and New page; the Workspace and Your brands groups; the getting-started card and the profile card at the bottom. The profile card opens the account menu (who is signed in, Settings, Themes cycling System → Light → Dark, Logout, getting-started progress and the next step). Jobs and Notifications leave the sidebar for the page header (32 px icon buttons with a blue dot; popovers under them); Settings moves into both menus. The page panel sits 6 px from every edge, the sidebar included; its header is 49 px with its border. Dark mode follows Home Dark through the Dark token values. The Figma icons are used as SVG components in `components/ui/lp-icons.tsx` (exact paths; greys use `currentColor`, blues `spot-500-blue`), an exception to lucide-only for these icons; other icons stay lucide. Figma's 0.7 px and 0.5 px hairlines are drawn as box shadows, because browsers round borders up to whole pixels (a 0.7 px border shows as 1 px): `ring-thin` (outline outside the box, like Figma's outside stroke) and `divider-b-thin` / `divider-b-half` (`@utility` in `globals.css`; owner asked for the true fraction, 2026-10-11). `cn` knows `ring-thin` and the shadow tokens so they are not dropped in merges. Text renders with `antialiased`, as Figma draws it.
*Home canvas (2026-10-11):* Home follows the Home and Home Dark frames: mark and serif greeting, three 285 px cards with the owner's paintings (`public/home/`) and drawings of a light page that stay light in dark mode, as drawn. The paintings carry Figma's Texture effect as an SVG filter. No done state on the cards for now (owner will send a frame); the getting-started steps in the sidebar take the nav rows' hover.
*Why:* the owner designed the nav and asked for it implemented as seen, in light and dark (D20: Figma is the source once frames exist).

**D70 — Pages follows the owner's Figma frames; the shared list takes the Figma list style.** Locked (owner, 2026-10-11).
/pages follows All Pages (81:1559, light) and My Pages (65:22069, dark): the title block, the All pages / My pages view bar (counts per view after filters; the line moves on click before the server answers, then follows the URL), Filter, and a list/grid toggle that replaces the old Display button (owner's change; grid waits for its design, so it is disabled). The status groups and rows follow the Page List component (Default and Hover) and its ⋯ menu; `GroupedList`/`ListGroup`/`ListRow` carry that style, so Brands and Products lists match. Titles stored as "Template · Product" are drawn as the two parts with a dot. Only Needs review is designed: the other states keep placeholder glyphs at the ring's size. `?sample=1` shows sample pages in every status, in development only. The current-view line is near-black in light and Foreground-03 in dark, as in the two frames.
*Follow-up (owner, 2026-10-11):* a Display menu sits between Filter and the toggle: group by status, template type, creator (you first) or none; order by last updated, newest first (build start) or cost; show or hide origin, cost, updated and creator. Choices live in the URL with the filters and are kept when switching views. The 28 px title is now the Figma text style Heading/Title - 28 (four weights, -3 %), and the title sits flush with the list. Blues stay Spot-500-Blue (#2c66ff), matching the owner's change in Figma.
*States (owner, 2026-10-12; Figma: All Pages/states light 98:2276, state dark 119:58270):* every state is designed and implemented: groups in the order Needs review, Building, Published, Approved, Failed; Figma icons for each state (blue ring; a graded spinner in Icon-Nav-Active; a green tick in a circle; a purple check-and-hand at 18 px; a red cross in a circle); score chips (shield, number; green, amber or red tint); Figma glyphs for every template type (comparison, long form, versus and other added); the Cloned tag has no icon. The dark frame's tints for green, blue and red are not variables in Figma, so code adds `--color-tint-green/-blue/-red/-yellow` (light = Highlight-*-50; dark = #141e15, #171e31, #241414, Highlight-Yellow-150). Two deliberate departures from the frames: the poor score uses Text-Danger (the dark frame's dark red on a dark red tint is unreadable), and where the frames disagree by mode (long-form icon black in light, blue in dark; the other-type glyph) the `dark:` classes follow the dark frame. *Follow-up (owner):* groups sit 16 px apart as in the frame; the long-form icon is Spot-500-Blue in both themes. Figma was brought in line with code the same day: new primitives Green/Blue/Red 950; variables Highlights/Tint-Green/-Blue/-Red/-Yellow, Surface/Tab-Indicator, Illustration/Illustration-Surface/-Line/-Line-Strong (code: `--color-tint-*`, `--color-tab-indicator`, `--color-illustration-*`); effect styles Shadow/Float and Shadow/Lift; 405 typed-in blues bound to Spot-500-Blue; states chips and glyphs bound to the tints and inks; tab underlines to Tab-Indicator; content panels 16 px with a 0.5 px Stroke-Strong and no shadow; Side Nav cards 0.5 px Stroke-Strong, no shadow; Home card drawings off the outside library onto Illustration variables.
*Why:* the owner designed the Pages screen and asked for it as seen, with the switcher done properly.

**D71 — Header popovers follow the Notis component; jobs get a read state on the user's auth record.** Locked (owner, 2026-10-11).
Jobs and Notifications use one frame (Figma: Notis, Default and Hover): Surface-Modal with the pop shadow and a stroke-strong outline; rows fill Foreground-01 on hover (Foreground-02 in dark, where Foreground-01 equals the popover); where more of the list sits below, its last 40 px fade out (owner, 2026-10-12, replacing an earlier progressive blur): `scroll-fade-b` masks the list itself with an eased gradient whose length is a registered property driven by the list's scroll (`animation-timeline: scroll(self block)`, `animation-range` over the last 40 px), so the fade is absent when the list fits and shrinks to nothing at the end; browsers without scroll-driven animations use a `data-more` attribute set from script (technique: shadcn scroll-fade, tw-fade, ngrok Mantle) (light: grey-10, as Figma's #fafafa; dark: a touch darker than Surface-Modal, chosen by comparing four values); the footer is Surface-Primary with a 0.5 px top stroke, a soft upward shadow on hover, and "Mark all as read" as a Foreground-01 pill on hover. Jobs gets "Mark all as read" too: `POST /api/jobs/seen` stores `jobs_seen_at` in the user's Supabase Auth `user_metadata` (no schema change; it follows the user across devices), `GET /api/jobs` returns it as `seenAt`, and finished jobs newer than it count as unread: the header dot shows while jobs run or any are unread. The header dots and counts render after hydration, since another part of the page can fill the cache first. Filter and Display have no fill until hovered.
*Why:* the owner's Notis design and request; a profiles column would need a migration for what is a per-user marker.

**D72 — Frame edges follow Nucleo's recipe.** Locked (owner, 2026-10-11).
The owner pointed at nucleoapp.com's filter tray for frame borders. Its values, read from the live page: light, a 0.5 px border in near-black at 10 % and a `0 0.5px 0` white/80 shadow under the bottom edge; dark (`data-theme="dark"`), no border and the same shadow at white/20. The `edge` utility reproduces it with our grey (`--color-edge` = grey-850 at 10 %, transparent in dark; `--color-edge-highlight` white/80, white/20 in dark) and composes with `shadow-*`; `edge-strong` darkens the border for hover and the folded getting-started card. Applied to the frames: the workspace, account, row ⋯ and Display menus, the Jobs and Notification popovers, toasts, the list/grid toggle, the profile and getting-started cards, and the Home cards (replacing their double hairline). Hairline dividers and the origin tag keep `ring-thin` / `divider-*`; older content cards (templates, wizard, briefings) keep their 1 px stroke until redesigned.
*Follow-up (owner, same day):* the content panel takes the edge too. Dark mode reverts to the stroke border (`--color-edge` = Stroke, `--color-edge-strong` = Stroke-Strong, no highlight): with Nucleo's no-border dark, cards on the panel's own colour lost their sides.
*Follow-up 2 (owner, same day):* floating frames (menus, popovers, toasts) were too heavy: the 0.5 px border draws 1 px in Chrome, the workspace menu doubled it with the inner edge shadow, and Pop added a strong drop shadow. They now use `edge-hairline` (a true 0.5 px ring in `--color-edge`) and `shadow-float` (after Nucleo's `--shadow-lg`: a 0.5 px contact line and soft layers at 1–5 %, ×2.5 in dark via `--float-intensity`); the workspace menu loses its inner edge shadow. The page header's line uses `edge-b`, the same border as the content panel's edge.
*Follow-up 3 (owner, same day):* the stroke now follows Quality (usequality.app, its current stylesheet `index-kXlYR7RX.css`) instead of Nucleo: a plain 0.5 px border in Quality's Border-on-bg (Grey 50 #e6e6e6 light, Grey 400 #2a2a2a dark), which is our Stroke-Strong; no highlight. `--color-edge` = Stroke-Strong in both themes; `--color-edge-strong` = Stroke-Input-Hover (#d8d8d8) in light and grey-800 (#3d3d3d) in dark. Floating frames keep `edge-hairline` + `shadow-float` in that colour. The content panel matches Quality's content frame exactly (`rounded-2xl border-[0.5px] border-solid border-border-on-bg`, no shadow): `shadow-panel` removed, so the edge reads canvas → stroke → panel with nothing else (#f9f9f9 → #e6e6e6 → #fff light, #090909 → #2a2a2a → #121212 dark). Its corners are 16 px like Quality's (`rounded-panel`; owner's choice over Figma's 10 px). The sidebar's getting-started and profile cards take the same stroke with no shadow (their inner edge shadow, lift and folded darker edge removed) and keep their 10 px corners (owner). Home cards take Quality's Home card hover (from its public app bundle: `border border-border-divider hover:border-border-input-hover`, no movement): the border deepens to Stroke-Input-Hover (#d8d8d8 light, #212121 dark, = Quality's Border-input-hover), and `--color-edge-strong` uses that value in both themes; the 2 px drawing lift is removed.
*Why:* the owner prefers that edge; a real 0.5 px border draws exactly as Nucleo's does (1 px in Chrome, a half pixel in Safari).

**O5 resolved — Expert author allowed, without credentials.** Locked (owner, B1.2, 2026-10-09). See D66.

**O6 resolved — Worker runs locally for now.** Locked (owner approved B0.4 plan, 2026-10-08). Choose a host (needs Playwright Chromium) before the first deploy.

## Open (ask the owner when the related build starts)

- O1 — Product name and logo (placeholder "LP Platform" until then).
- O2 — Clone-path terms text (placeholder until legal review).
- O3 — Which library templates ship first, and their HTML (owner designs; see `template-onboarding` skill).
- O4 — Billing/plans: out of scope for v1 unless the owner adds it.
- ~~O5 — Whether "doctor/expert" author type is allowed at all, and how bylines are labelled.~~ Resolved (D66).
- O6 — Hosting for the worker (Railway, Fly.io, Render, or a VM). Needs Chromium. *Local for now (see above); decide before the first deploy.*
- O10 — Local database runtime: Docker Desktop, Colima, or a Supabase Cloud dev project. *Raised 2026-10-09.*
