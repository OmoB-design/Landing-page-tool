-- B1.4a: the review desk (D84).

-- Goes up with every change made on the desk (an edit, a recolour, a redraft, a restore). Each
-- change carries the version it was made on, so two tabs can't overwrite each other.
alter table builds add column page_version int not null default 1;

-- Builds and their snapshots are written by the worker only: the desk's changes are worker calls
-- that check membership and the build's state, so a status like Approved can be trusted. Members
-- keep reading them (rows limited by RLS).
revoke insert, update, delete on builds, build_snapshots from authenticated;
