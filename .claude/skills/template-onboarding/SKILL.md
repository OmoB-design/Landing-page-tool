---
name: template-onboarding
description: How to take a landing-page template to production quality in LP Platform — either a curated library template the owner designed (HTML handed over or built from Figma) or a cloned competitor page after analysis. Covers the data-lp-* markup contract, template.json, instructions.json (length caps, keep/generic images, forbidden terms), smoke builds, visual review and sign-off. Use this skill whenever adding, converting, fixing, tuning or reviewing a template, when the owner hands over a page design for the library, or when a build from a template shows copy warnings, image warnings or residue.
---

# Template onboarding

A template is only as good as its markup contract and its instructions. The pipeline is generic; templates make it reliable. Do this for every library template, and for any cloned template that will be built more than once.

## The markup contract (library templates)

Library templates are authored HTML (from the owner, or built from his Figma frames). They must follow this contract so the pipeline needs no guessing:

| Attribute | On | Meaning |
|---|---|---|
| `data-lp-section="<key>"` | each top-level section | unit of reorder/remove/duplicate; keys unique, kebab-case |
| `data-lp-role="<role>"` | same element | one of: hero, problem, mechanism, benefits, ingredients, social_proof, testimonials, comparison, offer, guarantee, faq, cta, footer_cta, other |
| `data-lp-logo` | logo `<img>` | swapped for the brand logo |
| `data-lp-product` | product image `<img>` | replaced with the real product photo |
| `data-lp-scene` | lifestyle/scene `<img>` or `.lp-media-slot` | regenerated (or product photo if AI images off) |
| `data-lp-person` | avatar/headshot `<img>` | regenerated person |
| `data-lp-keep` | UI graphics (stars, ticks, badges) | kept as-is |
| `data-lp-variants` | variant picker container | regenerated per product variant: its first `data-lp-variant` unit is cloned per option (up to 8), filling `data-lp-variant-name`, `data-lp-variant-price` and an optional `img[data-lp-variant-image]` |
| `data-lp-cta` | CTA links/buttons | href set to the product/CTA URL |
| `data-lp-lock` | any text element | protected from copy rewrite (legal lines, fixed labels) |
| `data-lp-price`, `data-lp-sale-price` | price text | the price the customer pays now (the sale price when on sale) |
| `data-lp-compare-price` | struck-through price | the regular price when on sale; removed otherwise (B0.6a) |
| `data-lp-brand`, `data-lp-product-name` | inline text | replaced with the brand / product name (B0.6a) |
| `data-lp-usps` | list of selling points | each child is a row, cloned per product USP (up to 6); text goes in `data-lp-usp-text` if present, so icons stay (B0.6a) |
| `data-lp-sale-percent` | discount label | the brand's sale percent; removed when the brand has none (B0.6a) |
| `data-lp-promo` | promo line | the brand's promo text; a promo holding a `data-lp-sale-percent` is removed when there is no sale, and its section too if left empty (B0.6a) |
| `data-lp-sale-only` | any element (e.g. a sale bar) | removed when the brand has no sale (B1.1a, D64) |
| `data-lp-number` | an item number ("1", "01") | renumbered in page order after sections are reordered, removed or duplicated; zero-padding kept (B1.1a, D64) |
| `data-lp-alternate="<class>"` | container of numbered sections | every other numbered section gets `<class>` (alternating photo sides) (B1.1a, D64) |

Styling rules for library templates:
- Brand colours as CSS custom properties on `:root`: `--lp-primary`, `--lp-primary-dark`, `--lp-tint`, `--lp-accent`, `--lp-heading-font`, `--lp-body-font`. Recolour becomes a variable swap.
- Text on a brand colour uses `--lp-on-primary`, `--lp-on-accent` or `--lp-on-dark` (declare them on `:root`; recolour sets each to black or white, whichever reads better). Never hard-code white text on a brand colour: some brands' primary is cream.
- Top-level sections can sit in different containers (e.g. `<main>`), but they only reorder within their container.
- Self-contained: no external scripts. Fonts and images as relative files in `assets/` (the seed script uploads them to the public `library-assets` bucket and rewrites the links, D62). Free fonts may be linked from Google Fonts; never ship commercial font files.
- Mobile-first; test at 390 px and 1280 px.
- Plain semantic HTML; minimal JavaScript (native `<details>` for FAQ).

## Folder layout

```
templates/library/<slug>/
├── index.html
├── template.json        # name, type, description, source_palette, sections[{key, role, label, removable, duplicable}]
├── instructions.json    # see BUILD_SPEC §8.5
├── thumb.png            # optional 800x600 gallery thumbnail (otherwise the seed script renders one)
└── assets/              # images, fonts referenced relatively
```

`template.json` example:

