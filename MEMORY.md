# Memory

Rewritten by every run, at most 60 lines. Only what the next run needs and cannot see in the code.

## Session setup (cloud container, each run)

- No `add_repo`/`register_repo_root` tools in these runs (ToolSearch finds neither). The repo already exists at /home/claude/finance: `git fetch origin && git checkout -B poc origin/poc`
- Node 22 is preinstalled: `npm i -g node@24` then `hash -r` (about a minute; 2026-10-19 run: 24.22.0 worked)
- PostgreSQL 16: `pg_ctlcluster 16 main start`, then `su postgres -c "psql -c \"alter user postgres password 'local'\""`, then `cp .env.example .env` (gitignored)
- Run setup commands one per Bash call; long chained commands were refused by the classifier
- `npm ci` then `npm run db:reset` and `npm run db:seed`; baseline is 117 tests passing
- Use `./node_modules/.bin/biome`, not `npx biome`: npx stalled a call for 3 minutes
- Single test file: `timeout 200 node --env-file=.env --test test/mcp/demo.test.ts` (capture to a log file and read the tail; piping through grep printed nothing once)
- npm, PyPI and Ubuntu apt are reachable; Docker Hub, mcr.microsoft.com and packages.microsoft.com are not
- `tsconfig` has `erasableSyntaxOnly`: no constructor parameter properties, enums or namespaces
- `biome check --write <paths>` fixes import order; `biome ci` rejects `!` non-null assertions in tests (use `assert.ok` to narrow)

## Decisions taken so far (for the author to review)

- Lifecycle is `closed_at timestamptz` (null = active) on every table; `entry.status` is the payment status (planned, paid, late); a corrected entry is closed with `replaced_by`
- Deletes and truncates raise through triggers; `audit_log` and `decision_confirmation` are immutable
- `audit_log.author` is member, claude, import or system; member and claude require `member_id`
- Joint split lives in `member.share_percent`; null `member_id` on account, entry, expense or debt means joint
- `decision.status` proposed, confirmed, rejected, withdrawn; closing a decision must set status in the same `close` call (DB check)
- Account, institution, nickname and creditor reject any run of 5+ digits; migrations forward-only; share sum 100 enforced in `write()` at commit
- MCP output is JSON text; every bigint becomes `{ cents, brl }` except key `id` (string); read models camelCase
- F09: REST writes audited as `member` (origin `manual`); API port 3200, MCP 3100; `RuleError` maps to 422, other errors 500 without details
- F10a: `read-excel-file` 9.3.12 over `xlsx`. Layout is one sheet per month named `YYYY-MM`, header `kind, description, category, account, member, due_on, amount`
- F10b (author to confirm, see BACKLOG Needs author): optional 8th header `installment`; optional `total` row checked against the lines; a month is importable once; import runs as actor `import` via `importMonth`
- F11: demo is stdio only (`src/mcp/demo.ts`, `npm run mcp:demo`), reads only, pool opened with `default_transaction_read_only=on`; shared read tools live in `src/mcp/read.ts`, zod helpers in `src/mcp/schema.ts`
- Commit trailers: the scheduled prompt of 2026-10-19 names Co-Authored-By Claude Opus 5.5 plus the session URL; followed for that run. Earlier runs used Haiku 5.5 (the serving model). Author to pick one

## Notes for next items

- All ledger writes go through `write(client, actor, (ledger) => ...)`; it issues `begin`, so it needs a leased client (`await pool.connect()` then `release()`); nested `write()` on the same client would nest (L05). Compose inside one `write()` with `entryValues` and `ledger.create`
- Write commands in `src/ledger/record.ts` (`createEntry`, `entryValues`, `markPaid`, `updateReserve`, `proposeDecision`, `confirmDecision`, `rejectDecision`, `withdrawDecision`); `forecastMonth` in `forecast.ts`; `importMonth` in `src/import/month.ts`
- Write tools are registered in `src/mcp/server.ts`; read tools only in `src/mcp/read.ts` (`registerReads`), so any new read tool reaches the demo automatically
- `connectPool(url, true)` gives a read-only pool; `pg` returns `bigint` as `BigInt`, `date` as string, `timestamptz` as `Date`, `numeric` as string; `count(*)` needs `::int`
- Seeded test DB: `testDatabase()` then `seed(db.client)` (`test/db/database.ts`); API tests use `serveApi(pool, 0, '127.0.0.1')` and `fetch`
- API tests change the seeded reserve balance (test order matters)
- `formatBrl` (src/ledger/money.ts) renders messages as `R$ 59,00`

## Status

- Tests: 117 passing after F12; `npm run check` green
- F12 done: `docs/adr-008-proposal.md` (proposal for the author, not yet in mastrocola-dev/docs)
- Next is empty: the schedule was stopped on 2026-10-19 per CLAUDE.md. Re-enable only after the author adds an item to Next
- Failing-test run streak: 0
