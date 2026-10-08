# BUILD_SPEC.md — LP Platform

This is the behavioural source of truth. It describes **what the system does**, stage by stage, with the algorithms and thresholds carried over from the reference tool (`docs/reference/LP_Tool_How_It_Works.md`) and adapted to this project's architecture. Where a value came from the reference, it is marked *(ref)*. Where this project changes the reference behaviour, it is marked **Change:**.

## Contents

1. Product summary
2. Glossary
3. Users, orgs and permissions
4. System architecture
5. Storage model
6. Jobs, progress and cost
7. Stage 1: Brand intake
8. Stage 2: Templates (owned library and cloned)
9. Stage 3: Create wizard
10. Stage 4: Build pipeline
11. Stage 5: Review desk and editor
12. Stage 6: Publishing
13. Compliance and residue gates
14. Analytics and ledger
15. Notifications
16. Testing strategy
17. Non-goals for v1

---

## 1. Product summary

A user connects a **brand** (name, voice, palette, logo, products). They choose a **template** — either one from the curated library the owner designed, or a competitor page they clone by URL. They run a short **wizard** (product, audience, emphasis, image style). The **pipeline** rebuilds the template for the brand:

- recoloured to the brand palette;
- logos swapped;
- product variants regenerated;
- every piece of copy rewritten by Claude in the brand's voice, within length budgets;
- every image classified and either kept, replaced with the brand's real product photo, or regenerated with fal.ai;
- AI-invented scene images corrected so they show the real product;
- for clones only: scrubbed of every trace of the source brand, its scripts, links, fonts and assets, then scored for leaks.

The user reviews and edits the result, then **publishes** it to Vercel (static), to Shopify as a draft page, or (M4) to Shopify as natively editable theme sections.

---

## 2. Glossary

| Term | Meaning |
|---|---|
| Org | Tenant. Owns brands, templates, builds, connections. |
| Brand | A client brand: identity, voice, palette, logo, products. |
| Product | One product of a brand: price, images, specs, USPs, variants. |
| Template | A page skeleton plus metadata. `origin` is `owned` or `cloned`. |
| Library template | An owned template the owner designed, available to every org. Global, read-only. |
| Org template | An org's own template: either a copy of a library template (with the user's section edits) or a cloned competitor page. |
| Section | A top-level block of a template, marked in HTML with `data-lp-section`. The unit of reorder/remove/duplicate. |
| Blueprint | AI analysis of a cloned page: palette, brand tokens, logo images, source links, variant sections. Clones only. |
| Instructions | Per-template rules: copy rules, length caps, image rules, keep/generic images, forbidden terms. |
| Build | One run of the pipeline producing one page for one brand and product. |
| Fragment | One text node of the page, the unit of copy rewriting. |
| Residue | Traces of the source brand left in a cloned build. |
| Ledger entry | One paid action (a model or image call) attributed to a build and pipeline node. |

---

## 3. Users, orgs and permissions

- Auth: Supabase Auth, email + password and magic link. Google OAuth optional later.
- A user belongs to one or more orgs through `org_members` with a role: `owner`, `admin`, `member`.
  - `owner`/`admin`: manage members, integrations (Vercel, Shopify), billing settings, org-level feature flags.
  - `member`: everything else (brands, templates, builds, publish).
- On first sign-up, create an org named after the user and make them `owner`.
- Org switcher in the top-left of the shell (see DESIGN.md).
- Every tenant table has `org_id`. RLS policy: a user can read and write rows where they are a member of `org_id`. Library templates (`org_id is null`) are readable by all authenticated users and writable by nobody through the API (seeded by script).
- Org-level feature flags (`orgs.settings` JSON): `clone_enabled` (default **true** from M2), `proxy_fetch_enabled` (default **false**), `ai_images_enabled` (default true).
- The clone path requires the user to accept clone-path terms once per org (stored with timestamp and user id) before the first clone. The text of these terms is supplied by the owner; use a clearly marked placeholder until then.

---

## 4. System architecture

```
Browser
  │  Next.js (apps/web) — UI, auth session, thin route handlers
  ▼
Supabase ──────────────── Postgres (primary store, RLS, job queue)
  │                        Storage (templates, builds, assets buckets)
  │                        Vault (Shopify credentials)
  ▲
  │  service role
Worker (services/worker)
  FastAPI internal API   — enqueue jobs, synchronous light reads, Shopify OAuth callback
  Job loop process(es)   — claims jobs, runs the LangGraph pipeline and other job kinds
  Playwright Chromium    — rendered brand autofetch, fetch fallback, QA/mobile screenshots, parity
  Providers              — Anthropic SDK, fal client, Vercel REST, Shopify Admin GraphQL
```

- The web app reads tenant data directly from Supabase with the user's session (RLS enforces isolation).
- The web app **writes** simple CRUD (brand fields, statuses) directly through Supabase. Anything slow, paid, or multi-step goes through the worker API, which validates org membership from the user's JWT and enqueues a job.
- The worker API verifies the Supabase JWT on every request and resolves `org_id` membership before acting.
- The job loop can run as one or many processes. Nothing it needs is in memory between jobs.

---

## 5. Storage model

### 5.1 Database

See `docs/schema/001_init.sql`. Postgres is primary. **Change:** the reference used JSON files as primary with Postgres as a mirror; here there are no JSON data files.

### 5.2 Object storage buckets

