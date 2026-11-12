alter table member add column external_id text unique check (length(trim(external_id)) > 0);
