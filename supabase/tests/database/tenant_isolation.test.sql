-- Tenant isolation (B0.2 acceptance).
-- Sign-up creates an org, an owner membership and a profile; one org's members cannot read or
-- write another org's rows or files; org settings are platform-controlled.
-- Run with: pnpm test:db  (runs on the linked cloud project; everything rolls back at the end)
begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

-- Two sign-ups. The on_auth_user_created trigger runs exactly as for a real sign-up.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-00000000000a', 'ada@example.test', '{"full_name": "Ada Lovelace"}'),
  ('00000000-0000-4000-8000-00000000000b', 'bob@example.test', '{}');

select is(
  (select count(*)::int from org_members
   where user_id = '00000000-0000-4000-8000-00000000000a' and role = 'owner'),
  1, 'sign-up makes the user owner of exactly one org');
select is(
  (select o.name from orgs o join org_members m on m.org_id = o.id
   where m.user_id = '00000000-0000-4000-8000-00000000000a'),
  'Ada Lovelace', 'the org is named after the full name given at sign-up');
select is(
  (select o.name from orgs o join org_members m on m.org_id = o.id
   where m.user_id = '00000000-0000-4000-8000-00000000000b'),
  'bob', 'without a name, the org is named after the email');
select ok(
  exists (select 1 from profiles p
          join org_members m on m.org_id = p.default_org_id and m.user_id = p.user_id
          where p.user_id = '00000000-0000-4000-8000-00000000000a'),
  'the profile points at the new org');

-- Fixtures written as the platform (bypasses RLS): a brand and a stored template file in Ada's
-- org, and one library template.
insert into brands (org_id, name, prefix)
select org_id, 'Lumé', 'LUM' from org_members where user_id = '00000000-0000-4000-8000-00000000000a';
insert into templates (org_id, origin, slug, name, type, html_path)
values (null, 'owned', 'advertorial-classic', 'Classic advertorial', 'advertorial',
        'advertorial-classic/index.html');
insert into storage.objects (bucket_id, name)
select 'templates', org_id::text || '/t1/index.html'
from org_members where user_id = '00000000-0000-4000-8000-00000000000a';

insert into products (org_id, brand_id, handle, name)
select b.org_id, b.id, 'serum', 'Serum' from brands b where b.prefix = 'LUM';
insert into builds (org_id, brand_id, product_id, template_id, template_version, key, origin,
                    title, wizard, status)
select b.org_id, b.id, p.id, t.id, 1, 'LUM-1', 'owned', 'Test page', '{}', 'needs_review'
from brands b join products p on p.brand_id = b.id,
     templates t
where b.prefix = 'LUM' and t.slug = 'advertorial-classic' and t.org_id is null;

create temp table ids on commit drop as
select (select org_id from org_members
        where user_id = '00000000-0000-4000-8000-00000000000a') as ada_org,
       (select id from brands where prefix = 'LUM') as ada_brand,
       (select id from builds where key = 'LUM-1') as ada_build;
grant select on ids to authenticated;

-- ── As Ada ──────────────────────────────────────────────────────────────────
set local role authenticated;
set local request.jwt.claims to '{"sub": "00000000-0000-4000-8000-00000000000a", "role": "authenticated"}';

select is((select count(*)::int from orgs), 1, 'Ada sees only her own org');
select is((select count(*)::int from brands), 1, 'Ada sees her brand');
select is((select count(*)::int from storage.objects where bucket_id = 'templates'), 1,
          'Ada can read her org''s template files');
select lives_ok($$ update orgs set name = 'Ada Co' $$, 'an org owner can rename the org');
select throws_ok($$ update orgs set settings = '{"proxy_fetch_enabled": true}' $$, '42501', null,
                 'an org owner cannot change platform-controlled settings');
select is((select count(*)::int from builds), 1, 'Ada sees her org''s build');
select throws_ok(
  $$ update builds set status = 'approved' where id = (select ada_build from ids) $$,
  '42501', null, 'members cannot change a build''s status themselves (D84: the worker does)');
select throws_ok(
  $$ insert into build_snapshots (build_id, seq, html_path, reason)
     select ada_build, 1, 'x.html', 'test' from ids $$,
  '42501', null, 'members cannot write build snapshots (the worker does)');
select throws_ok(
  $$ insert into publications (org_id, build_id, destination, status, gate_overridden)
     select o.id, ada_build, 'vercel', 'succeeded', false from ids, orgs o $$,
  '42501', null, 'members cannot record a publication (D87: the worker does, with the gate''s overrides)');
select throws_ok($$ update orgs set allow_placeholder_publish = true $$, '42501', null,
                 'an org owner cannot flip the placeholder testing switch directly (the worker does)');

-- ── As Bob ──────────────────────────────────────────────────────────────────
set local request.jwt.claims to '{"sub": "00000000-0000-4000-8000-00000000000b", "role": "authenticated"}';

select is((select string_agg(name, ',') from orgs), 'bob', 'Bob sees only his own org');
select is((select count(*)::int from brands), 0, 'Bob cannot see Ada''s brand');
select is((select count(*)::int from storage.objects where bucket_id = 'templates'), 0,
          'Bob cannot see Ada''s template files');
select throws_ok(
  $$ insert into brands (org_id, name, prefix) select ada_org, 'Hijack', 'HJK' from ids $$,
  '42501', null, 'Bob cannot create a brand in Ada''s org');
select is_empty(
  $$ update brands set name = 'Hijacked' where id = (select ada_brand from ids) returning id $$,
  'Bob cannot update Ada''s brand');
select throws_ok(
  $$ insert into org_members (org_id, user_id, role)
     select ada_org, '00000000-0000-4000-8000-00000000000b', 'owner' from ids $$,
  '42501', null, 'Bob cannot add himself to Ada''s org');
-- Only this test's library template is counted: a seeded library (pnpm seed:library) may also exist.
select is((select count(*)::int from templates where org_id is null and slug = 'advertorial-classic'), 1,
          'signed-in users can see library templates');
select throws_ok(
  $$ insert into jobs (org_id, kind) select org_id, 'build' from org_members
     where user_id = '00000000-0000-4000-8000-00000000000b' $$,
  '42501', null, 'members cannot write worker-only tables, even for their own org');

-- ── Signed out ──────────────────────────────────────────────────────────────
set local role anon;
set local request.jwt.claims to '{"role": "anon"}';

select throws_ok($$ select count(*) from templates $$, '42501', null,
                 'signed-out visitors have no access to any table');

-- ── The worker (service role): sees every org's rows ───────────────────────
set local role service_role;
-- Counts only the two test users' orgs: a local database also holds orgs from manual testing.
select is(
  (select count(*)::int from orgs o join org_members m on m.org_id = o.id
   where m.user_id in ('00000000-0000-4000-8000-00000000000a',
                       '00000000-0000-4000-8000-00000000000b')),
  2, 'the service role can read every org');

-- ── Back as the platform: Ada's data is untouched ──────────────────────────
reset role;
select is((select name from brands where prefix = 'LUM'), 'Lumé', 'Ada''s brand was not modified');

select * from finish();
rollback;
