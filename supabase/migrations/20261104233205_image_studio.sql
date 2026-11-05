-- B3.2a (D109): the image studio's history. A version can be an image that isn't a stored asset
-- (the build's original, another image on the page), so it keeps its address too. Written by the
-- worker; members read through the existing policy.
alter table image_versions add column src text;
revoke insert, update, delete on image_versions from authenticated;
