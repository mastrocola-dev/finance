alter table import_batch
  add column totals jsonb not null default '[]' check (jsonb_typeof(totals) = 'array'),
  add column checks jsonb not null default '[]' check (jsonb_typeof(checks) = 'array');
