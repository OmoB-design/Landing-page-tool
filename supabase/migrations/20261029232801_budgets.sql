-- Brand AI budgets (B1.6b, D54, BUILD_SPEC §6.5) and the spend behind Library and Analytics.
--   brands.monthly_budget_usd  empty or 0 = no cap; checked before every paid call for the brand.
--   ledger_entries.brand_id    the brand a paid call was made for (from its page, or its job's
--                              brand or product), so a brand's spend is one query. Filled in below
--                              for the entries made before.
--   budget_notices             the 80 % and 100 % notices sent, once each per brand and month.

alter table brands
  add column monthly_budget_usd numeric(10,2)
    check (monthly_budget_usd is null or monthly_budget_usd >= 0);

alter table ledger_entries
  add column brand_id uuid references brands(id) on delete set null;

create index ledger_brand_time_idx on ledger_entries(brand_id, created_at)
  where brand_id is not null;

update ledger_entries l set brand_id = b.brand_id
from builds b
where l.build_id = b.id and l.brand_id is null;

update ledger_entries l set brand_id = br.id
from jobs j join brands br on br.id::text = j.payload->>'brand_id'
where l.job_id = j.id and l.brand_id is null;

update ledger_entries l set brand_id = p.brand_id
from jobs j join products p on p.id::text = j.payload->>'product_id'
where l.job_id = j.id and l.brand_id is null;

create table budget_notices (
  brand_id   uuid not null references brands(id) on delete cascade,
  org_id     uuid not null references orgs(id) on delete cascade,
  month      date not null,
  level      int not null check (level in (80, 100)),
  created_at timestamptz not null default now(),
  primary key (brand_id, month, level)
);
alter table budget_notices enable row level security;
create policy budget_notices_select on budget_notices for select using (is_org_member(org_id));

-- This calendar month's AI spend (UTC) per brand of an org: the Brands list and brand Overview.
-- Security invoker: row-level security on ledger_entries applies.
create or replace function brand_month_spend(p_org uuid)
returns table (brand_id uuid, spend_usd numeric)
language sql stable security invoker set search_path = public as $$
  select l.brand_id, coalesce(sum(l.cost_usd), 0)
  from ledger_entries l
  where l.org_id = p_org and l.brand_id is not null
    and l.created_at >= date_trunc('month', now() at time zone 'utc') at time zone 'utc'
  group by l.brand_id
$$;
