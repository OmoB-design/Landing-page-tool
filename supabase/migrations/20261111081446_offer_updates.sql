-- B7.4 (D149): updating every page that sells an offer once the offer is edited.
--
-- offer_out_of_date: whether a page's record of its offer (builds.offer: the offer as it was when
-- the page was made, or last changed, to sell it) says something the offer no longer does. Only
-- what reaches the page counts: the price change and its amount, how the customer gets it, the
-- code, the promo line and the details. The name is the team's label (the lists show the offer's
-- current one), so a rename leaves pages up to date. The one definition: the Offers tab reads it
-- through brand_offer_usage, the worker uses it for the pages to update.
--
-- brand_offer_usage: for each offer of a brand, the pages selling it (not in Trash), how many are
-- out of date, and how many are being updated now (an offer change queued or running on them).
--
-- build_snapshots.offer: the page's offer record before the change this undo step takes back
-- ({"offer_id": …, "offer": …}), so Undo puts the old offer back with the old page; on a Redo row,
-- the record Redo puts back. Null: that change didn't touch the offer.

alter table public.build_snapshots add column offer jsonb;

comment on column public.build_snapshots.offer is
  'B7.4: the page''s offer record ({"offer_id", "offer"}) Undo (or, on a redo row, Redo) puts back with the page; null when the change didn''t touch the offer.';

create or replace function public.offer_out_of_date(page_offer jsonb, current_offer public.offers)
returns boolean
language sql immutable set search_path = public as $$
  select page_offer is null
    or (page_offer->>'price_change') is distinct from current_offer.price_change
    or nullif(btrim(page_offer->>'price_value'), '')::numeric
       is distinct from current_offer.price_value
    or (page_offer->>'checkout') is distinct from current_offer.checkout
    or coalesce(btrim(page_offer->>'code'), '') <> coalesce(btrim(current_offer.code), '')
    or coalesce(btrim(page_offer->>'promo_text'), '') <> coalesce(btrim(current_offer.promo_text), '')
    or coalesce(btrim(page_offer->>'details'), '') <> coalesce(btrim(current_offer.details), '')
$$;

create or replace function public.brand_offer_usage(brand uuid)
returns table (offer_id uuid, pages int, out_of_date int, updating int)
language sql stable security invoker set search_path = public as $$
  select o.id,
         count(b.id)::int,
         (count(b.id) filter (where public.offer_out_of_date(b.offer, o)))::int,
         (count(b.id) filter (where exists (
            select 1 from public.jobs j
            where j.build_id = b.id and j.kind = 'offer_apply'
              and j.status in ('queued', 'running'))))::int
  from public.offers o
  join public.builds b on b.offer_id = o.id and b.deleted_at is null
  where o.brand_id = brand
  group by o.id
$$;

revoke execute on function public.offer_out_of_date(jsonb, public.offers) from public, anon;
grant execute on function public.offer_out_of_date(jsonb, public.offers) to authenticated;
revoke execute on function public.brand_offer_usage(uuid) from public, anon;
grant execute on function public.brand_offer_usage(uuid) to authenticated;
