alter table import_candidate
  add column accepted_by_model boolean not null default false,
  add check (not accepted_by_model or status in ('accepted', 'replaced'));