| Bucket | Visibility | Path pattern | Contents |
|---|---|---|---|
| `library` | private | `<template_slug>/index.html`, `/thumb.png` | Curated library templates (seeded) |
| `templates` | private | `<org_id>/<template_id>/index.html`, `/source.html`, `/thumb.png` | Org templates; `source.html` is the raw clone |
| `builds` | private | `<org_id>/<build_id>/working.html`, `/snapshots/<n>.html`, `/export/index.html`, `/qa-desktop.png`, `/qa-mobile.png`, `/og.png` | Build working page, snapshots, exports, QA shots |
| `assets` | **public read**, unguessable paths | `<org_id>/<uuid>.<ext>` | Images and fonts referenced by working pages |

- **Working format:** `working.html` references images and fonts by `assets` URL. Pages stay small.
- **Export format:** `export/index.html` is produced on demand by inlining every asset as a data URI and every stylesheet into `<style>`. Used for Vercel and HTML download. *(ref: the reference inlined everything always; pages were 2 MB+.)*
- Asset dedupe: hash file contents (SHA-256); reuse an existing `assets` object for the same org when the hash matches (`assets` table).

### 5.3 Build IDs and human keys

- Primary keys are UUIDs.
- Each build also gets a human key shown in the UI, like the screenshot's `ACME-23`: `<BRAND_PREFIX>-<n>`, where `BRAND_PREFIX` is 2–4 uppercase letters chosen at brand creation (default: first letters of the brand name) and `n` increments per brand. Never reused, even after delete *(ref: build ids never reused)*.

---

## 6. Jobs, progress and cost

### 6.1 Job queue

- Table `jobs`: `id, org_id, kind, status (queued|running|succeeded|failed|cancelled), payload jsonb, result jsonb, error jsonb, dedupe_key, attempts, max_attempts, locked_by, locked_at, heartbeat_at, created_by, created_at, started_at, finished_at, build_id`.
- Claim: `UPDATE jobs SET status='running', locked_by=$worker, locked_at=now(), heartbeat_at=now(), attempts=attempts+1 WHERE id = (SELECT id FROM jobs WHERE status='queued' AND run_after <= now() ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`.
- Heartbeat every 10 s. A reaper requeues `running` jobs whose heartbeat is older than 90 s (up to `max_attempts`, default 2 for builds).
- **Dedupe** *(ref)*: if a `queued` or `running` job exists with the same `dedupe_key`, return it instead of creating another. This prevents paying twice for one build. Keys:
  - build: `build:<template_id>:<brand_id>:<product_id>:<wizard_hash>`
  - per-build actions: `<kind>:<build_id>` (for example `redraft:<build_id>`)
- Concurrency: configurable max concurrent jobs per worker process (default 3) and per org (default 2). **Change:** the reference had no limit.
- Job kinds: `brand_autofetch`, `product_pull`, `template_clone` (M2), `template_analyze` (M2), `build`, `redraft`, `redraft_section`, `image_edit`, `image_generate`, `product_fidelity`, `mobile_optimize`, `qa`, `agent_turn`, `export`, `publish_vercel`, `publish_shopify_page`, `publish_shopify_editable`.
- **Change:** user-facing errors are raised as a typed `UserFacingError(message, code)`, not by abusing `SystemExit` as the reference did.

### 6.2 Progress

- Table `job_events`: `job_id, ts, level (info|warn|error), node, message, data jsonb`. Nodes emit events through a context helper (`ctx.progress("Rewrote 120 of 340 fragments")`).
- The web polls `GET /api/jobs/:id` (status + last N events) every **1.5 s** while running, and the jobs list every **8–30 s** when idle, paused in hidden tabs *(ref cadence)*. React Query `refetchInterval` does this.
- **Change:** the reference's wizard advanced on fake client-side timers. Here the progress screen shows **real** node events.

### 6.3 Cost tracking

- Every provider call records a `ledger_entries` row: `org_id, build_id, job_id, node, kind (copy|vision|analysis|image|edit|other), provider, model, input_tokens, output_tokens, units, cost_usd, created_at`.
- **Change:** the reference skipped recording for several calls (angle library, briefing, persona, background removal). Here **every** paid call is recorded.
- One pricing table in `providers/cost.py`, keyed by provider and model. Unknown model → record cost as null and log a warning (never crash).
- `builds.cost_usd` is a rollup maintained on ledger insert (trigger) or recomputed on read.

### 6.4 Provider failure handling

- fal "account locked / top-up required" errors set an org-scoped **circuit breaker** row (`provider_locks`: `org_id, provider, reason, until`) for 10 minutes, and subsequent image calls in any job for that org fail fast *(ref: account lock)*. **Change:** stored in the database, not a module global, and scoped per org so concurrent builds do not clear each other's lock.
- Anthropic: retry 429/5xx with backoff (SDK built-in plus our wrapper: 3 attempts at 2 s and 6 s *(ref)*).

---

## 7. Stage 1: Brand intake

A brand profile is the input to every build. It is created from a URL and then edited by hand.

### 7.1 Brand fields

`name, prefix, url, tagline, positioning, audience, brand_context, voice, voice_examples[], language (BCP-47, default en), palette {primary, dark, tint, accent, source_hue}, fonts {heading, body} (detected and saved — **Change:** the reference detected but never saved fonts), logo_asset_id, favicon_asset_id, cta_text, sale_percent, promo_text, meta_title, meta_description, usp_icons[], brand_md (optional long-form voice doc), support_email`.

### 7.2 Product fields

`handle, name, url, currency, price, sale_price, description, specs[], usps[], images[] (asset ids + source urls), variants[] {name, options, price, image}, selling_context, pricing_lines[] (subscriptions/selling plans)`.

`brand_for_product(brand, product)` returns a brand view with the product's specs, USPs, price and context folded into the copy brief *(ref: `Brand.for_product`)*.

