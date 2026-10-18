# Memory

Rewritten by every run, at most 60 lines. Only what the next run needs and cannot see in the code.

## Session setup (cloud container, each run)

- Node 22 is preinstalled; `npm i -g node@24` then `hash -r` gives v24
- PostgreSQL 16: `pg_ctlcluster 16 main start`
- Local auth: `su postgres -c "psql -c \"alter user postgres password 'local'\""` and export `DATABASE_URL=postgres://postgres:local@localhost:5432/finance` for `db:reset`, `db:seed`, `test` and `check`. Session-only, never in the repo (editing `pg_hba.conf` was refused by the permission classifier)
- Run setup commands one per Bash call; long chained commands were refused by the classifier
- npm, PyPI and Ubuntu apt are reachable; Docker Hub, mcr.microsoft.com and packages.microsoft.com are not
- No `add_repo`/`register_repo_root` tools exist in these runs; the repo is already cloned at /home/claude/finance (detached on main), `git fetch origin poc && git checkout -B poc origin/poc`

## Decisions taken so far (for the author to review)

- Lifecycle is `closed_at timestamptz` (null = active) on every table; `entry.status` is the payment status (planned, paid, late); a corrected entry is closed with `replaced_by`
- Deletes and truncates raise through triggers; `audit_log` and `decision_confirmation` are immutable
- `audit_log.author` is member, claude, import or system; member and claude require `member_id`
- Joint split lives in `member.share_percent`; null `member_id` on account, entry, expense or debt means joint
- `decision.status` proposed, confirmed, rejected, withdrawn; closing a decision must set status in the same `close` call (DB check)
- Account, institution, nickname and creditor reject any run of 5+ digits
- Migrations are forward-only, one transaction each
- Share sum of 100 is enforced in `write()` at commit (not in the DB)
- `audit_log.entity_id` is null for `decision_confirmation` (composite key); the row is in `after`
- F04: seed data is in English (descriptions, categories), institutions are invented (Banco Aurora, Banco Horizonte, Financeira Exemplo); entry `origin` is `manual`
- F04: seed reference date is fixed (`seedToday` 2026-10-18, months 2025-11..2026-10) so it is deterministic; only Electricity in 2026-10 is `late`
- F04: debt `balance_cents` = installment × remaining installments (see L08)

## Notes for next items

- All ledger writes go through `write(client, actor, (ledger) => ...)` from `src/db/write.ts`; never insert with raw SQL outside migrations and tests
- F05 should take the reference date as a parameter (default real today) and test against the seed with `seedToday`; seed exports `seed`, `seedMonths`, `seedToday`
- Seed shape for F05 assertions: 2026-10 has 13 expense entries (9 paid 818300, 1 late 22200, 3 planned 183300 cents) and 3 income entries (one planned freelance on the 20th); freelance only in months index 2, 5, 8, 11
- To get a seeded test DB: `testDatabase()` then `seed(db.client)` (about 0.3 s)
- `pg` returns `bigint` as `BigInt` (including ids), `date` as `YYYY-MM-DD` string, `timestamptz` as `Date`, `numeric` as string; `count(*)` needs `::int`, `sum()` of bigint is `numeric` (string) unless cast `::bigint`
- Tests use `test/db/database.ts` (`testDatabase()`): fresh `finance_test_<uuid>` database per suite, dropped in `after`
- `import.meta.main` is used for CLI entry points
- Sibling repos use `@modelcontextprotocol/server` and `@modelcontextprotocol/client` 2.x and `zod` 4; follow them in F06
- Tests: 29 passing after F04
- Failing-test run streak: 0
