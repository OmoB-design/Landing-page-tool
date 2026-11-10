-- B7.2a (D146): a brand's offers. An offer is the deal a page sells: a name the team knows it by,
-- a price change (none, a percent off or an amount off the store's current price, as a Shopify
-- discount code applies at checkout), how the customer gets it (a discount code, or applied
-- automatically at checkout), the promo line and details for the copy. One offer per brand can be
-- the default for new pages. Offers are archived, never deleted, so pages that used one keep it.
create table public.offers (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.orgs(id) on delete cascade,
  brand_id      uuid not null references public.brands(id) on delete cascade,
  name          text not null check (char_length(btrim(name)) between 1 and 60),
  price_change  text not null default 'none' check (price_change in ('none', 'percent', 'amount')),
  price_value   numeric(10, 2),
  checkout      text not null default 'none' check (checkout in ('none', 'code', 'automatic')),
  code          text check (code is null or char_length(code) between 1 and 40),
  promo_text    text check (promo_text is null or char_length(promo_text) <= 120),
  details       text check (details is null or char_length(details) <= 500),
  is_default    boolean not null default false,
  archived_at   timestamptz,
  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint offers_price check (
    (price_change = 'none' and price_value is null)
    or (price_change = 'percent' and price_value > 0 and price_value < 100)
    or (price_change = 'amount' and price_value > 0)
  ),
  constraint offers_code check ((checkout = 'code') = (code is not null)),
  constraint offers_default_live check (not (is_default and archived_at is not null))
);
create unique index offers_one_default_idx on public.offers (brand_id) where is_default;
create index offers_brand_idx on public.offers (org_id, brand_id);
create trigger offers_updated before update on public.offers
  for each row execute function set_updated_at();

-- Members read their org's offers and write only what the Offers tab writes (as D127 for brands);
-- the worker (service role) reads them for builds.
alter table public.offers enable row level security;
create policy offers_rw on public.offers for all
  using (is_org_member(org_id))
  with check (
    is_org_member(org_id)
    and exists (select 1 from public.brands b where b.id = brand_id and b.org_id = offers.org_id)
  );
revoke insert, update, delete on public.offers from authenticated;
grant insert (
  org_id, brand_id, created_by, name, price_change, price_value, checkout, code, promo_text,
  details, is_default
) on public.offers to authenticated;
grant update (
  name, price_change, price_value, checkout, code, promo_text, details, is_default, archived_at
) on public.offers to authenticated;

-- Make default in one step: the brand's old default stops being it as the new one starts (the
-- unique index allows one at a time). Runs as the member, so RLS still keeps it to their org.
create or replace function public.make_default_offer(target uuid) returns void
language plpgsql security invoker set search_path = public as $$
declare b uuid;
begin
  select brand_id into b from offers where id = target and archived_at is null;
  if b is null then raise exception 'offer not found' using errcode = 'P0002'; end if;
  update offers set is_default = false where brand_id = b and is_default and id <> target;
  update offers set is_default = true where id = target;
end $$;
revoke execute on function public.make_default_offer(uuid) from public, anon;
grant execute on function public.make_default_offer(uuid) to authenticated;

-- A page's offer: the one it was built with (null when none), and that offer as the page shows it
-- (name, price change, checkout, code, promo line, details), so editing an offer later never
-- changes a page by itself (B7.4 asks first).
alter table public.builds
  add column offer_id uuid references public.offers(id) on delete set null,
  add column offer jsonb;
create index builds_offer_idx on public.builds (offer_id) where offer_id is not null;

-- Brands that had a Sale percent or Promo text (Brand DNA, before offers) get them as their
-- default offer, "Current offer", and their pages are linked to it (owner, 2026-11-10).
insert into public.offers (org_id, brand_id, name, price_change, price_value, promo_text,
                           is_default, created_by)
select org_id, id, 'Current offer',
       case when coalesce(sale_percent, 0) between 1 and 99 then 'percent' else 'none' end,
       case when coalesce(sale_percent, 0) between 1 and 99 then sale_percent end,
       nullif(btrim(coalesce(promo_text, '')), ''), true, created_by
from public.brands
where coalesce(sale_percent, 0) between 1 and 99 or nullif(btrim(coalesce(promo_text, '')), '') is not null;

-- Linking them isn't a change to the page: "last updated" (and so the Pages order) stays.
alter table public.builds disable trigger builds_updated;
update public.builds b
set offer_id = o.id,
    offer = jsonb_build_object(
      'id', o.id, 'name', o.name, 'price_change', o.price_change, 'price_value', o.price_value,
      'checkout', o.checkout, 'code', o.code, 'promo_text', o.promo_text, 'details', o.details)
from public.offers o
where o.brand_id = b.brand_id and o.is_default;
alter table public.builds enable trigger builds_updated;