### 7.3 Autofetch from a brand URL (job `brand_autofetch`)

1. **Static fetch:** name from `og:site_name` or `<title>`; tagline from meta description; logo from `og:image` or icon links.
2. **Rendered pass (Playwright):** read computed colours of buttons, header, footer and body; saturated brand colours; font families; `<html lang>`.
3. **Colour choice, in priority order:** rendered brand colour → CTA button colour → `theme-color` meta → dominant hex. Filter third-party colours (payment badges, review widgets, chat bubbles). Derive `dark` (darken) and `tint` (lighten, low saturation) from primary.
4. **AI refinement:** one Claude call fills name, tagline, positioning, audience, voice, CTA, brand context, language and primary colour from the page text and the detected values.
5. Return a **draft** to the form. Nothing is saved until the user saves. Download the logo and favicon into `assets` only on save.

### 7.4 Product pull (job `product_pull`)

1. If the brand has a connected Shopify store: read the product through Admin GraphQL.
2. Otherwise public Shopify JSON: `/products/<handle>.json`, fuzzy fallback to `/products.json?limit=250` matching by handle/title.
3. Not Shopify, or blocked: fall back to JSON-LD `Product`, then Open Graph, then `<h1>` *(ref)*.
4. Selling plans from `/products/<handle>.js` become `pricing_lines`.
5. **Do not send `Accept-Language`** on Shopify pulls, so Shopify Markets does not localise prices to the fetcher's country *(ref)*.
6. Enrichment: one Claude call fills description, USPs, specs and selling context from the page text.
7. Download product images into `assets`.

### 7.5 Cached strategy (per product)

Built once on demand, cached in `product_strategy` rows, refreshable by the user:

- **Briefing** (used by the wizard): four audience options, plus lists of benefits, features and objections. One Claude call (~15 s first time).
- **Angle library**: avatar, primary pain, core desire, moat, mechanism, objections, and five angles tagged by awareness level (unaware → most aware). Used to pick an angle matched to the template type when the user does not specify emphasis.
- **Comparison data** (for comparison/versus templates): axes, winner, competitors, table rows.

---

## 8. Stage 2: Templates

### 8.1 Template data

| Field | Owned | Cloned |
|---|---|---|
| `origin` | `owned` | `cloned` |
| `org_id` | null for library; org id for an org copy | org id |
| `parent_template_id` | library template it was copied from | null |
| `type` | advertorial, listicle, versus, comparison, long_form, quiz_bridge, product_page... | detected or chosen |
| `html_path` | storage path | storage path |
| `sections` | rows in `template_sections` | rows, detected at analysis |
| `instructions` | authored by the owner with the template | authored or AI-drafted then reviewed |
| `blueprint` | null | AI analysis result |
| `source_host`, `source_name` | null | from the clone |
| `editor_map` | for M4 editable publish | for M4 editable publish |

### 8.2 Sections

- Every top-level section in a template's HTML carries `data-lp-section="<key>"` and optionally `data-lp-role="<role>"` (`hero, problem, mechanism, benefits, ingredients, social_proof, testimonials, comparison, offer, guarantee, faq, cta, footer_cta, other`).
- `template_sections` row: `template_id, key, role, label, position, removable (bool), duplicable (bool)`.
- Library templates are authored with these attributes by hand (see the `template-onboarding` skill).
- Cloned templates get them added at analysis time (M2): the AI proposes section boundaries; a deterministic pass wraps or tags the top-level containers; the user can correct labels.

### 8.3 Owned path: library → org template

1. `/templates` shows the library gallery (cards with thumbnail, name, type, short description) and the org's own templates.
2. **Use template** creates an org template: copies the library HTML and section rows, sets `origin=owned`, `parent_template_id`.
3. The **section editor** (`/templates/[id]`) shows the page preview with a section rail. The user can:
   - **reorder** sections (drag in the rail; `@dnd-kit`);
   - **remove** a section (if `removable`);
   - **duplicate** a section (if `duplicable`): copies the node with a new key `<key>-2`, inserted after the original;
   - **rename** the section label (display only).
   Each change rewrites `template_sections.position` and the HTML (move/remove/clone the `data-lp-section` node). Keep the last 12 versions of the template HTML for undo.
4. Users cannot create new section types in v1.
5. The wizard can also start directly from a library template; in that case an org template is created implicitly with the default order.

### 8.4 Clone path: URL → org template (M2)

Job `template_clone` then `template_analyze`.

**Fetch ladder** *(ref)*:
1. Plain GET with a desktop Chrome user agent.
2. On 403/429: one retry after `Retry-After`, capped at 8 s.
3. Playwright Chromium fetch returning the raw response body.
4. Only if the org flag `proxy_fetch_enabled` is on: steps 1–3 through the residential proxy (`LP_FETCH_PROXY`). Off by default (D4).
- Or the user pastes HTML instead of a URL.

**Validate:** reject bot-wall/captcha pages (known markers: "Just a moment", "cf-chl", "captcha", "Access denied", "px-captcha") and anything under 5,000 bytes *(ref)*.

**Clone (deterministic, light)** *(ref)*:
- Fingerprint the platform: Shopify, Replo, Webflow, ClickFunnels, Funnelish, WordPress, Framer. A store product page with "add to cart" gets the verdict `rebuild_native` (warn the user that a store page is not a landing page).
- Inline each `<link rel=stylesheet>` into a `<style>` block; make its `url()`s absolute.
- Remove known tracker scripts only: GTM, GA, Facebook pixel, Clarity, Hotjar, Segment, Klaviyo, Heap, FullStory, Mixpanel, Amplitude, TikTok pixel. Keep functional JavaScript.
- Images: `data-src` → `src`; fix `////host` URLs; make URLs absolute; drop `loading`.
- `<video>` and Lottie players become `<div class="lp-media-slot" data-aspect="w/h" data-radius="...">` placeholders.
- Identity: `source_host` from the URL, `source_name` from `og:site_name`.
- Add `<base href>` for preview only; flatten nested `<p>`.
- Save `source.html` (raw) and `index.html` (cloned).

