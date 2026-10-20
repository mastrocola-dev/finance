do $$
begin
  execute format('alter database %I set timezone to %L', current_database(), 'America/Sao_Paulo');
end
$$;

create function forbid_delete() returns trigger language plpgsql as $$
begin
  raise exception 'rows in % are never deleted, close them instead', tg_table_name;
end
$$;

create function forbid_change() returns trigger language plpgsql as $$
begin
  raise exception 'rows in % are immutable', tg_table_name;
end
$$;

create table member (
  id bigint generated always as identity primary key,
  name text not null unique check (length(trim(name)) > 0),
  share_percent smallint not null default 50 check (share_percent between 0 and 100),
  created_at timestamptz not null default now(),
  closed_at timestamptz
);

create table account (
  id bigint generated always as identity primary key,
  institution text not null check (length(trim(institution)) > 0 and institution !~ '[0-9]{5,}'),
  nickname text not null check (length(trim(nickname)) > 0 and nickname !~ '[0-9]{5,}'),
  last_four text not null check (last_four ~ '^[0-9]{4}$'),
  kind text not null check (kind in ('checking', 'savings', 'credit_card', 'investment', 'cash')),
  member_id bigint references member,
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  unique (institution, last_four, kind)
);

create table category (
  id bigint generated always as identity primary key,
  name text not null check (length(trim(name)) > 0),
  kind text not null check (kind in ('income', 'expense')),
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  unique (name, kind)
);

create table income (
  id bigint generated always as identity primary key,
  description text not null check (length(trim(description)) > 0),
  member_id bigint not null references member,
  category_id bigint references category,
  account_id bigint references account,
  amount_cents bigint not null check (amount_cents > 0),
  day_of_month smallint not null check (day_of_month between 1 and 31),
  starts_on date not null,
  ends_on date check (ends_on >= starts_on),
  created_at timestamptz not null default now(),
  closed_at timestamptz
);

create table recurring_expense (
  id bigint generated always as identity primary key,
  description text not null check (length(trim(description)) > 0),
  category_id bigint not null references category,
  account_id bigint references account,
  member_id bigint references member,
  amount_cents bigint not null check (amount_cents > 0),
  day_of_month smallint not null check (day_of_month between 1 and 31),
  installments_total integer check (installments_total > 0),
  starts_on date not null,
  ends_on date check (ends_on >= starts_on),
  created_at timestamptz not null default now(),
  closed_at timestamptz
);

create table debt (
  id bigint generated always as identity primary key,
  creditor text not null check (length(trim(creditor)) > 0 and creditor !~ '[0-9]{5,}'),
  description text not null check (length(trim(description)) > 0),
  member_id bigint references member,
  account_id bigint references account,
  principal_cents bigint not null check (principal_cents > 0),
  balance_cents bigint not null check (balance_cents >= 0),
  monthly_rate_percent numeric(6, 4) check (monthly_rate_percent >= 0),
  installment_cents bigint check (installment_cents > 0),
  installments_total integer check (installments_total > 0),
  installments_paid integer not null default 0 check (installments_paid >= 0 and (installments_total is null or installments_paid <= installments_total)),
  starts_on date not null,
  created_at timestamptz not null default now(),
  closed_at timestamptz
);

create table entry (
  id bigint generated always as identity primary key,
  competence date not null check (competence = date_trunc('month', competence)::date),
  due_on date not null,
  description text not null check (length(trim(description)) > 0),
  direction text not null check (direction in ('income', 'expense')),
  amount_cents bigint not null check (amount_cents > 0),
  category_id bigint not null references category,
  account_id bigint references account,
  member_id bigint references member,
  income_id bigint references income,
  recurring_expense_id bigint references recurring_expense,
  debt_id bigint references debt,
  installment_number integer check (installment_number > 0),
  status text not null default 'planned' check (status in ('planned', 'paid', 'late')),
  paid_on date,
  origin text not null check (origin in ('manual', 'claude', 'import')),
  replaced_by bigint references entry,
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  check ((status = 'paid') = (paid_on is not null)),
  check (replaced_by is null or closed_at is not null)
);

create index entry_competence on entry (competence) where closed_at is null;

create table reserve (
  id bigint generated always as identity primary key,
  name text not null unique check (length(trim(name)) > 0),
  account_id bigint references account,
  balance_cents bigint not null default 0 check (balance_cents >= 0),
  target_cents bigint check (target_cents > 0),
  created_at timestamptz not null default now(),
  closed_at timestamptz
);

create table goal (
  id bigint generated always as identity primary key,
  name text not null unique check (length(trim(name)) > 0),
  reserve_id bigint references reserve,
  target_cents bigint not null check (target_cents > 0),
  saved_cents bigint not null default 0 check (saved_cents >= 0),
  due_on date,
  created_at timestamptz not null default now(),
  closed_at timestamptz
);

create table decision (
  id bigint generated always as identity primary key,
  title text not null check (length(trim(title)) > 0),
  description text not null default '',
  amount_cents bigint check (amount_cents > 0),
  status text not null default 'proposed' check (status in ('proposed', 'confirmed', 'rejected', 'withdrawn')),
  proposed_by bigint not null references member,
  origin text not null check (origin in ('manual', 'claude')),
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  check ((status = 'proposed') = (closed_at is null))
);

create table decision_confirmation (
  decision_id bigint not null references decision,
  member_id bigint not null references member,
  confirmed_at timestamptz not null default now(),
  primary key (decision_id, member_id)
);

create table audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  author text not null check (author in ('member', 'claude', 'import', 'system')),
  member_id bigint references member,
  entity text not null,
  entity_id bigint,
  action text not null check (action in ('create', 'update', 'close')),
  before jsonb,
  after jsonb,
  check (author not in ('member', 'claude') or member_id is not null)
);

create index audit_log_entity on audit_log (entity, entity_id);

create trigger audit_log_immutable before update or delete on audit_log for each row execute function forbid_change();
create trigger decision_confirmation_immutable before update or delete on decision_confirmation for each row execute function forbid_change();

do $$
declare
  name text;
begin
  foreach name in array array['member', 'account', 'category', 'income', 'recurring_expense', 'debt', 'entry', 'reserve', 'goal', 'decision'] loop
    execute format('create trigger %I before delete on %I for each row execute function forbid_delete()', name || '_no_delete', name);
  end loop;
  foreach name in array array['member', 'account', 'category', 'income', 'recurring_expense', 'debt', 'entry', 'reserve', 'goal', 'decision', 'decision_confirmation', 'audit_log'] loop
    execute format('create trigger %I before truncate on %I for each statement execute function forbid_delete()', name || '_no_truncate', name);
  end loop;
end
$$;
