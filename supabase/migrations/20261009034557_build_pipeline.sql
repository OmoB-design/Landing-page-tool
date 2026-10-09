-- B0.6a: build pipeline plumbing.

-- LangGraph checkpoints (one thread per build) live in their own schema, out of reach of the
-- browser API (PostgREST exposes `public` only) and of the tenant-table RLS checks. The worker
-- creates the tables at start-up (PostgresSaver.setup(), which versions its own migrations).
create schema if not exists langgraph;
revoke all on schema langgraph from public, anon, authenticated;
grant usage, create on schema langgraph to service_role;

-- A build whose job fails for good (or is cancelled) is marked failed, whichever path failed
-- it: the job's own error handling or the reaper giving up on a dead worker.
create or replace function mark_build_failed() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.kind = 'build' and new.build_id is not null
     and new.status in ('failed', 'cancelled') and old.status is distinct from new.status then
    update builds set status = 'failed'
    where id = new.build_id and org_id = new.org_id and status in ('queued', 'building');
  end if;
  return new;
end;
$$;

create trigger jobs_build_failed after update of status on jobs
  for each row execute function mark_build_failed();