**Analyze (AI)** — save results only when the AI call succeeded, so a heuristic fallback is never frozen in *(ref)*:
- **Blueprint:** start from a heuristic (palette from saturated hue families, logo images whose src/class/id/alt contains "logo", absolute links), then one Claude call over a page digest (top colours, images, links, headings, first 4,000 characters of text) returns `palette, brand_tokens, logo_srcs, cta_hrefs, variant_sections, notes`. `identity_tokens` keeps only short tokens so a long claim phrase is never replaced with the brand name *(ref)*.
- **Sections:** propose top-level section boundaries and roles; tag them with `data-lp-section`.
- **Instructions draft:** propose `length_caps` from current text lengths (+10–15 %), likely `keep_images` (stars, ticks, rating bars, badges) and `forbidden_terms` (source brand claims). The user (or owner) reviews before first build.
- **Editor map** (for M4): section and role map for Shopify editable publish.

**Important** *(ref)*: adding a template only clones and analyses it. Source-brand stripping runs on **every build**, because the strip depends on the target brand.

### 8.5 `instructions` schema

```json
{
  "copy_rules": "string appended to the copywriter system prompt as TEMPLATE-SPECIFIC RULES",
  "length_caps": [{ "match": "h1.hero-title", "max_chars": 70 }],
  "image_rules": "string appended to the image planner and product-fidelity prompts as TEMPLATE IMAGE RULES",
  "generic_images": ["css selector or src substring"],
  "keep_images": ["css selector or src substring"],
  "forbidden_terms": ["SourceBrand", "clinically proven"],
  "notes": "developer notes; never sent to a prompt"
}
```

Semantics *(ref)*:
- `length_caps`: any cap whose `match` is a substring of a fragment's context string lowers that fragment's budget.
- `generic_images`: matching images become a generic, unbranded product scene; product fidelity skips them.
- `keep_images`: matching UI graphics are kept as-is; applied **last**; product fidelity skips them.
- `forbidden_terms`: after the copy pass, delete the innermost block still containing the term; a lone label span loses only the span. Capitalised terms match case-sensitively; lowercase terms match case-insensitively.

Validate with a Pydantic model; reject unknown keys.

### 8.6 Template lifecycle

- Library templates: seeded from `templates/library/` by `scripts/seed-library`. Can be marked `retired` (hidden from the gallery, still resolvable so old builds keep working) *(ref)*.
- Org templates: soft delete (`deleted_at`), restorable for 7 days, then purged.
- **Change:** the reference wiped cloud-added templates on every deploy. Here templates live in the database and storage; deploys never touch them.

---

## 9. Stage 3: Create wizard (`/pages/new`)

Seven steps *(ref)*, each a route segment or a step in one client component with URL state:

| # | Step | Collects | Server calls |
|---|---|---|---|
| 0 | Brand & product | brand, product | side panel loads cached strategy ("dossier") |
| 1 | Template | one template (library or org) | none |
| 2 | Imagery | AI images on/off; styles: editorial photo, UGC, studio, macro, illustration, anatomical, diagram, render | none |
| 3 | Audience | one of four audiences or "let the desk pick", optional gender and age range | briefing (cached) |
| 4 | Emphasis | up to three benefits, features, objections | none |
| 5 | Review | summary; author type: writer, doctor/expert, customer, influencer | none |
| 6 | Run | real progress | enqueue `build` job |

Payload (zod-validated): `{template_id, brand_id, product_id, author_type, ai_images, image_styles[], audience, audience_gender, audience_age, emphasis{benefits[],features[],objections[]}}`.

`wizard_targeting(payload)` produces *(ref)*:
- `brief_extra`: an "OPERATOR TARGETING" block for the copywriter;
- `image_prefs`: `{ai, styles, audience}` for the image planner;
- a `targeting` record stored on the build.

**Batch:** "Build with all my templates" creates one build job per template for one product (M3).

Author type with "doctor/expert": the copy must not claim real credentials. The author persona is a fictional byline only if the template has a byline; add a compliance note and never generate credentials like "MD" next to an invented name unless the owner explicitly enables it per brand. Flag this in the Build Report at the build that implements it.

---

## 10. Stage 4: Build pipeline

Implemented as a LangGraph `StateGraph` (see `docs/pipeline/graph_sketch.py`). Every node:
- reads and writes `BuildState`;
- emits progress events;
- records cost through providers;
- is idempotent where possible (re-running a node on the same input gives the same output), so the job can resume from the LangGraph Postgres checkpoint after a crash.

### 10.1 Node order

```
load_inputs
→ apply_section_layout
→ recolor
→ swap_logos
→ regenerate_variants
→ copy_rewrite
→ purge_terms
→ [origin=cloned] strip_chrome            (before images: never pay for an image about to be deleted)
→ prepare_media_slots
→ image_pass
→ finalize_common
→ [origin=cloned] scrub_source_brand → scrub_scripts → rewrite_links → purge_foreign_assets
→ product_fidelity
→ [origin=cloned] residue_scan
→ compliance_scan
→ write_report
```

The bracketed nodes are reached through conditional edges on `state.origin`. The owned branch routes past them. This conditional block is the whole difference between the two paths.

