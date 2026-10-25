-- Job queues (D85): a worker claims and reaps only the jobs of its own queue (LP_JOB_QUEUE). The
-- live worker and a developer's machine use 'main'; the worker tests use a queue of their own, so
-- the live worker never runs a test's job and a test never runs a real one.
alter table jobs add column queue text not null default 'main';

drop index jobs_claim_idx;
create index jobs_claim_idx on jobs(queue, created_at) where status = 'queued';
