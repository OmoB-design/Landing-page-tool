-- B6.2 (D130): what people may change in their own profile.
--
-- Until now a signed-in person could insert, update and delete their own profile row through the
-- database API, every column of it. Deleting it would break their account (no name, no current
-- workspace), and the current workspace could be pointed at a workspace they don't belong to.
--
-- Now: profiles are made by the sign-up trigger and changed by the worker; a person may read
-- their own row and change only their name and their current workspace, and only to a workspace
-- they're a member of.

drop policy if exists profiles_self on profiles;

revoke insert, update, delete on profiles from authenticated;
grant update (display_name, default_org_id) on profiles to authenticated;

create policy profiles_select on profiles for select
  using (user_id = auth.uid());

create policy profiles_update on profiles for update
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and (default_org_id is null or is_org_member(default_org_id))
  );
