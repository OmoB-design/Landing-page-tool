-- B3.5 batch build (BUILD_SPEC §9, D115): pages started together share a batch id, so the batch
-- screen can show them side by side as they build. Null for a page built on its own. Builds keep
-- their RLS (org-scoped), so a batch is only ever seen by its own workspace.
alter table public.builds add column batch_id uuid;

create index builds_batch_idx on public.builds (org_id, batch_id) where batch_id is not null;

comment on column public.builds.batch_id is
  'Pages started together from the create wizard''s "Build with every template" (B3.5).';
