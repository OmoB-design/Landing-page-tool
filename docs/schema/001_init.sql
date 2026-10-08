-- 001_init.sql — LP Platform initial schema (DRAFT)
-- Target: Supabase Postgres. Copy into supabase/migrations/<timestamp>_init.sql at B0.2.
-- Claude Code: review, adjust, and report every change in the B0.2 Build Report.
--
-- Conventions
--   * uuid primary keys (gen_random_uuid()).
--   * every tenant table has org_id and RLS.
--   * the worker connects with the service role (bypasses RLS) and MUST filter by org_id itself.
--   * timestamps are timestamptz; updated_at maintained by trigger.

create extension if not exists pgcrypto;

-- ─────────────────────────────────────────────────────────────────────────────
-- Enums
-- ─────────────────────────────────────────────────────────────────────────────
create type member_role       as enum ('owner', 'admin', 'member');
create type template_origin   as enum ('owned', 'cloned');
create type template_status   as enum ('active', 'retired', 'analyzing', 'failed');
create type section_role      as enum ('hero','problem','mechanism','benefits','ingredients','social_proof',
                                       'testimonials','comparison','offer','guarantee','faq','cta','footer_cta','other');
create type build_status      as enum ('queued','building','needs_review','approved','published','failed');
create type job_status        as enum ('queued','running','succeeded','failed','cancelled');
create type event_level       as enum ('info','warn','error');
create type strategy_kind     as enum ('briefing','angles','comparison');
create type image_source      as enum ('original','product','generated','edited','uploaded','reused');
create type publish_dest      as enum ('export','vercel','shopify_page','shopify_editable');
create type publish_status    as enum ('pending','succeeded','failed');
create type ledger_kind       as enum ('copy','vision','analysis','image','edit','agent','other');
create type integration_kind  as enum ('vercel');

-- ─────────────────────────────────────────────────────────────────────────────
-- Helpers
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Tenancy
-- ─────────────────────────────────────────────────────────────────────────────
create table orgs (
  id                       uuid primary key default gen_random_uuid(),
  name                     text not null,
  slug                     text not null unique,
  settings                 jsonb not null default
                             '{"clone_enabled": true, "proxy_fetch_enabled": false, "ai_images_enabled": true}'::jsonb,
  clone_terms_accepted_at  timestamptz,
  clone_terms_accepted_by  uuid references auth.users(id),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);
create trigger orgs_updated before update on orgs for each row execute function set_updated_at();