### 10.2 Node specifications

**`load_inputs`**: load template HTML, sections, instructions, blueprint (clones), brand view for the product, wizard targeting, image prefs. Reset the per-build cost context. Clear any expired provider lock for this org.

**`apply_section_layout`**: reorder/remove/duplicate `data-lp-section` nodes to match the org template's section rows (normally already applied in the template HTML; this node guarantees it and is a no-op when already in order).

**`recolor`** *(ref)*:
- Add brand visual touches: Lucide USP icons where the template has USP icon slots, a native `<details>` FAQ when the FAQ uses JS accordions, spacing fixes.
- If a palette is known (blueprint for clones, `source_palette` declared in `template.json` for library templates): **exact-hex pass** (map each source colour to its brand counterpart in inline styles, `<style>` blocks, SVG fills/strokes), then a **hue-family sweep** (shift remaining colours in the source hue family to the brand hue, preserving lightness and saturation relationships). Leave neutrals (greys, near-white, near-black) alone.
- Library templates should use CSS custom properties for brand colours (`--lp-primary` etc.), so recolour is a variable swap. The hex pass is the fallback.

**`swap_logos`** *(ref)*: replace `logo_srcs` (clones) or `[data-lp-logo]` (library) with the brand logo. Count `logos_missing` if a slot has no brand logo.

**`regenerate_variants`** *(ref)*: for variant pickers (blueprint `variant_sections` or `[data-lp-variants]`), clone one unit per brand variant with its name, price and image; if the brand has one variant, collapse the picker to one unit.

**`copy_rewrite`** — see §10.3.

**`purge_terms`** — apply `forbidden_terms` (§8.5). Record `purged_terms` in the report.

**`strip_chrome`** (clone only, early) *(ref)*: remove skip links; store headers (by class, cart or account links, or aria labels); body-level or legal footers; chat widgets and full-screen fixed overlays; citation/reference blocks; navigation links whose `#target` was just removed.

**`prepare_media_slots`** *(ref)*: visible `.lp-media-slot` divs become `<img class="lp-scene-slot">` placeholders that keep the slot's aspect ratio and radius; their deliberately foreign `src` forces the image planner to fill them.

**`image_pass`** — see §10.4.

**`finalize_common`** (both paths) *(ref, subset)*:
1. Drop HTML comments.
2. Set meta: title, description, Open Graph, Twitter tags; `og:image` = product image or dropped.
3. Favicon: remove existing icons, set brand favicon.
4. Emails → brand `support_email` or `support@<brand domain>`.
5. Fix FAQ markup (native `<details>`).
6. Fill media slots left empty (product photos when AI images are off).
7. Fill trust/USP rows from brand USPs.
8. Sale labels: percent-off and promo labels from the brand.
9. Ensure viewport meta.

**`scrub_source_brand`** (clone only) *(ref)*: replace source tokens (`source_name`, blueprint `brand_tokens`) with the brand name in visible text and in `alt`, `aria-label`, `title`, `content` and `data-*` attributes. Drop JSON-LD. Remove any image with "logo" in alt/src that is not the brand's. Remove Alpine/Shopify hydration scripts and `<base>`; resolve root-relative URLs.

**`scrub_scripts`** (clone only) *(ref)*:
- Foreign `<script src>`: drop, unless a layout library (jQuery, Slick, Swiper, Splide, Flickity, GSAP, AOS), which is vendored into `assets`.
- Inline scripts: drop when they contain checkout or tracking markers, a foreign host, or a source token. Keep component runtime.
- Foreign stylesheets: vendor into `assets`; drop preload hints.
- Fonts: download woff2 into `assets`; legacy formats → `none`. Font families named after the source become `BrandFont`, and the brand's saved fonts are applied where possible. CSS classes/ids carrying a source token are renamed.

**`rewrite_links`** (clone only) *(ref)*:
- Every link into the source site and every dead in-page `#anchor` CTA → the product URL (or the CTA URL chosen in the wizard).
- Drop foreign `<noscript>` blocks, cart drawers and cross-sell widgets.
- Foreign CSS `url()`s → `none` (font URLs exempt, already vendored).
- Drop any non-`src`/`href`/`srcset`/`style` attribute carrying a foreign URL, `data-*` included.
- Remove source `og:`/`twitter:` metas and `<base>`.

**`purge_foreign_assets`** (clone only) *(ref)*: any `<img>` not on the brand's asset hosts → 1×1 transparent, hidden unless icon-sized; drop foreign `<source>` and `<link>`; guarantee no foreign URL survives anywhere.

**`product_fidelity`** — see §10.5.

**`residue_scan`** (clone only) — see §13.

**`compliance_scan`** (both) — see §13.

**`write_report`**: store `working.html`, the report, the review fragments (§11.2), and the ledger rollup. Set build status `needs_review`.

### 10.3 Copy pass

**Fragments** *(ref)*. Walk the DOM in document order. A fragment is a text node that:
- is not inside `script, style, noscript, template, head, title`;
- contains letters, **or** is a price (currency symbol + digit).

Each fragment: `{id: "f0001", text, context: "tag.class1.class2" (plus nearest section role), chars, replacement}`. IDs are positional and recomputed each call; never stored in the template. Text with no letters (countdown digits, "4.8", "12,000+") never becomes a fragment, so it cannot be changed by copy or editor.

**Drafting** *(ref)*:
- Model: `LP_MODEL_COPY` (default `claude-sonnet-5-5`).
- 40 fragments per call, max 8,000 output tokens. Each fragment sent with its neighbours' text for context.
- Calls for different chunks may run concurrently (max 4 per build).
- Output: JSON mapping `{fragment_id: replacement}` enforced with a JSON schema / tool call. Salvage partial JSON on failure *(ref `_parse_mapping`)*.

