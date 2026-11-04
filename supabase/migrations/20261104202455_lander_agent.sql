-- B3.1c (D106): Lander, the page editor's agent.
--
-- A conversation with Lander is a thread of agent_messages: the user's requests and Lander's
-- replies (its plan, the steps it took, the changes, its closing line), one thread per "New chat".
-- Each reply names the job that did the work.
alter table agent_messages
  add column thread_id uuid not null default gen_random_uuid(),
  add column job_id uuid references jobs(id) on delete set null;

create index agent_messages_thread_idx on agent_messages (build_id, thread_id, created_at);

-- The worker writes the conversation (it checks membership and the build); members keep reading
-- it through the existing policy.
revoke insert, update, delete on agent_messages from authenticated;

-- Stop: the user asks a running job to stop; the job checks between steps, keeps what it did
-- and finishes.
alter table jobs add column cancel_requested_at timestamptz;
