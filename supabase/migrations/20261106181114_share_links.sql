-- B3.6: the client review link (BUILD_SPEC §11.4, D55, D119).
--
-- Approving a page keeps a copy of it as approved (in the `builds` bucket, under the build's folder,
-- so it goes when the page is deleted for good); the client link shows that copy. Approving again
-- replaces it, so the same link shows the newest approved version, and editing the page doesn't
-- change what the link shows until it's approved again. `approved_at` still clears when a page goes
-- back to review; the copy and its date stay for the link.
--
-- One live link per page (not turned off). The link's token isn't stored at all: the worker makes
-- it from the link's id and a secret (LP_SHARE_SECRET), and checks it the same way. Links expire
-- after 30 days; opening one counts a view. Written by the worker only (service role); members read
-- their org's rows.

alter table builds
  add column approved_copy_path    text,
  add column approved_copy_version int,
  add column approved_copy_at      timestamptz;

create table share_links (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references orgs(id) on delete cascade,
  build_id        uuid not null references builds(id) on delete cascade,
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  expires_at      timestamptz not null default now() + interval '30 days',
  revoked_at      timestamptz,
  views           int not null default 0,
  last_viewed_at  timestamptz
);
create index share_links_org on share_links(org_id);
create unique index share_links_live on share_links(build_id) where revoked_at is null;

alter table share_links enable row level security;
grant select on share_links to authenticated;
create policy share_links_select on share_links for select using (is_org_member(org_id));