**System prompt order** *(ref)*:
1. brand name, product, USPs;
2. voice (or `brand_md`), brand context, voice examples, CTA;
3. angle brief + OPERATOR TARGETING block;
4. fixed rules: no em dashes, no filler, **no health claims** (no cure/treat/prevent/diagnose), stay near the original length, remove every trace of the source brand, return `""` for navigation, legal and UI text that should disappear;
5. template-type rules (advertorial voice, listicle numbering, etc.);
6. `copy_rules` from instructions;
7. language rule (always emitted: write in `brand.language`).

**Reliability** *(ref)*: each chunk gets 3 attempts with waits of 2 s and 6 s. A chunk that still fails keeps its source copy and is reported as `copy_error`; it never fails the whole build. (`copy_error` blocks publish; see §12.1.)

**Length budget** *(ref)*: `budget = max(chars + 12, ceil(chars * 1.15))`, lowered by any matching `length_caps`. Over-budget replacements get up to two shortening passes. Still too long → `copy_warnings` entry.

**Strict mode** (clones always; owned optional) *(ref)*: fragments of ≥ 20 characters and ≥ 3 words that came back unchanged get up to two re-prompts. Warn if under half of the 40+ character fragments were rewritten.

**Structural protection** *(ref)*: blank the replacement (keep original) for countdown units, badges, "written by" lines, short job titles, and one-word all-caps labels. Library templates can mark nodes `data-lp-lock` to protect them.

**Reinjection with drift check** *(ref)*: before writing a replacement, confirm the node at that position still has the original text; if not, skip and record a drift warning.

Record `copy_rewritten` = rewritten fragments / eligible fragments.

### 10.4 Image pass

**Plan** *(ref)*:
1. Build a manifest for each `<img>`: file, host, alt, rendered size, nearest heading and paragraph, ancestor classes, foreign flag.
2. Add CSS background images as pseudo-entries (ids from 10,000).
3. Remove foreign `<source>` tags.
4. One Claude vision call (`LP_MODEL_VISION`) with up to 20 deduplicated 96 px thumbnails returns a role and action per image. On failure, fall back to a heuristic plan and add an `image_warning`.

| Role | Action |
|---|---|
| product | `replace_product` |
| avatar | `regenerate_person` |
| lifestyle | `regenerate_scene` |
| logo | `drop` |
| icon, decorative | `inline_keep` |

**Deterministic fix-ups, in this order** *(ref)*:
1. Normalise the plan (unknown roles → decorative).
2. A background panel under the product title becomes `replace_product`.
3. A foreign image is never `keep` as a remote URL (it is downloaded into `assets`), and a foreign product image is never kept.
4. Ensure product slots: if the page has a buy box with no product image, assign one.
5. Escalate large content photos (≥ 480 px wide) planned as `inline_keep` to `regenerate_scene`.
6. Apply `generic_images`.
7. Apply `keep_images` (last).

**Execute** *(ref)*:
- `replace_product`: cycle the product's real photos.
- `regenerate_person`: generate up to six headshots per build (fal text-to-image) only if the plan needs people; reuse across slots.
- `regenerate_scene`: prompt = style prefix (from `image_styles`) + scene prompt (from the planner, using nearby copy) + brand suffix (palette, mood). fal text-to-image (`LP_FAL_T2I_MODEL`) at the slot's aspect ratio (default 4:3); 3 attempts at 0, 3, 8 s; stop early on provider lock. If every attempt fails and the product has a hero photo, composite the real product into a scene with an edit call.
- A failed scene or person is **dropped**, never replaced with a packshot.
- `inline_keep`: download into `assets` (resize to ≤ 640 px wide for icons/UI, ≤ 1,280 px for photos). **Change:** stored in `assets`, not inlined.

**AI images off:** no paid scenes or people; media slots and scene slots get product photos.

Every image slot gets a stable `data-lp-img="<n>"` id so the image studio can version it (`image_versions` table, max 5 versions per slot *(ref)*).

### 10.5 Product fidelity pass

Scene images are text-to-image inventions that show a generic product. This pass replaces those stand-ins with the real product *(ref)*.

1. **Gate:** AI on, AI images on, fidelity not disabled.
2. **References:** up to 3 product photos. None → plan `no_product_photos`, stop.
3. **Candidates:** raster images ≥ 160 px, at most 30; skip brand's own product photos, SVGs, icons, keep/generic images.
4. **Plan:** one vision call sees the product photos and a thumbnail of every candidate; returns per image `fix | ok | no_product`, with a reference photo index. Include `image_rules`.
5. **Apply:** at most 10 fixes per pass; each an edit call (`LP_FAL_EDIT_MODEL`) with one product reference and the instruction "recreate this exact image with the real product, change nothing else". Images sharing a source are edited once. Every edit is versioned and restorable.
6. **Report:** stats in `report.images.product_fix`; failures appear in the image warning banner. Never blocks the build.

Typical cost *(ref)*: ~$0.02 for the check plus ~$0.15 per fix.

### 10.6 Build report

`builds.report` (jsonb):

```
mode: "owned" | "cloned"
template, status, verdict
targeting
copy: { rewritten_ratio, error?, warnings[], purged_terms[], drift_warnings[] }
images: { plan_stats, plan[], product_fix, media_slot_scenes, chrome_strip_stats, warning? }
blueprint (clones): { logos, variants_collapsed, variants_cloned, scripts_dropped, scripts_vendored, fonts, ctas, css, widgets }
residue (clones): { score, clean, counts, findings[] }
compliance: { findings[], high_risk_count }
cost: { total_usd, breakdown_by_kind, breakdown_by_node }
mock_images: bool
```

