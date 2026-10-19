# Memory

Rewritten by every run, at most 60 lines. Only what the next run needs and cannot see in the code.

## Session setup (cloud container, each run)

- Node 22 is preinstalled; `npm i -g node@24` then `hash -r` gives v24
- PostgreSQL 16: `pg_ctlcluster 16 main start`
- Local auth: `su postgres -c "psql -c \"alter user postgres password 'local'\""` then `cp .env.example .env` (scripts load it via `--env-file-if-exists`; `.env` is gitignored). Without it the default URL has no password and `npm test` hangs
- Run setup commands one per Bash call; long chained commands were refused by the classifier
- npm, PyPI and Ubuntu apt are reachable; Docker Hub, mcr.microsoft.com and packages.microsoft.com are not
- No `add_repo`/`register_repo_root` tools exist in these runs; the repo is already cloned at /home/claude/finance (detached on main), `git fetch origin poc && git checkout -B poc origin/poc` works
- `tsconfig` has `erasableSyntaxOnly`: no constructor parameter properties, enums or namespaces

## Decisions taken so far (for the author to review)

- Lifecycle is `closed_at timestamptz` (null = active) on every table; `entry.status` is the payment status (planned, paid, late); a corrected entry is closed with `replaced_by`
- Deletes and truncates raise through triggers; `audit_log` and `decision_confirmation` are immutable
- `audit_log.author` is member, claude, import or system; member and claude require `member_id`
- Joint split lives in `member.share_percent`; null `member_id` on account, entry, expense or debt means joint
- `decision.status` proposed, confirmed, rejected, withdrawn; closing a decision must set status in the same `close` call (DB check)
- Account, institution, nickname and creditor reject any run of 5+ digits; migrations forward-only; share sum 100 enforced in `write()` at commit
- F04: seed in English, invented institutions; fixed `seedToday` 2026-10-18; only Electricity in 2026-10 is stored `late`; debt `balance_cents` = installment × remaining (L08)
- F05: summary groups by `competence`, active entries only; late = stored `late` or `planned` past due (L11)
- F06: MCP output is JSON text; every bigint becomes `{ cents, brl }` except key `id` (string) (L13); read models camelCase
- F06b: own `node:http` bridge (no hono); `createMcpHandler` stateless legacy; `x-member` optional for reads, 403 when unknown; localhost Host/Origin only (L17)
- F07: MCP writes audited `claude` + calling member's id; entry `origin` from actor (`claude`→claude, `import`→import, else manual)
- F07b/c: three decision answer tools; proposing does not auto-confirm (L25); `list_decisions` default `proposed`, `all`, limit 1..100 (L26); `progressPercent` numeric string (L27)
- F08: forecast plans recurring expenses and incomes (not debts, L28); idempotent per source and month; advisory lock `hashtext('forecast')`
- F09: REST writes audited as `member` (origin `manual`), not `claude`; inputs snake_case, outputs the same camelCase read models as MCP (L22); API port 3200, separate from MCP 3100 (L34)
- F09: ledger rule violations throw `RuleError` (`src/ledger/rule.ts`), mapped to 422; any other error is 500 without details. Programmer errors in `write.ts` (unknown entity, unwritable column, nothing to update) stay plain `Error`. "not found" is still 422 (L32)
- F09: `assertDate` message is now `date must be YYYY-MM-DD` (was `today must be`)
- Dependencies: `@modelcontextprotocol/server` 2.3.1, `zod` 4.6.7, `pg`; dev `@modelcontextprotocol/client` 2.3.1

## Notes for next items

- All ledger writes go through `write(client, actor, (ledger) => ...)`; it issues `begin`, so it needs a leased client (`await pool.connect()` then `release()`); both adapters have a `writing(...)` helper doing that
- Reads take `Queryable`; `connectPool(url)` builds the pool; `Database` = Queryable + `connect()`
- API (`src/http/api.ts`): `route(method, path, handle, status = 200)` with `URLPattern` (global in Node 24); handlers get `{ request, params, query, member, client }` and return the body, serialized by `toJson` from `src/mcp/json.ts`; non-GET without member → 401 before the handler; `readJson(request)` enforces JSON content-type and 64 KiB; `referenceDate(context)` reads `?today=`
- MCP: `createServer(pool, member?)` in `src/mcp/server.ts`; HTTP `src/mcp/http.ts`; stdio `src/mcp/stdio.ts`
- Write commands in `src/ledger/record.ts` (`createEntry`, `markPaid`, `updateReserve`, `proposeDecision`, `confirmDecision`, `rejectDecision`, `withdrawDecision`); `forecastMonth` in `forecast.ts`; read models `findEntry`/`listEntries`, `findReserve`/`listReserves`, `findDecision`/`listDecisions`, `listDebts`, `compareMonths`
- Seed reserve `Emergency fund` (balance 1800000, target 3000000); no decisions in the seed (L09); categories matched case-insensitively (`groceries`, `health`, `salary`)
- Seed 2026-10 as of `seedToday`: 16 active entries; expenses 1023800 (late 22200); 2026-09 expenses 1009500; `other.month` in a comparison is `YYYY-MM-01`
- To get a seeded test DB: `testDatabase()` then `seed(db.client)`; `db.url` for a pool; API tests use `serveApi(pool, 0, '127.0.0.1')` and `fetch`
- `pg` returns `bigint` as `BigInt`, `date` as string, `timestamptz` as `Date`, `numeric` as string; `count(*)` needs `::int`
- Raw HTTP tests needing a custom Host header use `node:http` `request` (fetch cannot override Host)
- Tests: 99 passing after F09 (tool name lists asserted in `server.test.ts` and `http.test.ts`)
- Next: F09b API write routes for reserves, decisions and forecast
- Failing-test run streak: 0
