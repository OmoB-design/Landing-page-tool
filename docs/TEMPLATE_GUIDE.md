# TEMPLATE_GUIDE.md — template hazards and lessons

Append hazards discovered while onboarding templates (see .claude/skills/template-onboarding/SKILL.md).
Seed entries carried from the reference tool:

- Shopify validates a template's block settings against the block schema as it stood *before* the
  upload batch and silently strips unknown keys: upload `blocks/*` first, everything else second.
- Shopify theme file keys max 50 characters: shorten slugs (15 chars + 6-char hash).
- Text with no letters (countdowns, "4.8", "12,000+") is never a copy fragment; it cannot be
  rewritten by copy or the editor. Put changeable numbers in text with letters or mark them as
  data-lp-price.
- Shopify Markets localises prices to the requester's country if Accept-Language is sent; omit it
  on product pulls.
- Bot-wall detection must not match the bare word "captcha": Shopify themes ship
  `data-nocaptcha` in their scripts, so healthy pages (allbirds.com, graza.co, 2026-10-08) would be
  rejected. Match the markers in the page title or visible text, or only on small pages.
- HTML parsers lowercase SVG names (`viewBox` → `viewbox`, `linearGradient` → `lineargradient`),
  which breaks inline SVG. Re-serialise with the camelCase names restored
  (`engines/brand_extract.svg_markup`) before storing or re-emitting an inline SVG.
- Text on a brand colour must use the `--lp-on-*` tokens, not white: Allbirds' primary is cream
  (#ece9e2), so a badge with `color: #fff` on `--lp-primary` became unreadable (B0.6a test
  template, 2026-10-09).
- A promo line written around a discount ("30% off today only") reads broken once the discount is
  removed for a brand with no sale; wrap the whole promo in `data-lp-promo` so it goes as a unit.
- The hue sweep leaves slate and blue-grey text colours alone (saturation under 0.35), but any
  clearly blue element in the template moves to the brand hue. Use `data-lp-keep` or a neutral for
  colours that must not follow the brand.
- Sites exported from site builders (Webflow and similar) embed their fonts as base64
  `@font-face` blocks, often commercial ones (Gilroy, Circular, Interdisplay). The importer drops
  them; it links the free families from Google Fonts and swaps the rest for free stand-ins, which
  can shift text a few pixels (molether listicle: −19 px over the page, B1.1a).
- Exported stylesheets carry thousands of rules for pages that don't exist (molether: a few hundred
  KB of CSS for one page). The importer prunes rules whose selectors match nothing; it keeps
  `@keyframes`, `@font-face` and rules with pseudo states whose base selector matches.
- Wrapping blocks in a new element (e.g. a section wrapper) stops vertical margins collapsing
  between siblings and inside flex columns (+50 px gaps on the molether advertorial). Only add
  wrappers where needed, and copy the parent's layout onto them (`display:flex;
  flex-direction:column; row-gap:inherit`).
- White text on a brand colour is often split over two rules (`.button{color:#fff}` in one place,
  its background in another, or a background set on a parent). `apply_template_tokens` only sees
  colour and background in the same rule; check every brand-coloured element with a light primary
  and fix the rest in `<style id="lp-template-fixes">`.
- A countdown that resets at midnight is a script; the app's preview runs no scripts (sandboxed),
  so it shows its starting text there and ticks in exports. Note such scripts in
  `instructions.notes`.
- Item numbers ("1"…"10") and alternating photo sides go stale when sections move: mark them
  with `data-lp-number` and `data-lp-alternate` (D64) instead of numbering by hand.
- Content left between sections can't be moved or removed with them: the molether advertorial's
  closing "bottom line" paragraphs, benefits list and Shop button sat outside every section until
  the editor's Issues tab flagged them (B1.1b). Wrap such blocks as their own section, or mark page
  frame (progress bars, side rails) `data-lp-fixed`.
- A section that sits in a different container from its neighbours can only move among the
  sections in that container. Keep the reorderable middle of a page in one container.