**Change:** `mock_images: true` builds show a red "Mock images" banner and are **blocked from publish** (the reference recorded this flag but never checked it).

---

## 11. Stage 5: Review desk and editor

### 11.1 Review desk (`/pages/[buildId]`) — M1 basic, M3 full

Layout: preview iframe (desktop/mobile toggle) on the left, a right panel with tabs.

**Banners** *(ref)*:

| Banner | Trigger | Colour |
|---|---|---|
| Copy NOT rewritten (+ Retry button) | `copy.error` | red |
| Copy partially rewritten | `copy.warnings` | amber |
| Image plan issues | `images.warning` (heuristic fallback, provider lock, failed people/scenes, composites, product-fix problems, missing logos) | amber |
| Mock images | `mock_images` | red |
| Source leak score | `residue` (clones) | green/amber/red by score |
| Legal desk | compliance findings | amber/red |

**Panels:**
- **Overview:** status (draft → needs review → approved → published), cost, template, targeting.
- **Copy:** list of fragments (original → rewritten), click to jump; edit inline. "Redraft all" and "Redraft section" (jobs).
- **Proof frame:** `/preview/[buildId]?mode=edit` wraps each fragment in a click-to-edit span; edits post back; **Save** writes through reinjection with drift check.
- **Inks:** detected palette with one-click recolour (snapshot first — **Change:** the reference did not snapshot recolour).
- **Legal desk:** compliance findings with location links.
- **QA (M3):** Playwright screenshots at 1280 px and 390 px; OG image 1200×630 rendered and injected.
- **Publish:** destinations (§12).
- **Agent chat (M3):** see §11.3.

### 11.2 Full editor (`/pages/[buildId]/editor`) — M3

- Desktop view (1440 px scaled) or mobile view (390 px).
- **Section rail:** sections from `data-lp-section` (or a no-AI sectioniser for clones without tags): move, remove, duplicate, style, "Improve with AI".
- **Canvas:** text edits save immediately (debounced). Option/Alt-click opens a popover: text colour, background, size, and "Improve element" AI action.
- **Image studio** (click an image): version history + restore; reuse an image from another slot; insert a product photo; "Match product everywhere" (product fidelity job); AI edit with up to 3 product references; generate new; upload; size, crop ratio, alt text.
- **Mobile optimise** *(ref)*: rule-based pass (viewport meta, image max-width, font clamping, fixes stylesheet) then an AI pass: 390 px screenshots → Claude proposes CSS → sanitise → inject inside `@media (max-width: 767px)`; two rounds (fix, verify).
- **Undo:** every destructive action snapshots first; keep 12 snapshots *(ref)*.

### 11.3 Edit agent (M3)

Claude (`LP_MODEL_AGENT`) in a tool-use loop of up to 8 turns *(ref)*, each turn a job (`agent_turn`), with tools: `edit_text(fragment_id, text)`, `replace_image(slot, prompt|asset)`, `check_policy(text)`, `recolor_page(palette)`, `remove_element(selector)`, `set_variants(...)`, `move_section(key, position)`. Conversation saved in `agent_messages`. Every mutating tool call snapshots first.

---

## 12. Stage 6: Publishing

### 12.1 Publish gate (before every publish)

Block when *(ref + changes)*:
- the report has `copy.error`;
- compliance finds high-risk claims (cure, treat, prevent, diagnose, FDA-approved, and similar);
- **Change:** `mock_images` is true;
- **Change (clones):** residue score below `LP_RESIDUE_MIN_SCORE` (default 85) or any source-brand mention in visible text.

The user can override with an explicit confirmation dialog that lists the blocking reasons. Overrides are recorded in `publications` with user id and reasons. (`mock_images` cannot be overridden.)

### 12.2 Export (job `export`)

Inline every asset as a data URI and every stylesheet into `<style>`; strip editor attributes (`data-lp-*` except those needed at runtime); write `export/index.html`. Offer as an HTML download.

### 12.3 Vercel (job `publish_vercel`) *(ref + changes)*

- Org connects Vercel with a token (stored in Vault) and optional team id.
- Upload files to `/v2/files` with SHA-1 digests, then create a production deployment via `/v13/deployments`, no framework.
- Project naming: one Vercel project per **brand** (`lp-<brand-prefix>`) with one deployment per publish, rather than one project per build. **Change:** the reference made a project per build; that does not scale.
- **Change:** wait until the deployment is READY (poll), and record the URL in `publications`. The reference recorded nothing.

### 12.4 Shopify connection *(ref)*

- Per brand. v1 uses a **custom app per store** (the store owner creates a custom app or the org duplicates its own app); the org saves the client id and secret, which go to Vault.
- **Connect** → `/shopify/install` → Shopify authorise URL with scopes `read_products,read_content,write_content,read_themes,write_themes,write_files`. **Change:** the reference requested no `write_files` while its CDN code needed it; request it explicitly.
- `/shopify/callback`: verify `state` (stored in the `oauth_states` table with 10-minute expiry — **Change:** not in memory), HMAC, and that the shop matches the saved domain; exchange the code for an offline token; save to Vault.
- Publishing resolves credentials from Vault only. No environment-variable fallback.

### 12.5 Shopify static draft page (job `publish_shopify_page`) *(ref)*

