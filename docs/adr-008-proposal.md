# ADR-008 proposal: household finance ledger POC

Status: proposed for the author's review. Recorded by the build agent on branch `poc`; the ADR itself lives in `mastrocola-dev/docs`.

## Context

The POC is a household finance ledger for two members, with a Claude connector over MCP and a JSON API. The author approved the POC decisions on 2026-10-18 (listed below). This document records what was built, the decisions taken while building it, and what the Azure stage needs.

## What was built

- Schema in one forward-only migration (`db/migrations/001-ledger.sql`): members, accounts, categories, recurring incomes and expenses, debts, entries, reserves, goals, decisions with confirmations, and an append-only `audit_log`.
- Every write goes through `src/db/write.ts` (`write(client, actor, work)`): one transaction, one audit row with before and after, no delete, rows closed through `closed_at`.
- Ledger commands and reads in `src/ledger`: month summary and comparison, entries, debts, reserves, decisions, recording of entries and payments, reserve updates, the joint decision flow, and forecast of a month from recurring sources.
- Spreadsheet import (`src/import`): one sheet per month named `YYYY-MM`, read with `read-excel-file`, written in one audited `import` transaction. Not yet exposed through API or MCP.
- MCP server (`src/mcp`) with read tools, write tools and a read-only demo server. Transports: stdio and streamable HTTP on localhost.
- HTTP API (`src/http/api.ts`) on `node:http` with a fetch-style handler, JSON errors and a 64 KiB body limit.
- Fictional seed (`npm run db:seed`) with two members, twelve months of entries and no real data.

The test suite has 117 tests and runs against PostgreSQL 16 with `npm test`; `npm run check` runs Biome and `tsc`.

## Decisions taken

- Lifecycle is `closed_at timestamptz` on every table; null means active. `entry.status` is the payment status (`planned`, `paid`, `late`). A corrected entry is closed with `replaced_by`.
- Deletes and truncates raise through triggers. `audit_log` and `decision_confirmation` are immutable.
- `audit_log.author` is `member`, `claude`, `import` or `system`; `member` and `claude` require a `member_id`.
- Joint split lives in `member.share_percent` and must sum to 100 among active members, checked at commit. A null `member_id` on account, entry, expense or debt means joint.
- A decision moves from `proposed` to `confirmed`, `rejected` or `withdrawn`. It closes as `confirmed` only when every active member has confirmed. A proposal is not consent by its proposer (the proposer must confirm too).
- Accounts keep institution, nickname and last four digits only. A database check rejects any run of five or more digits in institution, nickname and creditor names.
- Money is `bigint` cents in BRL. Over MCP and HTTP, every bigint except a key named `id` is `{ cents, brl }`; ids are strings. `brl` is rendered as `R$ 1.234,56`.
- Dates are `YYYY-MM-DD`; competence is the first day of the month; the database time zone is America/Sao_Paulo.
- Identity is the `x-member` header over HTTP and `FINANCE_MEMBER` over stdio, local mode only. Claude never executes payments or transfers.
- Percent values are numeric strings with one decimal (`progressPercent`, `monthlyRatePercent`).

## Open questions for the author

- Whether a stored `late` status should remain, given that summaries derive late from `planned` past due (L11).
- Whether `balance_cents` on debt means payoff amount or remaining installments (L08).
- Whether the import layout (optional `installment` column, optional `total` row, one import per month) is final (F10b).
- Whether proposals made in person should auto-confirm for the proposer (L25).

## Azure stage requirements

- Azure Database for PostgreSQL in place of the local server. Migrations stay forward-only; a revert is a new migration (L02).
- Entra ID replaces the `x-member` header. Until then nothing other than loopback may be bound (L17).
- TLS and an allowed-hostnames setting before binding anything other than loopback; the current Host and Origin checks are localhost-only (L17).
- One process or a documented split between MCP and API. Today they are two servers (L34).
- Not-found errors answered `404` instead of `422` (L32).
- Secrets only through environment variables and the platform's secret store; none in the repository.
- Continuous integration running `npm run check` and `npm test` with a PostgreSQL service (L03), only after the author approves.

## Consequences

The ledger rules live in one place and every write is audited, so the Azure stage changes configuration and identity, not the model. The main risks are the open questions above and the lack of authentication on the HTTP surfaces, which is acceptable only while they are bound to loopback.
