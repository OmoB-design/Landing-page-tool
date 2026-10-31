-- B2.2 (D96): a cloned template's analysis is reviewed before pages are built from it. Who
-- confirmed it and when; cleared when the page is analysed again.
alter table templates
  add column reviewed_at timestamptz,
  add column reviewed_by uuid references auth.users(id) on delete set null;

comment on column templates.reviewed_at is
  'Clones: when the analysis (sections, blueprint, rules) was confirmed; null until then.';
