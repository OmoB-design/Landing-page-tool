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
