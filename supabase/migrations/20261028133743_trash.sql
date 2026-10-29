-- Trash (B1.6a, D92): pages, brands, products and templates wait in Settings → Trash for 7 days
-- (soft delete, `deleted_at`), then the worker deletes them for good.
--   deleted_by    who moved the item to Trash (shown in Trash).
--   trashed_with  the brand a page or product went to Trash with; restoring the brand brings
--                 them back, and they leave Trash with it. No foreign key: the brand is deleted
--                 only after its pages, and pages hold their brand with `on delete restrict`.
--   purged_at     a product or template deleted for good while pages still use it: hidden from
--                 Trash and from the app, its row kept for those pages until the last one goes.

alter table builds
  add column deleted_by   uuid references auth.users(id) on delete set null,
  add column trashed_with uuid;

alter table brands
  add column deleted_by uuid references auth.users(id) on delete set null;

alter table products
  add column deleted_by   uuid references auth.users(id) on delete set null,
  add column trashed_with uuid,
  add column purged_at    timestamptz;

alter table templates
  add column deleted_by uuid references auth.users(id) on delete set null,
  add column purged_at  timestamptz;

create index builds_trash_idx on builds(org_id, deleted_at) where deleted_at is not null;
create index brands_trash_idx on brands(org_id, deleted_at) where deleted_at is not null;
create index products_trash_idx on products(org_id, deleted_at) where deleted_at is not null;
create index templates_trash_idx on templates(org_id, deleted_at) where deleted_at is not null;
