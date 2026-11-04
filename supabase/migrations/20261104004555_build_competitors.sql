-- B2.4a: the Top 5 ranking builder's competitors (BUILD_SPEC §8.7, D53, D102).
--
-- The four competitor product pages a ranking build compares against, pulled when the build runs.
-- Stored per build, never as the brand's products. Ranks 2 to 5 follow the order the user gave;
-- a page that couldn't be read keeps its row with status 'failed' and the reason. `label` is the
-- neutral name the page shows ("Brand B") unless the build uses real names; `image_asset_id` is
-- set only then (with neutral names the page shows a plain silhouette, not their photo).
-- Written by the worker only (service role); members read their org's rows.

create table build_competitors (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references orgs(id) on delete cascade,
  build_id        uuid not null references builds(id) on delete cascade,
  rank            smallint not null check (rank between 2 and 5),
  url             text not null,
  status          text not null check (status in ('pulled', 'failed')),
  error           text,
  label           text not null,
  name            text,
  vendor          text,
  currency        text,
  price           numeric(12, 2),
  sale_price      numeric(12, 2),
  image_asset_id  uuid references assets(id) on delete set null,
  summary         text,
  claims          jsonb not null default '[]',
  rating          numeric(3, 2),
  rating_best     numeric(4, 2),
  rating_count    int,
  reviews         jsonb not null default '[]',
  pull_source     text,
  warnings        jsonb not null default '[]',
  pulled_at       timestamptz not null default now(),
  unique (build_id, rank)
);
create index build_competitors_org on build_competitors(org_id);

alter table build_competitors enable row level security;
grant select on build_competitors to authenticated;
create policy build_competitors_select on build_competitors for select using (is_org_member(org_id));
