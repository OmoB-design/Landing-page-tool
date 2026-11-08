-- What people may change in their own profile (B6.2, D130): their name and their current
-- workspace (one they belong to); nothing else, and nobody else's.
-- Run with: pnpm test:db  (runs on the linked cloud project; everything rolls back at the end)
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

-- Jo and Kit sign up, each with a workspace of their own; Jo is also a member of Lee's.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-0000000000b1', 'jo@example.test', '{"full_name": "Jo"}'),
  ('00000000-0000-4000-8000-0000000000b2', 'kit@example.test', '{"full_name": "Kit"}'),
  ('00000000-0000-4000-8000-0000000000b3', 'lee@example.test', '{"full_name": "Lee"}');
create temp table ws on commit drop as
select
  (select org_id from org_members where user_id = '00000000-0000-4000-8000-0000000000b1') as jo,
  (select org_id from org_members where user_id = '00000000-0000-4000-8000-0000000000b2') as kit,
  (select org_id from org_members where user_id = '00000000-0000-4000-8000-0000000000b3') as lee;
grant select on ws to authenticated;
insert into org_members (org_id, user_id, role)
select lee, '00000000-0000-4000-8000-0000000000b1', 'member' from ws;

-- ── As Jo ───────────────────────────────────────────────────────────────────
set local role authenticated;
set local request.jwt.claims to '{"sub": "00000000-0000-4000-8000-0000000000b1", "role": "authenticated"}';

select lives_ok(
  $$ update profiles set display_name = 'Jo Adams' where user_id = '00000000-0000-4000-8000-0000000000b1' $$,
  'Jo can change her name');
select is((select display_name from profiles where user_id = '00000000-0000-4000-8000-0000000000b1'),
  'Jo Adams', 'and it is saved');
select lives_ok(
  $$ update profiles set default_org_id = (select lee from ws) where user_id = '00000000-0000-4000-8000-0000000000b1' $$,
  'Jo can open a workspace she belongs to');
select throws_ok(
  $$ update profiles set default_org_id = (select kit from ws) where user_id = '00000000-0000-4000-8000-0000000000b1' $$,
  '42501', null, 'but not one she doesn''t belong to');
select throws_ok(
  $$ update profiles set avatar_url = 'https://example.test/x.png' where user_id = '00000000-0000-4000-8000-0000000000b1' $$,
  '42501', null, 'Jo cannot point her photo at an outside address');
select throws_ok(
  $$ delete from profiles where user_id = '00000000-0000-4000-8000-0000000000b1' $$,
  '42501', null, 'Jo cannot delete her profile');
select throws_ok(
  $$ insert into profiles (user_id, display_name) values ('00000000-0000-4000-8000-0000000000b1', 'Jo') $$,
  '42501', null, 'Jo cannot make a profile');
select is((select count(*)::int from profiles), 1, 'Jo reads only her own profile');

update profiles set display_name = 'Not Kit' where user_id = '00000000-0000-4000-8000-0000000000b2';

reset role;
select is((select display_name from profiles where user_id = '00000000-0000-4000-8000-0000000000b2'),
  'Kit', 'Jo cannot rename Kit');
select is((select default_org_id from profiles where user_id = '00000000-0000-4000-8000-0000000000b1'),
  (select lee from ws), 'Jo''s current workspace is still Lee''s');

select * from finish();
rollback;
