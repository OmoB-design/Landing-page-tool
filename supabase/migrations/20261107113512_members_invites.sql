-- B6.1 (D129): members and invites.
--
-- An owner or admin invites someone by email with a role and sends them the link. The link is
-- the invite's id with a signature made from the worker's secret (as client links, D119), so it
-- can be copied again at any time and the database holds nothing that opens it on its own.
-- Invites are written by the worker only; owners and admins can read their workspace's.
--
-- Someone new signs up from the invite: the sign-up carries the invite's id, and when it names
-- a pending, unexpired invite for that same email, they join that workspace with the invite's
-- role instead of getting an empty workspace of their own (D34). Anything else signs up as
-- before.
--
-- Members are now changed by the worker only (roles, removal), so the rules (the last owner
-- stays; only owners make owners) can't be skipped through the database API.

create table invites (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references orgs(id) on delete cascade,
  email        text not null check (email = lower(email) and position('@' in email) > 1),
  role         member_role not null default 'member',
  invited_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default now() + interval '7 days',
  accepted_at  timestamptz,
  accepted_by  uuid references auth.users(id) on delete set null,
  revoked_at   timestamptz
);
-- One open invite per email per workspace (inviting again refreshes it).
create unique index invites_open on invites(org_id, email)
  where accepted_at is null and revoked_at is null;

alter table invites enable row level security;
revoke all on invites from anon, authenticated;
grant select on invites to authenticated;
create policy invites_select on invites for select using (is_org_admin(org_id));

-- Members: read by members (as before), written by the worker only.
drop policy if exists members_admin on org_members;
revoke insert, update, delete on org_members from authenticated;

-- Sign-up: an invited sign-up joins the inviting workspace.
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  new_org uuid;
  base_name text := coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1), 'My workspace');
  invite_ref text := new.raw_user_meta_data->>'invite_id';
  invite invites%rowtype;
begin
  if invite_ref ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    select * into invite from invites
    where id = invite_ref::uuid
      and email = lower(new.email)
      and accepted_at is null and revoked_at is null and expires_at > now()
    for update;
    if found then
      insert into org_members (org_id, user_id, role) values (invite.org_id, new.id, invite.role);
      insert into profiles (user_id, display_name, default_org_id) values (new.id, base_name, invite.org_id);
      update invites set accepted_at = now(), accepted_by = new.id where id = invite.id;
      return new;
    end if;
  end if;

  insert into orgs (name, slug)
  values (base_name, lower(regexp_replace(base_name, '[^a-zA-Z0-9]+', '-', 'g')) || '-' || substr(new.id::text, 1, 6))
  returning id into new_org;

  insert into org_members (org_id, user_id, role) values (new_org, new.id, 'owner');
  insert into profiles (user_id, display_name, default_org_id) values (new.id, base_name, new_org);
  return new;
end $$;
