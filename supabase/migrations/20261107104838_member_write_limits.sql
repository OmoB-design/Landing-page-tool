-- B5.3 (D127): members write only what the app's own forms write.
--
-- Until now a signed-in member could write any column of brands, products and templates, and any
-- row of template_sections, template_versions, assets and product_strategy, straight through the
-- database API (RLS kept it to their own org, but not to the fields the app edits). The app never
-- needs that: the worker (service role) does everything else, through jobs that take snapshots,
-- check the rules and record costs. So members keep exactly the writes the website makes:
--   brands      create (Add brand) and edit the Brand DNA form's fields;
--   products    edit the product form's fields (products are added by the worker's pull);
--   templates   rename and describe (name, description);
-- and nothing else. Trash, restore, purge, review, versions, sections, assets and strategy stay
-- with the worker. Template files in storage stay readable; only the worker uploads them.
-- The service role is not affected (it bypasses grants and RLS).

revoke insert, update, delete on
  brands, products, templates, template_sections, template_versions, assets, product_strategy
from authenticated;

-- Add brand (lib/brands/actions.ts createBrand): the form's fields plus the org and the author.
grant insert (
  org_id, created_by,
  name, prefix, emoji, url, tagline, positioning, audience, brand_context, voice, voice_examples,
  language, cta_text, palette, fonts, sale_percent, promo_text, support_email, meta_title,
  meta_description, monthly_budget_usd
) on brands to authenticated;

-- Brand DNA form (updateBrand, lib/brands/form.ts formToRow).
grant update (
  name, prefix, emoji, url, tagline, positioning, audience, brand_context, voice, voice_examples,
  language, cta_text, palette, fonts, sale_percent, promo_text, support_email, meta_title,
  meta_description, monthly_budget_usd
) on brands to authenticated;

-- Product form (lib/products/actions.ts updateProduct, lib/products/form.ts productFormToRow).
grant update (
  name, url, currency, price, sale_price, description, usps, specs, selling_context
) on products to authenticated;

-- Template details (lib/templates/actions.ts saveTemplateDetails).
grant update (name, description) on templates to authenticated;

-- Template files: members read them (preview, thumbnails); the worker writes them.
drop policy if exists "templates: members insert" on storage.objects;
drop policy if exists "templates: members update" on storage.objects;
drop policy if exists "templates: members delete" on storage.objects;