create table org_members (
  org_id      uuid not null references orgs(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        member_role not null default 'member',
  created_at  timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index org_members_user_idx on org_members(user_id);

create table profiles (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  display_name  text,
  avatar_url    text,
  default_org_id uuid references orgs(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create trigger profiles_updated before update on profiles for each row execute function set_updated_at();

-- Membership check used by every RLS policy.
create or replace function is_org_member(target_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from org_members m where m.org_id = target_org and m.user_id = auth.uid()
  );
$$;

create or replace function is_org_admin(target_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from org_members m
    where m.org_id = target_org and m.user_id = auth.uid() and m.role in ('owner','admin')
  );
$$;

-- On sign-up: create a personal org and make the user its owner.
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  new_org uuid;
  base_name text := coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1), 'My workspace');
begin
  insert into orgs (name, slug)
  values (base_name, lower(regexp_replace(base_name, '[^a-zA-Z0-9]+', '-', 'g')) || '-' || substr(new.id::text, 1, 6))
  returning id into new_org;

  insert into org_members (org_id, user_id, role) values (new_org, new.id, 'owner');
  insert into profiles (user_id, display_name, default_org_id) values (new.id, base_name, new_org);
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
for each row execute function handle_new_user();

-- ─────────────────────────────────────────────────────────────────────────────
-- Assets (object storage index, deduped by content hash)
-- ─────────────────────────────────────────────────────────────────────────────
create table assets (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs(id) on delete cascade,
  bucket      text not null default 'assets',
  path        text not null,
  sha256      text not null,
  mime        text not null,
  width       int,
  height      int,
  bytes       int not null,
  source_url  text,
  created_at  timestamptz not null default now(),
  unique (org_id, sha256),
  unique (bucket, path)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Brands and products
-- ─────────────────────────────────────────────────────────────────────────────
create table brands (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references orgs(id) on delete cascade,
  name               text not null,
  prefix             text not null check (prefix ~ '^[A-Z]{2,4}$'),
  emoji              text,
  url                text,
  tagline            text,
  positioning        text,
  audience           text,
  brand_context      text,
  voice              text,
  voice_examples     text[] not null default '{}',
  brand_md           text,
  language           text not null default 'en',
  palette            jsonb not null default '{}'::jsonb,   -- {primary, dark, tint, accent, source_hue}
  fonts              jsonb not null default '{}'::jsonb,   -- {heading, body, sources[]}
  logo_asset_id      uuid references assets(id) on delete set null,
  favicon_asset_id   uuid references assets(id) on delete set null,
  cta_text           text,
  sale_percent       int check (sale_percent between 0 and 100),
  promo_text         text,
  meta_title         text,
  meta_description   text,
  usp_icons          jsonb not null default '[]'::jsonb,
  support_email      text,
  next_build_number  int not null default 1,
  deleted_at         timestamptz,
  created_by         uuid references auth.users(id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (org_id, prefix)
);
create index brands_org_idx on brands(org_id) where deleted_at is null;
create trigger brands_updated before update on brands for each row execute function set_updated_at();

create table products (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references orgs(id) on delete cascade,
  brand_id         uuid not null references brands(id) on delete cascade,
  handle           text not null,
  name             text not null,
  url              text,
  currency         text,
  price            numeric(12,2),
  sale_price       numeric(12,2),
  description      text,
  specs            jsonb not null default '[]'::jsonb,
  usps             jsonb not null default '[]'::jsonb,
  images           jsonb not null default '[]'::jsonb,   -- [{asset_id, source_url, alt}]
  variants         jsonb not null default '[]'::jsonb,   -- [{name, options, price, image_asset_id}]
  pricing_lines    jsonb not null default '[]'::jsonb,
  selling_context  text,
  pulled_at        timestamptz,
  pull_source      text,                                  -- shopify_admin | shopify_json | jsonld | og | h1 | manual
  deleted_at       timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (brand_id, handle)
);
create index products_brand_idx on products(brand_id) where deleted_at is null;
create trigger products_updated before update on products for each row execute function set_updated_at();

create table product_strategy (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs(id) on delete cascade,
  product_id  uuid not null references products(id) on delete cascade,
  kind        strategy_kind not null,
  data        jsonb not null,
  model       text,
  created_at  timestamptz not null default now(),
  unique (product_id, kind)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Templates
--   org_id null  => library template (global, read-only via API, seeded by script)
--   org_id set   => org template (owned copy of a library template, or a clone)
-- ─────────────────────────────────────────────────────────────────────────────
create table templates (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid references orgs(id) on delete cascade,
  origin              template_origin not null,
  status              template_status not null default 'active',
  slug                text not null,
  name                text not null,
  description         text,
  type                text not null,                 -- advertorial | listicle | versus | comparison | long_form | ...
  parent_template_id  uuid references templates(id) on delete set null,
  html_path           text not null,                 -- storage path of index.html
  source_html_path    text,                          -- clones: raw fetched page
  thumb_path          text,
  instructions        jsonb not null default '{}'::jsonb,
  blueprint           jsonb,                         -- clones only
  editor_map          jsonb,                         -- M4 editable publish
  source_palette      jsonb,                         -- library templates declare their palette
  source_url          text,
  source_host         text,
  source_name         text,
  platform            text,                          -- shopify | replo | webflow | clickfunnels | funnelish | wordpress | framer | unknown
  verdict             text,                          -- e.g. rebuild_native
  version             int not null default 1,
  deleted_at          timestamptz,
  created_by          uuid references auth.users(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint library_is_owned check (org_id is not null or origin = 'owned'),
  constraint clone_has_source check (origin = 'owned' or source_host is not null)
);
create unique index templates_library_slug on templates(slug) where org_id is null;
create unique index templates_org_slug on templates(org_id, slug) where org_id is not null and deleted_at is null;
create trigger templates_updated before update on templates for each row execute function set_updated_at();

create table template_sections (
  id           uuid primary key default gen_random_uuid(),
  template_id  uuid not null references templates(id) on delete cascade,
  key          text not null,                  -- matches data-lp-section in HTML
  role         section_role not null default 'other',
  label        text not null,
  position     int not null,
  removable    boolean not null default true,
  duplicable   boolean not null default false,
  unique (template_id, key),
  unique (template_id, position) deferrable initially deferred
);

create table template_versions (
  id           uuid primary key default gen_random_uuid(),
  template_id  uuid not null references templates(id) on delete cascade,
  version      int not null,
  html_path    text not null,
  sections     jsonb not null,                 -- snapshot of template_sections
  reason       text,
  created_by   uuid references auth.users(id),
  created_at   timestamptz not null default now(),
  unique (template_id, version)
);
-- Keep the newest 12 per template (pruned by the worker).

-- ─────────────────────────────────────────────────────────────────────────────
-- Builds
-- ─────────────────────────────────────────────────────────────────────────────
create table builds (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references orgs(id) on delete cascade,
  brand_id           uuid not null references brands(id) on delete restrict,
  product_id         uuid not null references products(id) on delete restrict,
  template_id        uuid not null references templates(id) on delete restrict,
  parent_build_id    uuid references builds(id) on delete set null,   -- rebuilds/variants nest under the original
  key                text not null,                                   -- e.g. LUM-23 (never reused)
  origin             template_origin not null,
  status             build_status not null default 'queued',
  title              text not null,
  wizard             jsonb not null,                                  -- raw validated wizard payload
  targeting          jsonb not null default '{}'::jsonb,
  report             jsonb not null default '{}'::jsonb,
  working_html_path  text,
  export_html_path   text,
  cost_usd           numeric(10,4) not null default 0,
  mock_images        boolean not null default false,
  approved_by        uuid references auth.users(id),
  approved_at        timestamptz,
  deleted_at         timestamptz,
  created_by         uuid references auth.users(id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (org_id, key)
);
create index builds_org_status_idx on builds(org_id, status) where deleted_at is null;
create index builds_brand_idx on builds(brand_id);
create trigger builds_updated before update on builds for each row execute function set_updated_at();

-- Allocate the next human key for a brand atomically. Keys are never reused.
create or replace function allocate_build_key(target_brand uuid) returns text
language plpgsql as $$
declare
  p text; n int;
begin
  update brands set next_build_number = next_build_number + 1
  where id = target_brand
  returning prefix, next_build_number - 1 into p, n;
  if p is null then raise exception 'brand % not found', target_brand; end if;
  return p || '-' || n;
end $$;

create table build_snapshots (
  id          uuid primary key default gen_random_uuid(),
  build_id    uuid not null references builds(id) on delete cascade,
  seq         int not null,
  html_path   text not null,
  reason      text not null,                   -- image_replace | section_remove | agent_edit | recolor | redraft | ...
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now(),
  unique (build_id, seq)
);
-- Keep the newest 12 per build (pruned by the worker).

create table image_versions (
  id          uuid primary key default gen_random_uuid(),
  build_id    uuid not null references builds(id) on delete cascade,
  slot        int not null,                     -- data-lp-img value
  seq         int not null,
  asset_id    uuid references assets(id) on delete set null,
  source      image_source not null,
  prompt      text,
  is_current  boolean not null default false,
  created_at  timestamptz not null default now(),
  unique (build_id, slot, seq)
);
create unique index image_versions_current on image_versions(build_id, slot) where is_current;
-- Keep the newest 5 per slot (pruned by the worker).

create table agent_messages (
  id          uuid primary key default gen_random_uuid(),
  build_id    uuid not null references builds(id) on delete cascade,
  role        text not null check (role in ('user','assistant','tool')),
  content     jsonb not null,
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Jobs, progress, cost
-- ─────────────────────────────────────────────────────────────────────────────
create table jobs (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references orgs(id) on delete cascade,
  kind          text not null,
  status        job_status not null default 'queued',
  payload       jsonb not null default '{}'::jsonb,
  result        jsonb,
  error         jsonb,                          -- {code, message, user_facing}
  dedupe_key    text,
  build_id      uuid references builds(id) on delete set null,
  attempts      int not null default 0,
  max_attempts  int not null default 2,
  run_after     timestamptz not null default now(),
  locked_by     text,
  locked_at     timestamptz,
  heartbeat_at  timestamptz,
  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  started_at    timestamptz,
  finished_at   timestamptz
);
create index jobs_claim_idx on jobs(created_at) where status = 'queued';
create index jobs_org_idx on jobs(org_id, created_at desc);
create unique index jobs_dedupe_active on jobs(dedupe_key) where status in ('queued','running') and dedupe_key is not null;

create table job_events (
  id       bigserial primary key,
  job_id   uuid not null references jobs(id) on delete cascade,
  org_id   uuid not null references orgs(id) on delete cascade,
  ts       timestamptz not null default now(),
  level    event_level not null default 'info',
  node     text,
  message  text not null,
  data     jsonb
);
create index job_events_job_idx on job_events(job_id, id);

create table ledger_entries (
  id             bigserial primary key,
  org_id         uuid not null references orgs(id) on delete cascade,
  build_id       uuid references builds(id) on delete set null,
  job_id         uuid references jobs(id) on delete set null,
  node           text,
  kind           ledger_kind not null,
  provider       text not null,                 -- anthropic | fal | ...
  model          text not null,
  input_tokens   int,
  output_tokens  int,
  units          numeric(10,2),                 -- images, seconds, etc.
  cost_usd       numeric(10,4),                 -- null if model unknown to the pricing table
  created_at     timestamptz not null default now()
);
create index ledger_org_time_idx on ledger_entries(org_id, created_at desc);
create index ledger_build_idx on ledger_entries(build_id);

create or replace function rollup_build_cost() returns trigger
language plpgsql as $$
begin
  if new.build_id is not null and new.cost_usd is not null then
    update builds set cost_usd = cost_usd + new.cost_usd where id = new.build_id;
  end if;
  return new;
end $$;
create trigger ledger_rollup after insert on ledger_entries for each row execute function rollup_build_cost();

-- Org-scoped circuit breaker (e.g. fal account locked). Replaces the reference's module global.
create table provider_locks (
  org_id      uuid not null references orgs(id) on delete cascade,
  provider    text not null,
  reason      text not null,
  until       timestamptz not null,
  created_at  timestamptz not null default now(),
  primary key (org_id, provider)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Integrations and publishing
-- Secrets live in Supabase Vault; rows hold only references and non-secret metadata.
-- ─────────────────────────────────────────────────────────────────────────────
create table integrations (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references orgs(id) on delete cascade,
  kind             integration_kind not null,
  vault_secret_id  uuid not null,
  token_last4      text,
  meta             jsonb not null default '{}'::jsonb,   -- vercel: {team_id}
  created_by       uuid references auth.users(id),
  created_at       timestamptz not null default now(),
  unique (org_id, kind)
);

create table store_connections (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references orgs(id) on delete cascade,
  brand_id         uuid not null references brands(id) on delete cascade unique,
  shop_domain      text not null,                        -- xxx.myshopify.com
  client_id        text not null,
  vault_secret_id  uuid not null,                        -- {client_secret, access_token}
  token_last4      text,
  scopes           text,
  status           text not null default 'pending',      -- pending | connected | error
  connected_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create trigger store_connections_updated before update on store_connections for each row execute function set_updated_at();

-- OAuth state in the DB (not process memory). 10-minute lifetime.
create table oauth_states (
  state       text primary key,
  org_id      uuid not null references orgs(id) on delete cascade,
  brand_id    uuid not null references brands(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  shop_domain text not null,
  expires_at  timestamptz not null default now() + interval '10 minutes'
);

create table publications (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references orgs(id) on delete cascade,
  build_id           uuid not null references builds(id) on delete cascade,
  destination        publish_dest not null,
  status             publish_status not null default 'pending',
  url                text,
  admin_url          text,
  editor_url         text,
  version            int,
  structure_mode     text,                                -- editable publish: structured | coarse
  gate_overridden    boolean not null default false,
  override_reasons   jsonb,
  details            jsonb,
  job_id             uuid references jobs(id) on delete set null,
  created_by         uuid references auth.users(id),
  created_at         timestamptz not null default now()
);
create index publications_build_idx on publications(build_id, created_at desc);

-- ─────────────────────────────────────────────────────────────────────────────
-- Notifications
-- ─────────────────────────────────────────────────────────────────────────────
create table notifications (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  job_id      uuid references jobs(id) on delete set null,
  build_id    uuid references builds(id) on delete set null,
  kind        text not null,                    -- job_succeeded | job_failed | ...
  title       text not null,
  body        text,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index notifications_user_idx on notifications(user_id, created_at desc);
-- Keep the newest 120 per user (pruned by the worker).

-- ─────────────────────────────────────────────────────────────────────────────
-- Row-level security
-- ─────────────────────────────────────────────────────────────────────────────
alter table orgs               enable row level security;
alter table org_members        enable row level security;
alter table profiles           enable row level security;
alter table assets             enable row level security;
alter table brands             enable row level security;
alter table products           enable row level security;
alter table product_strategy   enable row level security;
alter table templates          enable row level security;
alter table template_sections  enable row level security;
alter table template_versions  enable row level security;
alter table builds             enable row level security;
alter table build_snapshots    enable row level security;
alter table image_versions     enable row level security;
alter table agent_messages     enable row level security;
alter table jobs               enable row level security;
alter table job_events         enable row level security;
alter table ledger_entries     enable row level security;
alter table provider_locks     enable row level security;
alter table integrations       enable row level security;
alter table store_connections  enable row level security;
alter table oauth_states       enable row level security;
alter table publications       enable row level security;
alter table notifications      enable row level security;

-- Orgs and membership
create policy orgs_select on orgs for select using (is_org_member(id));
create policy orgs_update on orgs for update using (is_org_admin(id));
create policy members_select on org_members for select using (is_org_member(org_id));
create policy members_admin on org_members for all using (is_org_admin(org_id)) with check (is_org_admin(org_id));
create policy profiles_self on profiles for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Standard tenant tables: members read and write within their org.
do $$
declare t text;
begin
  foreach t in array array['assets','brands','products','product_strategy','builds','publications']
  loop
    execute format('create policy %I_rw on %I for all using (is_org_member(org_id)) with check (is_org_member(org_id))', t, t);
  end loop;
end $$;

-- Read-only to members (written by the worker with the service role).
create policy jobs_select           on jobs           for select using (is_org_member(org_id));
create policy job_events_select     on job_events     for select using (is_org_member(org_id));
create policy ledger_select         on ledger_entries for select using (is_org_member(org_id));
create policy provider_locks_select on provider_locks for select using (is_org_member(org_id));
-- integrations / store_connections: metadata readable by members, writes via worker only.
create policy integrations_select   on integrations      for select using (is_org_member(org_id));
create policy store_conn_select     on store_connections for select using (is_org_member(org_id));
-- oauth_states: no client access at all (worker only). RLS on with no policies = deny.

-- Templates: library rows readable by any signed-in user; org rows by members.
create policy templates_select on templates for select
  using ((org_id is null and auth.role() = 'authenticated') or is_org_member(org_id));
create policy templates_write on templates for insert with check (org_id is not null and is_org_member(org_id));
create policy templates_update on templates for update using (org_id is not null and is_org_member(org_id));
create policy templates_delete on templates for delete using (org_id is not null and is_org_member(org_id));

create policy sections_select on template_sections for select using (
  exists (select 1 from templates t where t.id = template_id
          and ((t.org_id is null and auth.role() = 'authenticated') or is_org_member(t.org_id))));
create policy sections_write on template_sections for all using (
  exists (select 1 from templates t where t.id = template_id and t.org_id is not null and is_org_member(t.org_id)))
  with check (
  exists (select 1 from templates t where t.id = template_id and t.org_id is not null and is_org_member(t.org_id)));

create policy tversions_rw on template_versions for all using (
  exists (select 1 from templates t where t.id = template_id and t.org_id is not null and is_org_member(t.org_id)))
  with check (
  exists (select 1 from templates t where t.id = template_id and t.org_id is not null and is_org_member(t.org_id)));

-- Build children: access via the parent build's org.
do $$
declare t text;
begin
  foreach t in array array['build_snapshots','image_versions','agent_messages']
  loop
    execute format(
      'create policy %I_rw on %I for all using (exists (select 1 from builds b where b.id = build_id and is_org_member(b.org_id))) '
      'with check (exists (select 1 from builds b where b.id = build_id and is_org_member(b.org_id)))', t, t);
  end loop;
end $$;

create policy notifications_self on notifications for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────────
-- Storage buckets (create at B0.2; storage.objects policies keyed on the first path segment = org_id)
--   library   private  (seeded; read by authenticated users)
--   templates private  (<org_id>/...)
--   builds    private  (<org_id>/...)
--   assets    public read, unguessable paths (<org_id>/<uuid>.<ext>); write by service role only
-- Example policy for a private org bucket:
--   create policy "org read builds" on storage.objects for select
--     using (bucket_id = 'builds' and is_org_member((storage.foldername(name))[1]::uuid));
-- ─────────────────────────────────────────────────────────────────────────────
