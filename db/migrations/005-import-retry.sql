alter table import_batch
  add column failures jsonb not null default '[]' check (jsonb_typeof(failures) = 'array');

alter table import_candidate
  drop constraint import_candidate_status_check,
  add constraint import_candidate_status_check check (status in ('pending', 'accepted', 'rejected', 'edited', 'replaced')),
  add constraint import_candidate_replaced_closed check (status <> 'replaced' or closed_at is not null),
  add column chunk text check (length(trim(chunk)) > 0);

alter table import_question
  add column chunk text check (length(trim(chunk)) > 0);
