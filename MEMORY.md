# Memory

Rewritten by every run, at most 60 lines. Only what the next run needs and cannot see in the code.

## Session setup (cloud container, each run)

- Node 22 is preinstalled; `npm i -g node@24` then `hash -r` gives v24
- PostgreSQL 16: `pg_ctlcluster 16 main start`. The default `DATABASE_URL` has no password, so allow local TCP: replace `scram-sha-256` with `trust` on the 127.0.0.1 and ::1 `host` lines of `/etc/postgresql/16/main/pg_hba.conf`, then `pg_ctlcluster 16 main reload`. Session-only, never in the repo
- npm, PyPI and Ubuntu apt are reachable; Docker Hub, mcr.microsoft.com and packages.microsoft.com are not
- No `add_repo`/`register_repo_root` tools appeared in the 2026-10-18 run; the repo was already cloned at /home/claude/finance and in scope

## Decisions taken in F02 (for the author to review)

- Lifecycle is `closed_at timestamptz` (null = active) on every table; `entry.status` stays the payment status (planned, paid, late) and a corrected entry is closed with `replaced_by`
- Deletes and truncates raise through triggers; `audit_log` and `decision_confirmation` are immutable
- `audit_log.author` is member, claude, import or system; member and claude require `member_id` (the member on whose behalf Claude acts)
- Joint split lives in `member.share_percent` (default 50); null `member_id` on account, entry, expense or debt means joint
- `decision.status` proposed, confirmed, rejected, withdrawn; confirmations in `decision_confirmation`; "both members confirmed" is F07 logic
- Account, institution, nickname and creditor reject any run of 5+ digits, so full numbers cannot be stored by accident
- Migrations are forward-only and each runs in its own transaction

## Notes for next items

- `pg` returns `bigint` columns as strings; F03 should set a `BigInt` type parser
- Tests use `test/db/database.ts` (`testDatabase()`): a fresh `finance_test_<uuid>` database per suite, dropped in `after`
- `import.meta.main` is used for CLI entry points (Node 24)
- Sibling repos use `@modelcontextprotocol/server` and `@modelcontextprotocol/client` 2.x and `zod` 4; follow them in F06
- Failing-test run streak: 0
