-- B3.5b: a batch is a folder in the Pages list, in the colour its team picks (owner, 2026-11-06).
--
-- One row per batch (D115), its id the builds' batch_id: its folder's colour, which everyone in
-- the workspace sees. The batches made before this get a row each (red, the colour they've shown
-- so far). No foreign key from builds: a worker deployed before this starts batches without a row,
-- and a batch without one shows red until its colour is picked (the worker then adds the row).
-- Written by the worker only (service role); members read their org's rows.

create table build_batches (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references orgs(id) on delete cascade,
  folder_color  text not null default 'red'
                check (folder_color in ('blue', 'black', 'red', 'purple')),
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index build_batches_org on build_batches(org_id);

alter table build_batches enable row level security;
grant select on build_batches to authenticated;
create policy build_batches_select on build_batches for select using (is_org_member(org_id));

insert into build_batches (id, org_id, created_by, created_at)
select batch_id, org_id, (array_agg(created_by order by created_at))[1], min(created_at)
from builds
where batch_id is not null
group by batch_id, org_id;
