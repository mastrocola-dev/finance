alter table account add column credit_limit_cents bigint check (credit_limit_cents > 0);
alter table account add constraint account_credit_limit_on_card check (credit_limit_cents is null or kind = 'credit_card');

create table card_installment (
  id bigint generated always as identity primary key,
  account_id bigint not null references account,
  description text not null check (length(trim(description)) > 0 and description !~ '[0-9]{5,}'),
  member_id bigint references member,
  category_id bigint references category,
  installment_cents bigint not null check (installment_cents > 0),
  installments_total smallint not null check (installments_total >= 2),
  first_bill date not null check (first_bill = date_trunc('month', first_bill)::date),
  created_at timestamptz not null default ledger_now(),
  closed_at timestamptz
);

create index card_installment_open_account on card_installment (account_id) where closed_at is null;

create function card_installment_references() returns trigger language plpgsql as $$
begin
  if not exists (select 1 from account where id = new.account_id and kind = 'credit_card') then
    raise exception 'card installment account % is not a credit card', new.account_id using errcode = 'check_violation';
  end if;
  if new.category_id is not null and not exists (select 1 from category where id = new.category_id and kind = 'expense') then
    raise exception 'card installment category % is not an expense category', new.category_id using errcode = 'check_violation';
  end if;
  return new;
end
$$;

create function account_keeps_card_kind() returns trigger language plpgsql as $$
begin
  if old.kind = 'credit_card' and new.kind <> 'credit_card' and exists (select 1 from card_installment where account_id = new.id and closed_at is null) then
    raise exception 'account % has open card installments', new.id using errcode = 'check_violation';
  end if;
  return new;
end
$$;

create trigger card_installment_references before insert or update of account_id, category_id on card_installment for each row execute function card_installment_references();
create trigger account_keeps_card_kind before update of kind on account for each row execute function account_keeps_card_kind();
create trigger card_installment_no_delete before delete on card_installment for each row execute function forbid_delete();
create trigger card_installment_no_truncate before truncate on card_installment for each statement execute function forbid_delete();
