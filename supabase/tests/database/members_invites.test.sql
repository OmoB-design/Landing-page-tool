-- Members and invites (B6.1, D129).
-- An invited sign-up joins the inviting workspace with the invite's role (no workspace of its
-- own); anything else signs up as before. Members are changed by the worker only, and invites
-- are read by owners and admins only.
-- Run with: pnpm test:db  (runs on the linked cloud project; everything rolls back at the end)
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

-- Dee signs up and owns her workspace; she invites two people (written as the worker would).
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-0000000000d1', 'dee@example.test', '{"full_name": "Dee"}');
create temp table ids on commit drop as
select org_id as org from org_members where user_id = '00000000-0000-4000-8000-0000000000d1';
grant select on ids to authenticated;

insert into invites (id, org_id, email, role, invited_by)
select '00000000-0000-4000-8000-00000000e001', org, 'eli@example.test', 'admin',
       '00000000-0000-4000-8000-0000000000d1' from ids;
insert into invites (id, org_id, email, role, invited_by, expires_at)
select '00000000-0000-4000-8000-00000000e002', org, 'fay@example.test', 'member',
       '00000000-0000-4000-8000-0000000000d1', now() - interval '1 day' from ids;

-- Eli signs up from his invite.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-0000000000e1', 'eli@example.test',
   '{"full_name": "Eli", "invite_id": "00000000-0000-4000-8000-00000000e001"}');
select is(
  (select role::text from org_members m, ids
   where m.user_id = '00000000-0000-4000-8000-0000000000e1' and m.org_id = ids.org),
  'admin', 'an invited sign-up joins the workspace with the invite''s role');
select is(
  (select count(*)::int from org_members where user_id = '00000000-0000-4000-8000-0000000000e1'),
  1, 'an invited sign-up gets no workspace of its own');
select is(
  (select default_org_id from profiles where user_id = '00000000-0000-4000-8000-0000000000e1'),
  (select org from ids), 'and opens the workspace it joined');
select isnt(
  (select accepted_at from invites where id = '00000000-0000-4000-8000-00000000e001'),
  null, 'the invite is used up');

-- Fay's invite has expired; Gus names Eli's (used) invite with another email.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-0000000000f1', 'fay@example.test',
   '{"full_name": "Fay", "invite_id": "00000000-0000-4000-8000-00000000e002"}'),
  ('00000000-0000-4000-8000-0000000000f2', 'gus@example.test',
   '{"full_name": "Gus", "invite_id": "00000000-0000-4000-8000-00000000e001"}'),
  ('00000000-0000-4000-8000-0000000000f3', 'hal@example.test',
   '{"full_name": "Hal", "invite_id": "not-a-uuid"}');
select is(
  (select count(*)::int from org_members m, ids
   where m.org_id = ids.org and m.user_id in ('00000000-0000-4000-8000-0000000000f1',
                                             '00000000-0000-4000-8000-0000000000f2',
                                             '00000000-0000-4000-8000-0000000000f3')),
  0, 'an expired, used or malformed invite doesn''t let anyone in');
select is(
  (select count(*)::int from org_members
   where role = 'owner' and user_id in ('00000000-0000-4000-8000-0000000000f1',
                                        '00000000-0000-4000-8000-0000000000f2',
                                        '00000000-0000-4000-8000-0000000000f3')),
  3, 'they sign up as before, each with a workspace of their own');

-- Ida joins as a plain member (written as the worker would).
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-0000000000a9', 'ida@example.test', '{"full_name": "Ida"}');
insert into org_members (org_id, user_id, role)
select org, '00000000-0000-4000-8000-0000000000a9', 'member' from ids;

-- ── As Eli (an admin) ───────────────────────────────────────────────────────
set local role authenticated;
set local request.jwt.claims to '{"sub": "00000000-0000-4000-8000-0000000000e1", "role": "authenticated"}';
select is((select count(*)::int from invites), 2, 'an admin can read the workspace''s invites');
select throws_ok(
  $$ update org_members set role = 'owner' where user_id = '00000000-0000-4000-8000-0000000000e1' $$,
  '42501', null, 'an admin cannot make himself owner directly (the worker checks the rules)');
select throws_ok(
  $$ delete from org_members where user_id = '00000000-0000-4000-8000-0000000000d1' $$,
  '42501', null, 'an admin cannot remove the owner directly');
select throws_ok(
  $$ insert into invites (org_id, email) select org, 'x@example.test' from ids $$,
  '42501', null, 'members cannot write invites directly (the worker does)');

-- ── As Ida (a member) ───────────────────────────────────────────────────────
set local request.jwt.claims to '{"sub": "00000000-0000-4000-8000-0000000000a9", "role": "authenticated"}';
select is((select count(*)::int from invites), 0, 'a plain member cannot read invites');

-- ── As Fay, an outsider ─────────────────────────────────────────────────────
set local request.jwt.claims to '{"sub": "00000000-0000-4000-8000-0000000000f1", "role": "authenticated"}';
select is((select count(*)::int from invites), 0, 'an outsider sees no invites');
select is((select count(*)::int from org_members m, ids where m.org_id = ids.org), 0,
          'an outsider sees no members of the workspace');

select * from finish();
rollback;