```json
{
  "slug": "advertorial-classic",
  "name": "Classic advertorial",
  "type": "advertorial",
  "description": "Editorial story with expert byline, problem, mechanism, product reveal, testimonials, offer.",
  "source_palette": { "primary": "#1f6feb", "dark": "#0b3d91", "tint": "#e8f0fe", "accent": "#f5a623" },
  "sections": [
    { "key": "hero", "role": "hero", "label": "Headline & byline", "removable": false, "duplicable": false },
    { "key": "problem", "role": "problem", "label": "The problem", "removable": true, "duplicable": false },
    { "key": "testimonials", "role": "testimonials", "label": "Customer stories", "removable": true, "duplicable": true }
  ]
}
```

Add `"status": "retired"` to hide a template from the gallery without breaking builds made from it.

## Steps

### 0. Clean
- Library: validate the markup contract; every top-level section tagged; no external URLs (`grep -E "https?://"` should only hit intentional links).
- Clone: hand-fix broken URLs, hidden SVG sprites, skip links, and sections the build will always strip.

### 1. Stats
Run `scripts/template-stats <slug> [--caps]` (build it at B1.1 if missing). It reports: missing files, images by host and by `data-lp-*` role, media slots, scripts, size, sections found vs declared, untagged top-level blocks, and per-context text lengths. `--caps` prints starter `length_caps`.

### 2. Sections
- Library: `template.json` sections must match `data-lp-section` keys exactly.
- Clone: review the AI-proposed sections from analysis; fix boundaries and roles; repeat step 1 until no untagged top-level blocks remain.

### 3. Instructions
Write `instructions.json`:
- `length_caps` at the template's current maximum per context **plus 10–15 %**;
- `keep_images` for UI graphics not already marked `data-lp-keep`;
- `generic_images` for images that should be an unbranded scene;
- `forbidden_terms` (clones: the source brand name, its product names, its claims);
- `copy_rules` for the template's voice ("short punchy subheads", "keep the numbered list format");
- `image_rules` ("hero scene: bathroom shelf, morning light");
- `notes` for quirks.
A test (`tests/test_template_caps.py`) checks each template's own copy fits its caps.

### 4. Smoke build
`pnpm smoke:build --email <you> --brand <name> --template <slug>` with the dev servers in mock mode (`LP_MOCK_LLM=1 pnpm dev`, free) then, with the owner's go, one real-images build ($1–3).
Pass criteria: copy rewritten ≥ 80 % of eligible fragments, no copy error, no image warning, residue score 100 for clones, zero compliance high-risk findings.

### 5. Visual review
Full-page screenshots at 1280 px and 390 px (Playwright). Compare with the source (clone) or the Figma frame (library). Fixes go in a `<style id="lp-template-fixes">` block in the template, or in `keep_images`/instructions — never in the pipeline code for one template.

### 6. Editor map (M4 only)
Write or fix the Shopify editor map; run the parity check across three viewports.

### 7. Sign-off
- Library: run `pnpm seed:library <slug>` (renders the thumbnail; `--no-thumbnails` skips it); confirm it appears on Templates → Library with its thumbnail and section count, and that Preview matches the source.
- Record quirks in `instructions.json` `notes`, and any new hazard in `docs/TEMPLATE_GUIDE.md`.
- Report using the `milestone-build` report structure, including the screenshots' paths and the smoke-build stats.

## Handover option 1: a design in Figma

1. Get the Figma frame URL. Pull design context and screenshot through the Figma MCP (read-only; never create or edit Figma files without asking).
2. Build the template HTML to the markup contract (not as React; templates are plain HTML).
3. Map Figma colours to the `--lp-*` variables; everything else static.
4. Export images from Figma into `assets/`.
5. Continue from step 1 above.

## Handover option 2: a live website (D61)

1. Import it (from `services/worker`): `uv run python -m app.cli.import_template <url> <slug> --type <type> --name "<name>"`. It writes `templates/library/<slug>/` with `index.html`, `assets/` and draft JSON files, and prints what it removed (CSS rules, scripts, fonts) and the page size. It refuses an existing folder.
2. Keep a copy of the imported `index.html` (e.g. `<slug>.imported.html` in your scratchpad) so the markup step can be re-run from it.
3. Add the markup: `data-lp-section`/`data-lp-role` on each top-level block, image slots (`data-lp-product`, `-scene`, `-person`, `-logo`, `-keep`), `data-lp-cta`, prices, brand/product name slots, numbers, sale-only blocks. Do it with a small script (BeautifulSoup) rather than by hand, so it can be re-run when the import changes.
4. Call `engines.template_import.apply_template_tokens(html, palette=..., heading_fonts=..., body_fonts=...)` to declare the `--lp-*` tokens, point font stacks at `--lp-heading-font` / `--lp-body-font`, and turn white text on palette colours into `--lp-on-*`. Check the result for split CSS rules it can't see (see TEMPLATE_GUIDE) and fix them in `<style id="lp-template-fixes">`.
5. Fill `template.json` (sections in page order, `source_palette`) and `instructions.json` (`forbidden_terms` with the source brand and store names; `notes` for anything like timers).
6. Visual check: screenshot the live site and the template at 1280 px and 390 px; page heights should match within a few pixels (a stand-in font can shift text slightly).
7. Continue from step 1 above.
