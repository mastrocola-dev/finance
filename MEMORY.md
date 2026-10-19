# Memory

Rewritten by every run, at most 60 lines. Only what the next run needs and cannot see in the code.

## Session setup (cloud container, each run)

- No `add_repo`/`register_repo_root` tools in these runs. The repo is cloned at /home/claude/finance; `git fetch origin && git checkout -B poc origin/poc` gives the poc branch
- Node 22 is preinstalled: `npm i -g node@24` then `hash -r` (about a minute)
- PostgreSQL 16: `pg_ctlcluster 16 main start`, then `su postgres -c "psql -c \"alter user postgres password 'local'\""`, then `cp .env.example .env` (gitignored)
- Run setup commands one per Bash call; long chained commands were refused by the classifier
- `npm ci` then `npm run db:reset`; baseline is 107 tests passing
- Use `./node_modules/.bin/biome`, not `npx biome`: npx stalled a call for 3 minutes
- Single test file: `timeout 90 node --test test/import/sheet.test.ts` (run `node --test` without the env file only for files that need no database)
- npm, PyPI and Ubuntu apt are reachable; Docker Hub, mcr.microsoft.com and packages.microsoft.com are not
- `tsconfig` has `erasableSyntaxOnly`: no constructor parameter properties, enums or namespaces

## Decisions taken so far (for the author to review)

- Lifecycle is `closed_at timestamptz` (null = active) on every table; `entry.status` is the payment status (planned, paid, late); a corrected entry is closed with `replaced_by`
- Deletes and truncates raise through triggers; `audit_log` and `decision_confirmation` are immutable
- `audit_log.author` is member, claude, import or system; member and claude require `member_id`
- Joint split lives in `member.share_percent`; null `member_id` on account, entry, expense or debt means joint
- `decision.status` proposed, confirmed, rejected, withdrawn; closing a decision must set status in the same `close` call (DB check)
- Account, institution, nickname and creditor reject any run of 5+ digits; migrations forward-only; share sum 100 enforced in `write()` at commit
- MCP output is JSON text; every bigint becomes `{ cents, brl }` except key `id` (string); read models camelCase
- F09: REST writes audited as `member` (origin `manual`); API port 3200, MCP 3100; `RuleError` maps to 422, other errors 500 without details
- F10a: `read-excel-file` 9.3.12 chosen over `xlsx` on npm (0.18.5, old and with known advisories). Layout is one sheet per month named `YYYY-MM`, header `kind, description, category, account, member, due_on, amount`; amounts are numeric cells in BRL; due_on is text. Author to confirm the layout before F10b
- F10a: parser output is `NewEntry` (from `src/ledger/record.ts`), so F10b only needs to call `createEntry` in one transaction

## Notes for next items

- All ledger writes go through `write(client, actor, (ledger) => ...)`; it issues `begin`, so it needs a leased client (`await pool.connect()` then `release()`); both adapters have a `writing(...)` helper doing that
- Write commands in `src/ledger/record.ts` (`createEntry`, `markPaid`, `updateReserve`, `proposeDecision`, `confirmDecision`, `rejectDecision`, `withdrawDecision`); `forecastMonth` in `forecast.ts`
- Categories are matched case-insensitively against the seed (Salary, Freelance, Housing, Utilities, Groceries, Transport, Health, Leisure, Home, Debt); accounts by nickname (`Joint checking`, `Marcio card`, ...); members by name or `joint`
- `pg` returns `bigint` as `BigInt`, `date` as string, `timestamptz` as `Date`, `numeric` as string; `count(*)` needs `::int`
- Seeded test DB: `testDatabase()` then `seed(db.client)` (`test/db/database.ts`); API tests use `serveApi(pool, 0, '127.0.0.1')` and `fetch`
- API tests change the seeded reserve balance (test order matters)
- `tsconfig` has `erasableSyntaxOnly`; keep new modules free of `enum`/parameter properties

## Status

- Tests: 107 passing after F10a
- Next: F10b spreadsheet import into the ledger, then F11 demo mode, then F12 ADR-008 proposal
- Failing-test run streak: 0
