# Backlog

Ordered. The agent takes the first unblocked item under **Next**. Items marked **Needs author** are skipped until the author answers below them.

## Next

- **F07b MCP write tools, part 2**: `update_reserve` (balance and target, audited, never below zero), `propose_decision` (status `proposed`, `proposed_by` the calling member, origin `claude`) and `confirm_decision` (one `decision_confirmation` per member; the decision becomes `confirmed` only when every active member confirmed; the proposer's own confirmation counts; reject/withdraw paths). Reuse `writing()` in `src/mcp/server.ts` and add commands next to `src/ledger/record.ts`
- **F08 Forecast**: generate planned entries of a month from active recurring expenses, idempotent
- **F09 HTTP API**: REST over the same ledger module for the future app; JSON errors; tests
- **F10 Spreadsheet import**: `.xlsx` with one sheet per month (income, fixed expenses with installment number, variable expenses, totals) into the ledger; fixture is an invented workbook
- **F11 Demo mode**: read-only MCP server bound to the seed database, no write tools registered
- **F12 Proposal for ADR-008**: `docs/adr-008-proposal.md` describing what was built, decisions taken, and what the Azure stage needs

## Later

- **L04 Test helper discovery**: `node --test` also runs `test/db/database.ts` as a test file; rename helpers outside the default glob or set an explicit pattern in `npm test`
- **L05 Nested writes**: `write()` issues `begin` on the given client; calling it inside another `write()` on the same client would nest. Decide on savepoints or a guard when MCP/HTTP adapters compose writes (F07/F09)
- **L06 Audit JSON numbers**: `audit_log.before/after` store bigint cents as JSON numbers; exact in PostgreSQL but JS readers lose precision above 2^53 cents. Fine for household amounts; revisit only if audit is read back into BigInt

- **L07 Seed clock**: F05 takes the reference date explicitly (tests pass `seedToday`); F08 and the MCP/HTTP adapters must do the same (optional `today` input) so results over the seed stay stable
- **L08 Debt balance**: seeded `balance_cents` is the nominal sum of remaining installments, not amortized principal; decide whether `balance_cents` means payoff amount or remaining installments and record it in the ADR-008 proposal
- **L09 Seed with decisions**: add one proposed and one confirmed joint decision to the seed once F07 exists, so demo mode (F11) can show the confirmation flow

- **L13 JSON money convention**: `src/mcp/json.ts` turns every bigint except a key named `id` into `{ cents, brl }`; any future non-money bigint (foreign ids, counts) must be cast in SQL or the rule must become an explicit key list. Decide before F07/F09 expose more shapes
- **L14 Tool output size**: `month_summary` always returns both months plus differences, and `list_entries` has no limit; fine for a household month, revisit with a `limit` or a compact mode if Claude context use grows
- **L11 Stored late status**: summary derives late from `planned` + `due_on < today`, while `entry.status = 'late'` is also stored; decide whether `late` stays a stored status or becomes derived only, and whether F08/F07 should flip planned to late
- **L12 Summary by member**: per-member totals and the 50/50 share of joint expenses (who owes whom) on top of `monthSummary`

- **L02 Down path**: migrations are forward-only; document the policy (new migration to revert) in the ADR-008 proposal
- **L03 CI**: GitHub Actions workflow with a PostgreSQL service running `npm run check` and `npm test` (needs author approval: touches GitHub settings only through a workflow file)

- **L16 Read snapshot**: over the pool, `compareMonths` runs its two month queries on possibly different connections; a write landing between them gives a mixed view. Run multi-query reads in one `repeatable read` transaction if that matters
- **L17 Remote exposure**: `mcpHttp` accepts only localhost Host/Origin and trusts `x-member` without authentication; the Azure stage needs Entra ID, configurable allowed hostnames and TLS before binding anything but loopback
- **L18 Shared HTTP bridge**: `src/http/node.ts` (`listen`, `nodeHandler`) is generic; F09 should reuse it and add a request body limit for non-MCP routes (the MCP handler already caps at 4 MiB)

- **L19 Paid date bounds**: `mark_paid` and `create_entry` accept any valid `paid_on`, even in the future or long before `due_on`; decide whether to reject `paid_on` after `today`
- **L20 Duplicate writes**: a retried `create_entry` creates a second entry; consider an optional client key or a warning when an active entry with the same month, description and amount exists
- **L21 Stdio member lifetime**: stdio resolves `FINANCE_MEMBER` once at start; a member closed later keeps writing until restart. Resolve per call if members get closed in practice
- **L22 Write tool shapes**: write tools return the `list_entries` read model (camelCase) while inputs are snake_case; keep this convention for F07b/F09 or pick one and record it in the ADR-008 proposal

## Needs author

## Done

- **F07 MCP write tools, part 1**: `create_entry` and `mark_paid` over stdio and HTTP; `src/ledger/record.ts` (`createEntry` resolving category by name and direction, account nickname, member name or `joint`; `markPaid` refusing paid or closed entries) through audited `write()` as `claude` for the calling member, origin `claude`; `createServer(database, member?)` takes a pool (`Database` type) and leases one client per write; HTTP factory reads `x-member` from `ctx.requestInfo`; stdio uses a pool (L15 done) and `FINANCE_MEMBER`, refusing to start for an unknown member; writes refused without a caller; `findEntry` returns the written entry; 9 new tests. Rest split into F07b

- **F06b Streamable HTTP adapter**: `src/mcp/http.ts` `mcpHttp(client)` wraps the SDK `createMcpHandler` (modern plus stateless legacy) with localhost Host/Origin validation, `/mcp` path only, and `x-member` checked against active members (`src/ledger/members.ts` `findMember`, 403 when unknown); `serveHttp` binds `MCP_HOST` (default 127.0.0.1) and `MCP_PORT` (default 3100); `src/http/node.ts` is a dependency-free `node:http` to fetch bridge with JSON 500s; reads take a `Queryable` so a `pg.Pool` (`connectPool`, L01 done for HTTP) serves concurrent requests; `npm run mcp:http`; 10 tests

- **F06 MCP read tools (stdio)**: `src/mcp/server.ts` `createServer(client)` with read-only tools `month_summary` (comparison with previous or chosen month), `list_entries` (month plus direction, category, account nickname, member or `joint`, derived state paid/pending/late, optional `today`) and `list_debts`; `src/ledger/entries.ts`, `src/ledger/debts.ts`, `src/ledger/money.ts` (`formatBrl`, L10 done); `src/mcp/json.ts` serializes cents as `{ cents, brl }` and ids as strings; `npm run mcp:stdio`; 11 tests through in-memory and stdio clients. Streamable HTTP split into F06b

- **F05 Month summary**: `src/ledger/summary.ts` with `monthSummary(client, month, today)` (income and expenses: count, total, paid, pending, late, by category ordered by total; balance) and `compareMonths(client, month, other = previous, today)` (income, expenses, balance and per-category differences); late = stored `late` or `planned` past due on the reference date; `today` defaults to the date in America/Sao_Paulo; 12 tests over the seed

- **F04 Fictional seed**: `npm run db:seed` (`src/db/seed.ts`) plants, in one audited `system` write, two members 50/50, five accounts, ten categories, two salaries, seven recurring expenses (one in 10 installments), two debts, one reserve and one goal, plus 177 entries from 2025-11 to 2026-10 as of a fixed 2026-10-18 (past paid, current month paid/late/planned); refuses a non-empty database; 9 tests including determinism

- **F03 Audited writes**: `src/db/write.ts` with `write(client, actor, work)` giving `create`/`update`/`close` (no delete); one transaction per call, audit row written in the same statement via `to_jsonb` before/after; entity allowlist, `id`/`created_at`/`closed_at` not writable, closed rows locked; active members' `share_percent` must sum to 100 at commit; `int8` parsed as `BigInt` and `date` kept as `YYYY-MM-DD` string

- **F02 Schema**: `db:migrate`/`db:reset`, forward-only runner with advisory lock and `schema_migration`, `001-ledger.sql` with all ledger tables plus `decision_confirmation`, delete/truncate guards, append-only audit log, last-four and digit-run constraints, database time zone; `check` now runs `tsc` too
- **F01 Skeleton**: `package.json` (scripts `test`, `check`, `fix`, `typecheck`), Biome 2.5.14 and TypeScript config copied from `mcp-docs`, `.nvmrc` 24, README
