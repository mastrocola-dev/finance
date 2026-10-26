create function ledger_now() returns timestamptz language sql stable as $$
  select coalesce(nullif(current_setting('finance.clock', true), '')::timestamptz, now())
$$;

do $$
declare
  name text;
begin
  foreach name in array array['member', 'account', 'category', 'income', 'recurring_expense', 'debt', 'entry', 'reserve', 'goal', 'decision'] loop
    execute format('alter table %I alter column created_at set default ledger_now()', name);
  end loop;
end
$$;

alter table decision_confirmation alter column confirmed_at set default ledger_now();
alter table audit_log alter column at set default ledger_now();
