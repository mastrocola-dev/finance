# Memory

Rewritten by every run, at most 60 lines. Only what the next run needs and cannot see in the code.

## Session setup (cloud container, each run)

- Node 22 is preinstalled; `npm i -g node@24` then `hash -r` gives v24
- PostgreSQL 16: `pg_ctlcluster 16 main start`
- Local auth: `su postgres -c "psql -c \"alter user postgres password 'local'\""` then `cp .env.example .env` (scripts load it via `--env-file-if-exists`; `.env` is gitignored). Without it the default URL has no password and `npm test` hangs
- Run setup commands one per Bash call; long chained commands were refused by the classifier
- npm, PyPI and Ubuntu apt are reachable; Docker Hub, mcr.microsoft.com and packages.microsoft.com are not
- No `add_repo`/`register_repo_root` tools exist in these runs; the repo is already cloned at /home/claude/finance (detached on main), `git fetch origin && git checkout poc` works

## Decisions taken so far (for the author to review)

- Lifecycle is `closed_at timestamptz` (null = active) on every table; `entry.status` is the payment status (planned, paid, late); a corrected entry is closed with `replaced_by`
- Deletes and truncates raise through triggers; `audit_log` and `decision_confirmation` are immutable
- `audit_log.author` is member, claude, import or system; member and claude require `member_id`
- Joint split lives in `member.share_percent`; null `member_id` on account, entry, expense or debt means joint
- `decision.status` proposed, confirmed, rejected, withdrawn; closing a decision must set status in the same `close` call (DB check)
- Account, institution, nickname and creditor reject any run of 5+ digits
- Migrations are forward-only, one transaction each; share sum of 100 enforced in `write()` at commit
- F04: seed in English, invented institutions; fixed `seedToday` 2026-10-18 (months 2025-11..2026-10); only Electricity in 2026-10 is stored `late`; debt `balance_cents` = installment × remaining (L08)
- F05: summary groups by `competence`, active entries only; paid = `paid`, pending = `planned` due on/after today, late = stored `late` or `planned` past due (L11)
- F06: MCP output is JSON text only; every bigint becomes `{ cents, brl }` except key `id` (string) (L13); read models use camelCase keys; tools annotated `readOnlyHint: true`
- F06b: no `@modelcontextprotocol/node` (it pulls hono); own bridge in `src/http/node.ts`. `createMcpHandler` default `legacy: 'stateless'`, so plain JSON-RPC POSTs without `initialize` work (tests use that)
- F06b: `x-member` is optional for reads; when present it must name an active member (case-insensitive, trimmed) or the answer is 403 before the SDK sees the request
- F06b: only localhost Host/Origin accepted even if `MCP_HOST` is changed (L17)
- F07: write tools are always registered (listing stable); they throw (tool error) without a calling member. `createServer(database, member?)` needs a `Database` (`Queryable` + `connect()` → `PoolClient`), so tests use `connectPool(db.url)` instead of `db.client`
- F07: author `claude` + calling member's id; entry `origin` derives from actor (`claude` → claude, `import` → import, else manual); `mark_paid` default date is `paid_on ?? today ?? localToday()`; write tools return the read model via `findEntry`
- F07c: `list_decisions` status default `proposed`, `all` for every status, newest first, `limit` 1..100 default 20 (L26); `list_reserves` adds `missing` and `progressPercent` (numeric text, one decimal), both null without target (L27)
- F07b: decisions answered by three tools (`confirm_decision`, `reject_decision`, `withdraw_decision`) registered from one table in `server.ts`; proposing does not auto-confirm (L25); reject only by a non-proposer, withdraw only by the proposer; reserves found by name (case-insensitive)
- F08: forecast plans recurring expenses and incomes (not debts, L28); skips a source with any entry in the month, closed included; always `planned`, never flips to late (L11); global `pg_advisory_xact_lock(hashtext('forecast'))` serializes forecasts; `forecast_month` returns `{ month, skipped, created }`
- Dependencies: `@modelcontextprotocol/server` 2.3.1, `zod` 4.6.7, `pg`; dev `@modelcontextprotocol/client` 2.3.1

