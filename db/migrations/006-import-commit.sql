do $$
declare
  name text;
begin
  foreach name in array array['account', 'category', 'income', 'recurring_expense', 'debt', 'entry', 'reserve', 'goal'] loop
    execute format('alter table %I add column import_batch_id bigint references import_batch', name);
  end loop;
end
$$;

alter table import_candidate add column record_id bigint;
alter table import_candidate add check (record_id is null or status in ('accepted', 'edited'));
