-- Member write limits (B5.3, D127).
-- A signed-in member writes only what the app's own forms write: a new brand, the Brand DNA
-- form's fields, the product form's fields, and a template's name and description. Everything
-- else (trash, review, versions, sections, assets, strategy, template files) is the worker's.
-- Run with: pnpm test:db  (runs on the linked cloud project; everything rolls back at the end)
begin;
create extension if not exists pgtap with schema extensions;
select plan(29);

-- A sign-up (the on_auth_user_created trigger makes her org) and fixtures written as the platform.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-0000000000c1', 'cleo@example.test', '{"full_name": "Cleo"}');

create temp table ids on commit drop as
select org_id as org from org_members where user_id = '00000000-0000-4000-8000-0000000000c1';
grant select on ids to authenticated;

insert into brands (org_id, name, prefix) select org, 'Velo', 'VEL' from ids;
insert into products (org_id, brand_id, handle, name)
select b.org_id, b.id, 'bottle', 'Bottle' from brands b, ids where b.org_id = ids.org;
insert into templates (org_id, origin, slug, name, type, html_path)
select org, 'owned', 'velo-page', 'Velo page', 'advertorial', org::text || '/velo/index.html' from ids;
insert into template_sections (template_id, key, label, position)
select t.id, 'hero', 'Hero', 0 from templates t, ids where t.org_id = ids.org;
insert into storage.objects (bucket_id, name) select 'templates', org::text || '/velo/index.html' from ids;

-- ── As Cleo (a member of her own org) ──────────────────────────────────────
set local role authenticated;
set local request.jwt.claims to '{"sub": "00000000-0000-4000-8000-0000000000c1", "role": "authenticated"}';

-- What the app's forms do still works.
select lives_ok(
  $$ insert into brands (org_id, created_by, name, prefix, emoji, url, tagline, positioning,
       audience, brand_context, voice, voice_examples, language, cta_text, palette, fonts,
       sale_percent, promo_text, support_email, meta_title, meta_description, monthly_budget_usd)
     select org, '00000000-0000-4000-8000-0000000000c1', 'Nova', 'NOV', null, 'https://nova.test',
       'Tag', null, null, null, 'Warm', '{}', 'en', 'Shop now', '{}', '{}', 20, null,
       'hi@nova.test', null, null, 50 from ids $$,
  'a member can add a brand with the Brand DNA form''s fields');
select isnt_empty(
  $$ update brands set name = 'Velo Co', voice = 'Bright', palette = '{"primary": "#112233"}',
       monthly_budget_usd = 100 where prefix = 'VEL' returning id $$,
  'a member can edit the Brand DNA form''s fields');
select isnt_empty(
  $$ update products set name = 'Big bottle', price = 30, sale_price = 24, usps = '[]',
       selling_context = 'Gift' where handle = 'bottle' returning id $$,
  'a member can edit the product form''s fields');
select isnt_empty(
  $$ update templates set name = 'Velo advertorial', description = 'Summer'
     where slug = 'velo-page' returning id $$,
  'a member can rename a template and change its description');
select is((select count(*)::int from storage.objects where bucket_id = 'templates'), 1,
          'a member can still read the org''s template files');

-- Brands: no trash, counters, generated fields or deletes.
select throws_ok($$ update brands set deleted_at = now() where prefix = 'VEL' $$, '42501', null,
                 'a member cannot trash a brand directly (the worker does)');
select throws_ok($$ update brands set next_build_number = 1 where prefix = 'VEL' $$, '42501', null,
                 'a member cannot reset a brand''s page numbers');
select throws_ok($$ update brands set brand_md = 'x' where prefix = 'VEL' $$, '42501', null,
                 'a member cannot write a brand''s generated profile');
select throws_ok($$ update brands set org_id = org_id where prefix = 'VEL' $$, '42501', null,
                 'a member cannot move a brand to another org');
select throws_ok($$ delete from brands where prefix = 'VEL' $$, '42501', null,
                 'a member cannot delete a brand row');

-- Products: added by the worker's pull; only the form's fields are editable.
select throws_ok(
  $$ insert into products (org_id, brand_id, handle, name)
     select org_id, id, 'cup', 'Cup' from brands where prefix = 'VEL' $$,
  '42501', null, 'a member cannot add a product row directly (the worker pulls it)');
select throws_ok($$ update products set deleted_at = now() where handle = 'bottle' $$, '42501', null,
                 'a member cannot trash a product directly');
select throws_ok($$ update products set images = '[]' where handle = 'bottle' $$, '42501', null,
                 'a member cannot rewrite a product''s pulled pictures');
select throws_ok($$ update products set purged_at = null where handle = 'bottle' $$, '42501', null,
                 'a member cannot bring back an emptied product');
select throws_ok($$ delete from products where handle = 'bottle' $$, '42501', null,
                 'a member cannot delete a product row');

-- Templates: rename only.
select throws_ok($$ update templates set reviewed_at = now() where slug = 'velo-page' $$, '42501', null,
                 'a member cannot sign off a template''s review directly');
select throws_ok($$ update templates set blueprint = '{}' where slug = 'velo-page' $$, '42501', null,
                 'a member cannot rewrite a template''s blueprint');
select throws_ok($$ update templates set status = 'retired' where slug = 'velo-page' $$, '42501', null,
                 'a member cannot change a template''s status');
select throws_ok($$ update templates set deleted_at = now() where slug = 'velo-page' $$, '42501', null,
                 'a member cannot trash a template directly');
select throws_ok(
  $$ insert into templates (org_id, origin, slug, name, type, html_path)
     select org, 'owned', 'sneaky', 'Sneaky', 'advertorial', 'x.html' from ids $$,
  '42501', null, 'a member cannot add a template row directly');
select throws_ok($$ delete from templates where slug = 'velo-page' $$, '42501', null,
                 'a member cannot delete a template row');

-- Sections, versions, assets and strategy: read only.
select throws_ok(
  $$ insert into template_sections (template_id, key, label, position)
     select id, 'faq', 'FAQ', 1 from templates where slug = 'velo-page' $$,
  '42501', null, 'a member cannot add template sections directly');
select throws_ok($$ update template_sections set label = 'Top' where key = 'hero' $$, '42501', null,
                 'a member cannot change template sections directly');
select throws_ok(
  $$ insert into template_versions (template_id, version, html_path, sections)
     select id, 2, 'v2.html', '[]' from templates where slug = 'velo-page' $$,
  '42501', null, 'a member cannot add template versions directly');
select throws_ok(
  $$ insert into assets (org_id, path, sha256, mime, bytes) select org, 'a.png', 'x', 'image/png', 1 from ids $$,
  '42501', null, 'a member cannot write asset rows directly');
select throws_ok(
  $$ insert into product_strategy (org_id, product_id, kind, data)
     select org_id, id, 'briefing', '{}' from products where handle = 'bottle' $$,
  '42501', null, 'a member cannot write a product''s strategy directly');

-- Template files: read only.
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) select 'templates', org::text || '/velo/x.html' from ids $$,
  '42501', null, 'a member cannot upload template files');
select is_empty(
  $$ update storage.objects set metadata = '{}' where bucket_id = 'templates' returning id $$,
  'a member cannot change template files');
-- The Storage API turns this on for its own deletes; RLS then decides.
set local storage.allow_delete_query to 'true';
select is_empty(
  $$ delete from storage.objects where bucket_id = 'templates' returning id $$,
  'a member cannot delete template files');

select * from finish();
rollback;
