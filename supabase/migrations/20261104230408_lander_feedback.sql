-- B3.1e (D108): ratings on Lander's replies. A thumbs up or down, for a thumbs down any of the
-- quick reasons and a note, and when it was given. Written by the worker (members can't write
-- agent_messages, B3.1c); kept with the reply so they can be reviewed later.
alter table agent_messages
  add column feedback text check (feedback in ('up', 'down')),
  add column feedback_reasons text[] not null default '{}',
  add column feedback_note text check (char_length(feedback_note) <= 500),
  add column feedback_at timestamptz;
