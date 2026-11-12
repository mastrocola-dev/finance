alter table category drop constraint category_name_kind_key;
create unique index category_open_name on category (lower(name), kind) where closed_at is null;

alter table account drop constraint account_institution_last_four_kind_key;
create unique index account_open_number on account (institution, last_four, kind) where closed_at is null;
create unique index account_open_nickname on account (lower(nickname)) where closed_at is null;

alter table reserve drop constraint reserve_name_key;
create unique index reserve_open_name on reserve (lower(name)) where closed_at is null;

alter table goal drop constraint goal_name_key;
create unique index goal_open_name on goal (lower(name)) where closed_at is null;
