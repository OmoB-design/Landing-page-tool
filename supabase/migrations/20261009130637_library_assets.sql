-- B1.1a: images and fonts that ship with curated library templates (template-onboarding skill).
-- Public read like `assets` (pages and previews load them by URL); written by the seed script
-- with the service role only. Paths: <template slug>/<file>.
insert into storage.buckets (id, name, public) values ('library-assets', 'library-assets', true)
on conflict (id) do nothing;
