alter table import_batch
  add column consolidation jsonb not null default '{"merges": [], "unchecked": [], "failure": null}';
