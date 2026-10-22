create table import_batch (
  id bigint generated always as identity primary key,
  file_name text not null check (length(trim(file_name)) > 0 and regexp_replace(file_name, '(^|[^0-9])(19|20)[0-9]{2}(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])(?=[^0-9]|$)', '\1', 'g') !~ '[0-9]{5,}'),
  format text not null check (format in ('xlsx', 'csv', 'json', 'xml', 'txt', 'ofx', 'pdf')),
  file_hash text not null check (file_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'draft' check (status in ('draft', 'verified', 'committed', 'closed')),
  input_tokens bigint not null default 0 check (input_tokens >= 0),
  output_tokens bigint not null default 0 check (output_tokens >= 0),
  cost_usd_micros bigint not null default 0 check (cost_usd_micros >= 0),
  created_at timestamptz not null default ledger_now(),
  closed_at timestamptz,
  check ((status = 'closed') = (closed_at is not null))
);

create table import_candidate (
  id bigint generated always as identity primary key,
  batch_id bigint not null references import_batch,
  kind text not null check (kind in ('entry', 'account', 'category', 'income', 'recurring_expense', 'debt', 'reserve', 'goal')),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  source text not null check (length(trim(source)) > 0),
  confidence numeric(3, 2) not null check (confidence between 0 and 1),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected', 'edited')),
  checks jsonb not null default '[]' check (jsonb_typeof(checks) = 'array'),
  created_at timestamptz not null default ledger_now(),
  closed_at timestamptz
);

create index import_candidate_batch on import_candidate (batch_id) where closed_at is null;

create table import_question (
  id bigint generated always as identity primary key,
  batch_id bigint not null references import_batch,
  candidate_id bigint references import_candidate,
  question text not null check (length(trim(question)) > 0),
  options jsonb not null default '[]' check (jsonb_typeof(options) = 'array'),
  source text,
  answer text check (length(trim(answer)) > 0),
  created_at timestamptz not null default ledger_now(),
  closed_at timestamptz
);

create index import_question_batch on import_question (batch_id) where closed_at is null;

do $$
declare
  name text;
begin
  foreach name in array array['import_batch', 'import_candidate', 'import_question'] loop
    execute format('create trigger %I before delete on %I for each row execute function forbid_delete()', name || '_no_delete', name);
    execute format('create trigger %I before truncate on %I for each statement execute function forbid_delete()', name || '_no_truncate', name);
  end loop;
end
$$;
