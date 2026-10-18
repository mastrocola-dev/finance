# Backlog

Ordered. The agent takes the first unblocked item under **Next**. Items marked **Needs author** are skipped until the author answers below them.

## Next

- **F01 Skeleton**: `package.json` (scripts `test`, `check`, `fix`, `db:migrate`, `db:seed`, `db:reset`), Biome pinned, `tsconfig.json` for editor checks only, `.nvmrc` 24, `.editorconfig`, `.gitignore`, `README.md` with how to run locally
- **F02 Schema**: migration runner and `001-ledger.sql`: member, account (last four digits constraint), category, income, recurring_expense, entry (status planned, paid, late; origin manual, claude, import), debt, reserve, goal, decision, audit_log. Tests that apply migrations to an empty database
- **F03 Audited writes**: repository layer where every write is one transaction with its audit row; no delete path. Tests for audit content and rollback
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

## Needs author

## Done
