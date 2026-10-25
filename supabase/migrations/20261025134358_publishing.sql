-- Publishing (B1.5a, D87).
-- Publications are written by the worker only (the publish gate's overrides are recorded there, so
-- members must not be able to write or rewrite them); members read them.
revoke insert, update, delete on publications from authenticated;

-- The owner's testing switch: allow publishing pages that still have placeholder images (until real
-- images arrive, B1.3). Off by default; each such publish is recorded as an override.
alter table orgs add column allow_placeholder_publish boolean not null default false;
