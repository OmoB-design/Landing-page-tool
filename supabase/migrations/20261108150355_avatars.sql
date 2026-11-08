-- B6.7 (D139): profile photos.
--
-- A public bucket, `avatars`, holds each person's photo under a folder named for them
-- (`<user id>/<random>.webp`, about 30 KB: the browser crops and shrinks it to 256 px first).
-- Anyone with a photo's address can see it (teammates see it in the sidebar and on Members); the
-- names are random. People may write, read and delete only in their own folder.
--
-- A person may now also change their profile's `avatar_url`, but only to a photo in their own
-- folder (a path, never an outside address, so nobody's photo can point at a tracking image or at
-- someone else's photo).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 524288, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

create policy "avatars: own folder read" on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars: own folder insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars: own folder update" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars: own folder delete" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

grant update (avatar_url) on profiles to authenticated;

drop policy if exists profiles_update on profiles;
create policy profiles_update on profiles for update
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and (default_org_id is null or is_org_member(default_org_id))
    and (
      avatar_url is null
      or avatar_url ~ ('^' || auth.uid()::text || '/[A-Za-z0-9_-]+\.(webp|jpe?g|png)$')
    )
  );