## Notes for next items

- All ledger writes go through `write(client, actor, (ledger) => ...)` from `src/db/write.ts`; it issues `begin` on the given client, so it needs a real client (`await pool.connect()` then `release()`), never the pool itself
- Reads take `Queryable` (`Pick<ClientBase, 'query'>` in `src/db/connection.ts`), so a `pg.Pool` or a client both work; `connectPool(url)` builds the pool
- Read side: `src/ledger/summary.ts` (`monthSummary`, `compareMonths`, `competenceOf`, `shiftMonth`, `localToday`, `assertDate`), `entries.ts`, `debts.ts`, `members.ts` (`findMember`), `money.ts` (`formatBrl`, `money`)
- MCP: `createServer(client)` in `src/mcp/server.ts`; `result(value)` in `src/mcp/json.ts`; stdio `src/mcp/stdio.ts`; HTTP `src/mcp/http.ts` (`mcpHttp(client)` → `{ fetch, close }`, `serveHttp(client, port, host)` → `{ url, close }`, port 0 for tests)
- Forecast: `forecastMonth` in `src/ledger/forecast.ts` (uses exported `origins` from `record.ts`)
- Write commands live in `src/ledger/record.ts` (`createEntry`, `markPaid`, `updateReserve`, `proposeDecision`, `confirmDecision`, `rejectDecision`, `withdrawDecision`); MCP handlers wrap them in `writing((connection, actor) => ...)` inside `createServer`, which leases and releases a pool client. Read models `findReserve(name)`/`listReserves` in `reserves.ts`, `findDecision(id)`/`listDecisions(status, limit)` and `statuses` in `decisions.ts`, sharing one `select` each
- HTTP factory: `createMcpHandler(async ({ requestInfo }) => createServer(client, member))` resolves `x-member` per request; stdio resolves `FINANCE_MEMBER` once at start
- Seed reserve: `Emergency fund` (balance 1800000, target 3000000); no decisions in the seed yet (L09)
- Seed categories are matched case-insensitively (`groceries`, `health`, `salary` exist); `decision_confirmation` has PK (decision_id, member_id) and is immutable; `decision` check: `status = 'proposed'` iff `closed_at is null`
- SDK 2.x: `Client`, `InMemoryTransport`, `StreamableHTTPClientTransport` from `@modelcontextprotocol/client` (headers via `{ requestInit: { headers } }`); `StdioClientTransport` from `@modelcontextprotocol/client/stdio`; zod failures and thrown errors come back as `isError: true` results
- Raw HTTP tests use `node:http` `request` because fetch cannot override the Host header
- Seed 2026-10 as of `seedToday`: 16 active entries; income 2030000 (paid 1770000, pending 260000); expenses 13 entries 1023800 (paid 818300, pending 183300, late 22200); 2026-09 expenses 1009500 all paid; two debts; members Marcio and Gabriela
- To get a seeded test DB: `testDatabase()` then `seed(db.client)` (about 0.3 s); `db.url` for a pool
- `pg` returns `bigint` as `BigInt` (including ids), `date` as `YYYY-MM-DD` string, `timestamptz` as `Date`, `numeric` as string; `count(*)` needs `::int`
- `import.meta.main` is used for CLI entry points
- Tests: 89 passing after F08 (`test/ledger/forecast.test.ts` shares state in order; tool name lists asserted in `server.test.ts` and `http.test.ts`)
- Seed forecast of 2026-11: 9 entries (7 recurring incl. Sofa #10, 2 salaries); 2026-12: 8 (Sofa ended)
- Next: F09 HTTP API; reuse `src/http/node.ts` (L18) and add a body limit
- Failing-test run streak: 0