1. Keep the page's `<style>` blocks and inner body inside `div.lp-funnel`; drop scripts.
2. Offload assets to the Shopify Files CDN (distinct files ≥ 8 KB, up to 80): `stagedUploadsCreate` → multipart upload → one batched `fileCreate` → poll until READY → rewrite references. A file that never becomes ready stays as its `assets` URL.
3. If the body is still over 512 KB, move CSS into one CDN file; if still too big, fail with a clear message.
4. Best effort: write a bare layout, a full-width section and a page template into the main theme.
5. Create an **unpublished** page with handle = build key, using the full-width template when installed.
6. Record in `publications`.

### 12.6 Shopify editable sections (job `publish_shopify_editable`) — M4 *(ref)*

Turns a build into native theme sections where every text node and image is an individually editable block.

1. Guards: domain, token, working HTML.
2. Offload images and fonts to Files CDN.
3. Version discovery: query pages with handle `<slug>-v*`, pick next number. Every push writes new files and a new draft page.
4. Structure planning (never raises):
   - load the editor map (no AI at push time);
   - render the original with Playwright at 1280×900, 768×1024 and 390×844, measuring element boxes at three scroll positions;
   - build a coarse baseline (top-level body children are sections);
   - up to 3 structured attempts: emit files, simulate the theme, compare boxes (tolerance 4 px or 1 % of width); on mismatch mark the offending wrapper unsplittable and retry;
   - parity still failing, Playwright missing, or resolver crash → coarse mode; the note says which mode shipped.
5. Emit files:
   - sections: map rules first, then heuristics that descend pure wrappers and keep forms and lists whole; max 24 sections, overflow merges into the last;
   - text blocks: each text leaf becomes a block of a role-named type (e.g. `lp-headline`, `lp-paragraph`), setting type `text`, `richtext` or `html` depending on what Shopify validation allows;
   - image blocks: each image becomes `lp-img-<role>` with src, srcset, sizes, alt, class, style, width, height, id, loading;
   - layout safety: each section wrapped in a clone of its ancestor chain so descendant CSS still matches; gaps, widths and sticky behaviour re-created per breakpoint;
   - CTA links: a section-level URL setting.
6. Size guards: section < 250,000 bytes; CSS asset < 1,000,000 bytes; template JSON < 200,000 bytes.
7. Upload in **two batches — order is critical**: first `themeFilesUpsert` with `blocks/*` only; then layout, CSS asset, sections, script section, template. Shopify validates a template's block settings against the schema as it stood before the batch and silently strips unknown keys, so schema changes must land first.
8. Draft page with handle `<slug>-v<N>` using the new template.
9. Result: `{version, page_id, sections, url, admin_url, editor_url, note, structure_mode}` recorded in `publications`.
- Shopify caps theme file keys at 50 characters: shorten long slugs to 15 characters + 6-character hash.
- Limits: 24 sections per template, 600 blocks per section (excess stays static, reported as `static_overflow`), section names ≤ 25 characters.

---

## 13. Compliance and residue gates

### 13.1 Compliance scan (both paths)

Deterministic phrase scanner over visible text and alt text, with categories and severities. High-risk (blocks publish): disease claims (cure, treat, prevent, diagnose, heal, reverse + a condition), "FDA approved/cleared", unqualified "clinically proven", guaranteed results/weight-loss amounts, fake urgency the owner flags later. Medium (warn): "doctor recommended", testimonials with specific outcomes, "#1", "best". Findings include the text, location (fragment id or selector) and reason. The phrase list lives in `engines/compliance_rules.py` so the owner can extend it. Optional later: an AI second pass.

### 13.2 Residue scan (clones only) *(ref)*

Reports; never changes the page. Counts: source brand name in visible text and alt text; foreign images (including CSS backgrounds); foreign links; inherited claims (FDA, clinically proven, cGMP, money-back guarantee, cure, guaranteed). Score = `max(0, 100 − 7 × total)`. **Change:** used as a publish gate (§12.1).

---

## 14. Analytics and ledger

- `/analytics`: spend per org over time, per brand, per template, per node kind (copy, vision, images, edits), average cost per build, builds per status.
- `/library`: every build (one card per build), filter by brand/template/status/origin, with its ledger entries.

---

## 15. Notifications

`notifications` table: one row per finished job for the user who created it (success or failure), with link to the build. Bell in the top bar with unread dot; mark read. Keep the newest 120 per user *(ref)*.

---

## 16. Testing strategy

- **Engines** (pure functions): fixture HTML in `tests/fixtures/`, expected outputs or stats in `tests/golden/`. Cover: fragment dump/reinject + drift, length budgets, structural protection, purge terms, recolour exact/hue, logo swap, variants, strip chrome, media slots, finalize steps, scrubbers, link rewrite, foreign asset purge, residue score, compliance scan, section reorder/remove/duplicate, export inlining.
- **Providers:** fakes with recorded responses. Mock image mode returns a drawn "MOCK IMAGE" JPEG of the requested size. **No live network in tests.**
- **Pipeline:** end-to-end graph test on one owned fixture and one cloned fixture with fake providers; asserts node order (owned skips clone nodes), report shape, zero residue on the clone fixture.
- **Web:** component tests for wizard validation, grouped list, section editor reorder; Playwright e2e for sign-in → create brand → build (mock) → review → export.
- **Smoke script:** `scripts/smoke-build <template> <brand> [--mock-images]` runs one build through the same code path as the UI *(ref)*.

---

## 17. Non-goals for v1

- Blank-canvas block builder (v3).
- A/B testing, analytics on published pages, traffic splitting.
- Custom domains managed in-app (users configure domains in Vercel/Shopify).
- Ad creative generation, media buying, billing (other tools in the reference codebase; out of scope).
- Public Shopify App Store listing.
- Real-time collaborative editing.
