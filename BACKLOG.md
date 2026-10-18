# Backlog

Ordered. The agent takes the first unblocked item under **Next**. Items marked **Needs author** are skipped until the author answers below them.

## Next

- **F05 Month summary**: income, expenses by category, paid, pending and late totals, comparison with another month; tests with the seed
- **F06 MCP read tools**: `month_summary`, `list_entries` (filters: month, category, account, member, status), `list_debts`; stdio and streamable HTTP adapters; tests through an in-memory MCP client
- **F07 MCP write tools**: `create_entry`, `mark_paid`, `update_reserve`, `propose_decision`, `confirm_decision`; author recorded as `claude` on behalf of the calling member
- **F08 Forecast**: generate planned entries of a month from active recurring expenses, idempotent
- **F09 HTTP API**: REST over the same ledger module for the future app; JSON errors; tests
- **F10 Spreadsheet import**: `.xlsx` with one sheet per month (income, fixed expenses with installment number, variable expenses, totals) into the ledger; fixture is an invented workbook
- **F11 Demo mode**: read-only MCP server bound to the seed database, no write tools registered
- **F12 Proposal for ADR-008**: `docs/adr-008-proposal.md` describing what was built, decisions taken, and what the Azure stage needs

## Later

- **L04 Test helper discovery**: `node --test` also runs `test/db/database.ts` as a test file; rename helpers outside the default glob or set an explicit pattern in `npm test`
- **L05 Nested writes**: `write()` issues `begin` on the given client; calling it inside another `write()` on the same client would nest. Decide on savepoints or a guard when MCP/HTTP adapters compose writes (F07/F09)
- **L06 Audit JSON numbers**: `audit_log.before/after` store bigint cents as JSON numbers; exact in PostgreSQL but JS readers lose precision above 2^53 cents. Fine for household amounts; revisit only if audit is read back into BigInt

- **L07 Seed clock**: the seed freezes "today" at 2026-10-18 (`seedToday`); once F05/F08 compute late or pending from the real date, pass the reference date in explicitly so summaries over the seed stay stable
- **L08 Debt balance**: seeded `balance_cents` is the nominal sum of remaining installments, not amortized principal; decide whether `balance_cents` means payoff amount or remaining installments and record it in the ADR-008 proposal
- **L09 Seed with decisions**: add one proposed and one confirmed joint decision to the seed once F07 exists, so demo mode (F11) can show the confirmation flow

- **L01 Pool**: replace the single `pg.Client` in `src/db/connection.ts` with a `pg.Pool` once HTTP and MCP adapters run concurrently (F06/F09)
- **L02 Down path**: migrations are forward-only; document the policy (new migration to revert) in the ADR-008 proposal
- **L03 CI**: GitHub Actions workflow with a PostgreSQL service running `npm run check` and `npm test` (needs author approval: touches GitHub settings only through a workflow file)

## Needs author

## Done

- **F04 Fictional seed**: `npm run db:seed` (`src/db/seed.ts`) plants, in one audited `system` write, two members 50/50, five accounts, ten categories, two salaries, seven recurring expenses (one in 10 installments), two debts, one reserve and one goal, plus 177 entries from 2025-11 to 2026-10 as of a fixed 2026-10-18 (past paid, current month paid/late/planned); refuses a non-empty database; 9 tests including determinism

- **F03 Audited writes**: `src/db/write.ts` with `write(client, actor, work)` giving `create`/`update`/`close` (no delete); one transaction per call, audit row written in the same statement via `to_jsonb` before/after; entity allowlist, `id`/`created_at`/`closed_at` not writable, closed rows locked; active members' `share_percent` must sum to 100 at commit; `int8` parsed as `BigInt` and `date` kept as `YYYY-MM-DD` string

- **F02 Schema**: `db:migrate`/`db:reset`, forward-only runner with advisory lock and `schema_migration`, `001-ledger.sql` with all ledger tables plus `decision_confirmation`, delete/truncate guards, append-only audit log, last-four and digit-run constraints, database time zone; `check` now runs `tsc` too
- **F01 Skeleton**: `package.json` (scripts `test`, `check`, `fix`, `typecheck`), Biome 2.5.14 and TypeScript config copied from `mcp-docs`, `.nvmrc` 24, README
