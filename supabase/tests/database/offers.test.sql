-- Offers (B7.2a, D146): a member reads and writes their org's offers through the Offers tab's
-- fields only, never another org's, one default per brand (Make default swaps it in one step),
-- and the rules on price changes and codes hold.
-- Run with: pnpm test:db  (runs on the linked cloud project; everything rolls back at the end)
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-0000000000d1', 'dora@example.test', '{"full_name": "Dora"}'),
  ('00000000-0000-4000-8000-0000000000d2', 'eli@example.test', '{"full_name": "Eli"}');

create temp table ids on commit drop as
select (select org_id from org_members where user_id = '00000000-0000-4000-8000-0000000000d1') as mine,
       (select org_id from org_members where user_id = '00000000-0000-4000-8000-0000000000d2') as theirs;
grant select on ids to authenticated;

insert into brands (org_id, name, prefix) select mine, 'Fern', 'FRN' from ids;
insert into brands (org_id, name, prefix) select theirs, 'Other', 'OTH' from ids;
insert into offers (org_id, brand_id, name, is_default)
select b.org_id, b.id, 'Their offer', true from brands b, ids where b.org_id = ids.theirs;
-- Their brand's id, which Dora can't look up herself.
create temp table other on commit drop as select id from brands where prefix = 'OTH';
grant select on other to authenticated;

set local role authenticated;
set local request.jwt.claims to '{"sub": "00000000-0000-4000-8000-0000000000d1", "role": "authenticated"}';

select lives_ok(
  $$ insert into offers (org_id, brand_id, created_by, name, price_change, price_value, checkout,
       code, promo_text, details, is_default)
     select b.org_id, b.id, '00000000-0000-4000-8000-0000000000d1', '20% off', 'percent', 20,
       'code', 'SAVE20', 'Summer: 20% off', 'Free shipping over $50', true
     from brands b where b.prefix = 'FRN' $$,
  'a member can add an offer to their brand');
select lives_ok(
  $$ insert into offers (org_id, brand_id, name, price_change, price_value, checkout)
     select b.org_id, b.id, 'Ten off', 'amount', 10, 'automatic' from brands b where b.prefix = 'FRN' $$,
  'an amount off applied at checkout');
select is((select count(*)::int from offers), 2, 'a member sees only their org''s offers');
select throws_ok(
  $$ insert into offers (org_id, brand_id, name)
     select ids.mine, other.id, 'Sneaky' from ids, other $$,
  '42501', null, 'not on another org''s brand');
select throws_ok(
  $$ insert into offers (org_id, brand_id, name) select ids.theirs, b.id, 'Sneaky'
     from ids, brands b where b.prefix = 'FRN' $$,
  '42501', null, 'not into another org');
select throws_ok(
  $$ insert into offers (org_id, brand_id, name, price_change) select b.org_id, b.id, 'Odd', 'percent'
     from brands b where b.prefix = 'FRN' $$,
  '23514', null, 'a percent off needs its percent');
select throws_ok(
  $$ insert into offers (org_id, brand_id, name, price_change, price_value) select b.org_id, b.id,
       'Too much', 'percent', 100 from brands b where b.prefix = 'FRN' $$,
  '23514', null, 'a percent off is under 100');
select throws_ok(
  $$ insert into offers (org_id, brand_id, name, checkout) select b.org_id, b.id, 'No code', 'code'
     from brands b where b.prefix = 'FRN' $$,
  '23514', null, 'a discount code needs the code');
select throws_ok(
  $$ insert into offers (org_id, brand_id, name, is_default) select b.org_id, b.id, 'Second', true
     from brands b where b.prefix = 'FRN' $$,
  '23505', null, 'one default per brand');

select lives_ok($$ select make_default_offer((select id from offers where name = 'Ten off')) $$,
                'Make default');
select is((select name from offers where is_default), 'Ten off', 'the new default replaces the old');
select isnt_empty(
  $$ update offers set archived_at = now(), is_default = false where name = '20% off' returning id $$,
  'a member can archive an offer');
select throws_ok($$ update offers set brand_id = brand_id where name = 'Ten off' $$, '42501', null,
                 'an offer can''t move to another brand');
select throws_ok($$ delete from offers where name = 'Ten off' $$, '42501', null,
                 'offers are archived, not deleted');

select * from finish();
rollback;
