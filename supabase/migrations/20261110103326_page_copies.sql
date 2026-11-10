-- B7.1 (D144): duplicating a page. A copy nests under the family's first page
-- (parent_build_id, which the init schema kept for "rebuilds/variants") and is numbered in the
-- order made: Copy 1, Copy 2… The worker takes the family's highest number plus one with the
-- first page's row locked, so two copies made at once can't share a number; this index is the
-- backstop.
alter table public.builds
  add column copy_number int check (copy_number is null or copy_number > 0);

create unique index builds_copy_number_idx on public.builds (parent_build_id, copy_number)
  where copy_number is not null;
