alter table import_candidate
  add column origin text not null default 'model' check (origin in ('model', 'verify'));

alter table import_question
  add column origin text not null default 'model' check (origin in ('model', 'verify')),
  add column decided_by_model boolean not null default false,
  add check (not decided_by_model or answer is not null);
