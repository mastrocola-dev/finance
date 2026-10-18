# Backlog

Ordered. The agent takes the first unblocked item under **Next**. Items marked **Needs author** are skipped until the author answers below them.

## Next

- **F03 Audited writes**: repository layer where every write is one transaction with its audit row; no delete path. Tests for audit content and rollback. Also: parse `int8` as `BigInt` (pg returns strings today) and enforce that active members' `share_percent` sums to 100 when writing members
- **F04 Fictional seed**: deterministic household with twelve months of income, recurring expenses, entries, two debts, one reserve, one goal
- **F05 Month summary**: income, expenses by category, paid, pending and late totals, comparison with another month; tests with the seed
- **F06 MCP read tools**: `month_summary`, `list_entries` (filters: month, category, account, member, status), `list_debts`; stdio and streamable HTTP adapters; tests through an in-memory MCP client
- **F07 MCP write tools**: `create_entry`, `mark_paid`, `update_reserve`, `propose_decision`, `confirm_decision`; author recorded as `claude` on behalf of the calling member
- **F08 Forecast**: generate planned entries of a month from active recurring expenses, idempotent
- **F09 HTTP API**: REST over the same ledger module for the future app; JSON errors; tests
- **F10 Spreadsheet import**: `.xlsx` with one sheet per month (income, fixed expenses with installment number, variable expenses, totals) into the ledger; fixture is an invented workbook
- **F11 Demo mode**: read-only MCP server bound to the seed database, no write tools registered
- **F12 Proposal for ADR-008**: `docs/adr-008-proposal.md` describing what was built, decisions taken, and what the Azure stage needs

## Later

- **L01 Pool**: replace the single `pg.Client` in `src/db/connection.ts` with a `pg.Pool` once HTTP and MCP adapters run concurrently (F06/F09)
- **L02 Down path**: migrations are forward-only; document the policy (new migration to revert) in the ADR-008 proposal
- **L03 CI**: GitHub Actions workflow with a PostgreSQL service running `npm run check` and `npm test` (needs author approval: touches GitHub settings only through a workflow file)

## Needs author

## Done

- **F02 Schema**: `db:migrate`/`db:reset`, forward-only runner with advisory lock and `schema_migration`, `001-ledger.sql` with all ledger tables plus `decision_confirmation`, delete/truncate guards, append-only audit log, last-four and digit-run constraints, database time zone; `check` now runs `tsc` too
- **F01 Skeleton**: `package.json` (scripts `test`, `check`, `fix`, `typecheck`), Biome 2.5.14 and TypeScript config copied from `mcp-docs`, `.nvmrc` 24, README
