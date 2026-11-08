-- Profile photos (B6.7, D139): a person's photo lives in their own folder of the avatars bucket,
-- and their profile can point only at a photo there.
-- Run with: pnpm test:db  (runs on the linked cloud project; everything rolls back at the end)
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-0000000000c1', 'ada@example.test', '{"full_name": "Ada"}'),
  ('00000000-0000-4000-8000-0000000000c2', 'ben@example.test', '{"full_name": "Ben"}');

select is((select public from storage.buckets where id = 'avatars'), true,
  'the avatars bucket serves photos by their address');

-- ── As Ada ──────────────────────────────────────────────────────────────────
set local role authenticated;
set local request.jwt.claims to '{"sub": "00000000-0000-4000-8000-0000000000c1", "role": "authenticated"}';

select lives_ok(
  $$ update profiles set avatar_url = '00000000-0000-4000-8000-0000000000c1/a1B2-c3.webp'
     where user_id = '00000000-0000-4000-8000-0000000000c1' $$,
  'Ada can point her photo at one in her own folder');
select throws_ok(
  $$ update profiles set avatar_url = '00000000-0000-4000-8000-0000000000c2/x.webp'
     where user_id = '00000000-0000-4000-8000-0000000000c1' $$,
  '42501', null, 'but not at one in Ben''s');
select throws_ok(
  $$ update profiles set avatar_url = 'https://example.test/x.png'
     where user_id = '00000000-0000-4000-8000-0000000000c1' $$,
  '42501', null, 'nor at an outside address');
select throws_ok(
  $$ update profiles set avatar_url = '00000000-0000-4000-8000-0000000000c1/../00000000-0000-4000-8000-0000000000c2/x.webp'
     where user_id = '00000000-0000-4000-8000-0000000000c1' $$,
  '42501', null, 'nor out of her folder by a path');
select lives_ok(
  $$ update profiles set avatar_url = null where user_id = '00000000-0000-4000-8000-0000000000c1' $$,
  'Ada can remove her photo');

select lives_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('avatars', '00000000-0000-4000-8000-0000000000c1/a1B2-c3.webp') $$,
  'Ada can upload into her own folder');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('avatars', '00000000-0000-4000-8000-0000000000c2/x.webp') $$,
  '42501', null, 'but not into Ben''s');

reset role;
select is((select avatar_url from profiles where user_id = '00000000-0000-4000-8000-0000000000c2'),
  null, 'Ben''s profile is untouched');

select * from finish();
rollback;
