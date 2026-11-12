-- Offer updates (B7.4, D149): a page is out of date when its record of the offer says something
-- the offer no longer does (the price change, its amount, checkout, code, promo line, details),
-- whatever way the same values are written; a rename alone isn't. brand_offer_usage counts a
-- member's own pages only, without Trash, and the ones being updated now.
-- Run with: pnpm test:db  (runs on the linked cloud project; everything rolls back at the end)
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-0000000000e1', 'faye@example.test', '{"full_name": "Faye"}'),
  ('00000000-0000-4000-8000-0000000000e2', 'gus@example.test', '{"full_name": "Gus"}');

create temp table ids on commit drop as
select (select org_id from org_members where user_id = '00000000-0000-4000-8000-0000000000e1') as mine,
       (select org_id from org_members where user_id = '00000000-0000-4000-8000-0000000000e2') as theirs;
grant select on ids to authenticated;

insert into brands (org_id, name, prefix) select mine, 'Tanbark', 'TBK' from ids;
insert into brands (org_id, name, prefix) select theirs, 'Other', 'OTH' from ids;
insert into products (org_id, brand_id, handle, name)
select b.org_id, b.id, 'dome-bag', 'Dome Bag' from brands b, ids where b.org_id in (ids.mine, ids.theirs);
insert into templates (org_id, origin, slug, name, type, html_path)
select mine, 'owned', 'offer-page', 'Offer page', 'advertorial', mine::text || '/offer/index.html'
from ids;
insert into offers (org_id, brand_id, name, price_change, price_value, checkout, code, promo_text,
                    details)
select b.org_id, b.id, 'Ten off', 'amount', 10, 'code', 'TEN', 'Ten dollars off', null
from brands b, ids where b.org_id in (ids.mine, ids.theirs);

-- Pages: TBK-1 up to date (written as the worker records it: "10.00", an empty details line),
-- TBK-2 out of date (an older promo line), TBK-3 out of date but in Trash, TBK-4 up to date and
-- being updated now, OTH-1 another org's.
insert into builds (org_id, brand_id, product_id, template_id, template_version, key, origin,
                    title, wizard, status, offer_id, offer, deleted_at)
select b.org_id, b.id, p.id, t.id, 1, v.key, 'owned', 'Page', '{}', 'needs_review', o.id,
       jsonb_build_object('id', o.id, 'name', v.name, 'price_change', 'amount',
                          'price_value', '10.00', 'checkout', 'code', 'code', ' TEN',
                          'promo_text', v.promo, 'details', ''),
       v.deleted
from (values ('TBK-1', 'TBK', 'Ten off', 'Ten dollars off', null::timestamptz),
             ('TBK-2', 'TBK', 'Ten off', 'Autumn: ten off', null),
             ('TBK-3', 'TBK', 'Ten off', 'Autumn: ten off', now()),
             ('TBK-4', 'TBK', 'An older name', 'Ten dollars off', null),
             ('OTH-1', 'OTH', 'Ten off', 'Autumn: ten off', null))
     as v(key, prefix, name, promo, deleted)
join ids on true
join brands b on b.prefix = v.prefix and b.org_id in (ids.mine, ids.theirs)
join products p on p.brand_id = b.id
join offers o on o.brand_id = b.id
join templates t on t.slug = 'offer-page' and t.org_id = ids.mine;
insert into jobs (org_id, kind, payload, status, build_id)
select org_id, 'offer_apply', '{}', 'running', id from builds
where key = 'TBK-4' and org_id = (select mine from ids);

-- The check itself.
create temp table brand_ids on commit drop as
select (select id from brands where prefix = 'TBK' and org_id = (select mine from ids)) as mine,
       (select id from brands where prefix = 'OTH' and org_id = (select theirs from ids)) as theirs;
grant select on brand_ids to authenticated;
select ok(not offer_out_of_date(
  '{"price_change": "amount", "price_value": "10", "checkout": "code", "code": "TEN",
    "promo_text": "Ten dollars off"}', (select o from offers o where o.brand_id = (select mine from brand_ids))),
  '"10" and 10.00, a missing details line and none: the same offer');
select ok(not offer_out_of_date(
  '{"name": "Old name", "price_change": "amount", "price_value": "10.00", "checkout": "code",
    "code": "TEN ", "promo_text": " Ten dollars off", "details": null}', (select o from offers o where o.brand_id = (select mine from brand_ids))),
  'a rename and spaces around the words: still up to date');
select ok(offer_out_of_date(
  '{"price_change": "amount", "price_value": "15", "checkout": "code", "code": "TEN",
    "promo_text": "Ten dollars off"}', (select o from offers o where o.brand_id = (select mine from brand_ids))),
  'another amount: out of date');
select ok(offer_out_of_date(
  '{"price_change": "percent", "price_value": "10", "checkout": "code", "code": "TEN",
    "promo_text": "Ten dollars off"}', (select o from offers o where o.brand_id = (select mine from brand_ids))),
  'percent instead of an amount: out of date');
select ok(offer_out_of_date(
  '{"price_change": "amount", "price_value": "10", "checkout": "automatic",
    "promo_text": "Ten dollars off"}', (select o from offers o where o.brand_id = (select mine from brand_ids))),
  'applied at checkout instead of a code: out of date');
select ok(offer_out_of_date(
  '{"price_change": "amount", "price_value": "10", "checkout": "code", "code": "TEN",
    "promo_text": "Ten dollars off", "details": "Free shipping"}', (select o from offers o where o.brand_id = (select mine from brand_ids))),
  'other details: out of date');
select ok(offer_out_of_date(null, (select o from offers o where o.brand_id = (select mine from brand_ids))), 'no record: out of date');

set local role authenticated;
set local request.jwt.claims to '{"sub": "00000000-0000-4000-8000-0000000000e1", "role": "authenticated"}';

create temp table usage on commit drop as
select u.* from brand_offer_usage((select mine from brand_ids)) u;
select is((select count(*)::int from usage), 1, 'one row per offer in use');
select is((select pages from usage), 3, 'its pages, without Trash');
select is((select out_of_date from usage), 1, 'the one with the older promo line is out of date');
select is((select updating from usage), 1, 'the one being changed now');
select is_empty(
  $$ select * from brand_offer_usage((select theirs from brand_ids)) $$,
  'another org''s offer use stays hidden');

reset role;
select has_column('public', 'build_snapshots', 'offer', 'undo steps can hold an offer record');

select * from finish();
rollback;
