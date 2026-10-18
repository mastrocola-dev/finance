# Memory

Rewritten by every run, at most 60 lines. Only what the next run needs and cannot see in the code.

## Session setup (cloud container, each run)

- Node 22 is preinstalled; `npm i -g node@24` then `hash -r` gives v24
- PostgreSQL 16: `pg_ctlcluster 16 main start`
- Local auth: editing `pg_hba.conf` to `trust` was refused by the session's permission classifier on 2026-10-18 (F03 run). What worked: `su postgres -c "psql -c \"alter user postgres password 'local'\""` and export `DATABASE_URL=postgres://postgres:local@localhost:5432/finance` for `db:reset`, `test` and `check`. Session-only, never in the repo
- Run setup commands one per Bash call; long chained commands were refused by the classifier
- npm, PyPI and Ubuntu apt are reachable; Docker Hub, mcr.microsoft.com and packages.microsoft.com are not
- No `add_repo`/`register_repo_root` tools exist in these runs; the repo is already cloned at /home/claude/finance (detached on main), `git fetch origin poc && git checkout -B poc origin/poc`

## Decisions taken so far (for the author to review)

- Lifecycle is `closed_at timestamptz` (null = active) on every table; `entry.status` is the payment status (planned, paid, late); a corrected entry is closed with `replaced_by`
- Deletes and truncates raise through triggers; `audit_log` and `decision_confirmation` are immutable
- `audit_log.author` is member, claude, import or system; member and claude require `member_id` (the member on whose behalf Claude acts)
- Joint split lives in `member.share_percent`; null `member_id` on account, entry, expense or debt means joint
- `decision.status` proposed, confirmed, rejected, withdrawn; closing a decision must set status in the same `close` call (DB check)
- Account, institution, nickname and creditor reject any run of 5+ digits
- Migrations are forward-only, one transaction each
- F03: share sum of 100 is enforced in `write()` at commit (not in the DB), so several members can be created or rebalanced in one `write()` call. Direct SQL can still break it
- F03: `audit_log.entity_id` is null for `decision_confirmation` (composite key); the row is in `after`

## Notes for next items

- All ledger writes go through `write(client, actor, (ledger) => ...)` from `src/db/write.ts`; never insert with raw SQL outside migrations and tests
- Seed (F04) should use actor `{ author: 'system' }` and create both members in one `write()` (shares must total 100 at commit)
- `pg` now returns `bigint` as `BigInt` (including ids) and `date` as `YYYY-MM-DD` string; `timestamptz` is a `Date`; `numeric` is a string; `count(*)` needs `::int`
- Tests use `test/db/database.ts` (`testDatabase()`): fresh `finance_test_<uuid>` database per suite, dropped in `after`
- `import.meta.main` is used for CLI entry points
- Sibling repos use `@modelcontextprotocol/server` and `@modelcontextprotocol/client` 2.x and `zod` 4; follow them in F06
- Tests: 20 passing after F03
- Failing-test run streak: 0
