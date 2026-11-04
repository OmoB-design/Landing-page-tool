-- B3.1a (D104): the page editor's undo steps.
--
-- merge_key: typing in one line of the page saves after every pause, but the saves of one line
-- (same person, a minute apart at most) share one snapshot, so a sentence typed in the editor is
-- one undo step and keystrokes don't push older changes out of the 12 kept.
--
-- redo: Undo used to drop the newest snapshot and delete the page it undid. Now the undone page is
-- kept as a redo row (newest first, up to 12) until the next new change, so Redo can put it back.
-- Undo rows and redo rows share the build's seq numbers.

alter table build_snapshots
  add column merge_key text,
  add column redo boolean not null default false;

comment on column build_snapshots.merge_key is
  'B3.1a: saves of one line typed in the page editor share one snapshot (same key, same person, within a minute).';
comment on column build_snapshots.redo is
  'B3.1a: a page undone in the editor, kept for Redo until the next new change.';
