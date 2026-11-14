create table variable_expense (
  id bigint generated always as identity primary key,
  description text not null check (length(trim(description)) > 0 and description !~ '[0-9]{5,}'),
  category_id bigint not null references category,
  member_id bigint references member,
  account_id bigint references account,
  amount_cents bigint not null check (amount_cents > 0),
  starts_on date not null check (starts_on = date_trunc('month', starts_on)::date),
  created_at timestamptz not null default ledger_now(),
  closed_at timestamptz
);

create unique index variable_expense_open_description on variable_expense (lower(description)) where closed_at is null;

create function variable_expense_category() returns trigger language plpgsql as $$
begin
  if not exists (select 1 from category where id = new.category_id and kind = 'expense') then
    raise exception 'variable expense category % is not an expense category', new.category_id using errcode = 'check_violation';
  end if;
  return new;
end
$$;

create trigger variable_expense_category before insert or update of category_id on variable_expense for each row execute function variable_expense_category();
create trigger variable_expense_no_delete before delete on variable_expense for each row execute function forbid_delete();
create trigger variable_expense_no_truncate before truncate on variable_expense for each statement execute function forbid_delete();
