# Backlog

Ordered. The agent takes the first unblocked item under **Next**. Items marked **Needs author** are skipped until the author answers below them.

## Next

- **W01 Workspace**: root `package.json` gains `"workspaces": ["web"]`; `web/` is its own package (React 19, Vite, TypeScript strict, Biome with the same rules, Vitest); root `check` and `test` also run the web ones; `npm run web:dev` serves Vite with `/api` proxied to the API on 3200 (no CORS)
- **W02 API contract**: OpenAPI 3.1 document built from the existing zod schemas (`z.toJSONSchema`), served at `GET /api/openapi.json` and written to `openapi.json` by `npm run openapi`; a test fails when a route has no documented schema. Web client typed from it with `openapi-typescript` and `openapi-fetch`
- **W03 API for the screens**: `GET /api/members`, `GET /api/goals`, `GET /api/audit` (filters author, member, entity; `limit` and `before` cursor; counts per author), `GET /api/months/:month/split` (who owes whom from joint expenses and `share_percent`), `GET /api/net-worth` (reserves and goals minus debt balances); tests; OpenAPI updated
- **W04 Design system**: tokens of `docs/design.md` as CSS variables for light and dark mapped into Tailwind v4 `@theme`; shadcn/ui initialised with only the components used; Geist and Geist Mono self-hosted (`@fontsource-variable/geist`, `@fontsource-variable/geist-mono` or equivalent); BRL, date and month formatters in pt-BR with tests; theme switch (system default, stored per browser)
- **W05 App shell**: TanStack Router with the six routes of `docs/design.md`; sidebar from 768 px, bottom tab bar below; month switcher and member selector in the URL; local identity picker sending `x-member`; TanStack Query client; shared loading skeleton, empty and error states; Playwright set up (see CLAUDE.md) with screenshots
- **W06 Month overview** (`/`)
- **W07 Bills checklist** (`/contas`): optimistic mark-paid with rollback on error and an undo toast
- **W08 Entries** (`/lancamentos`): quick add with react-hook-form and the API's zod rules, search, filters, table, totals
- **W09 Net worth** (`/patrimonio`): debts, reserves, goals
- **W10 Decisions** (`/decisoes`): propose, confirm, reject, withdraw, history
- **W11 Activity** (`/atividade`): audit timeline with author filters and before/after table
- **W12 PWA and quality**: `vite-plugin-pwa` manifest and icons (generated, no third-party art), offline read cache; Playwright end-to-end flow over the seed (add entry, mark paid, confirm decision); axe with zero violations on every route; Lighthouse-style budget recorded in MEMORY
- **W13 Showcase**: README section with the screenshots (light and dark, mobile and desktop), how to run API plus web locally, architecture sketch

## Later

- **L36 Import entry point**: F10b has no API or MCP route; add one (author-only, reads the sheet from a configured path, never from request bodies) if the author wants to import from Claude
- **L37 Replace an import**: a month imported once cannot be re-imported; a replace flow must close the import entries (nothing is deleted) and write the new ones in the same transaction
- **L38 Import versus manual entries**: importing a month that already has manual entries creates duplicates; detect same month, description and amount before writing
- **L04 Test helper discovery**: `node --test` also runs `test/db/database.ts` as a test file; rename helpers outside the default glob or set an explicit pattern in `npm test`
- **L05 Nested writes**: `write()` issues `begin` on the given client; calling it inside another `write()` on the same client would nest. Decide on savepoints or a guard when MCP/HTTP adapters compose writes (F07/F09)
- **L06 Audit JSON numbers**: `audit_log.before/after` store bigint cents as JSON numbers; exact in PostgreSQL but JS readers lose precision above 2^53 cents. Fine for household amounts; revisit only if audit is read back into BigInt

- **L07 Seed clock**: F05 takes the reference date explicitly (tests pass `seedToday`); F08 and the MCP/HTTP adapters must do the same (optional `today` input) so results over the seed stay stable
- **L08 Debt balance**: seeded `balance_cents` is the nominal sum of remaining installments, not amortized principal; decide whether `balance_cents` means payoff amount or remaining installments and record it in the ADR-008 proposal
- **L09 Seed with decisions**: add one proposed and one confirmed joint decision to the seed once F07 exists, so demo mode (F11) can show the confirmation flow

- **L13 JSON money convention**: `src/mcp/json.ts` turns every bigint except a key named `id` into `{ cents, brl }`; any future non-money bigint (foreign ids, counts) must be cast in SQL or the rule must become an explicit key list. Decide before F07/F09 expose more shapes
- **L14 Tool output size**: `month_summary` always returns both months plus differences, and `list_entries` has no limit; fine for a household month, revisit with a `limit` or a compact mode if Claude context use grows
- **L11 Stored late status**: summary derives late from `planned` + `due_on < today`, while `entry.status = 'late'` is also stored. F08 decided for the POC: forecast writes `planned` only and nothing flips planned to late; author to confirm whether stored `late` should go away
- **L12 Summary by member**: per-member totals and the 50/50 share of joint expenses (who owes whom) on top of `monthSummary`

- **L02 Down path**: migrations are forward-only; document the policy (new migration to revert) in the ADR-008 proposal
- **L03 CI**: GitHub Actions workflow with a PostgreSQL service running `npm run check` and `npm test` (needs author approval: touches GitHub settings only through a workflow file)

- **L16 Read snapshot**: over the pool, `compareMonths` runs its two month queries on possibly different connections; a write landing between them gives a mixed view. Run multi-query reads in one `repeatable read` transaction if that matters
- **L17 Remote exposure**: `mcpHttp` accepts only localhost Host/Origin and trusts `x-member` without authentication; the Azure stage needs Entra ID, configurable allowed hostnames and TLS before binding anything but loopback
- **L32 Not found status**: the API answers `422` for every `RuleError`, including "entry N not found or closed"; give missing entities their own error (or a `kind` on `RuleError`) so the API can answer `404`
- **L33 Shared JSON shape**: `toJson` lives in `src/mcp/json.ts` and the API imports it from there; move it to a neutral module (e.g. `src/ledger/json.ts`) if a third adapter appears
- **L34 One process**: MCP (3100) and API (3200) run as two servers; consider one `node:http` server routing `/mcp` and `/api` once the app needs both, sharing the pool

- **L19 Paid date bounds**: `mark_paid` and `create_entry` accept any valid `paid_on`, even in the future or long before `due_on`; decide whether to reject `paid_on` after `today`
- **L20 Duplicate writes**: a retried `create_entry` creates a second entry; consider an optional client key or a warning when an active entry with the same month, description and amount exists
- **L21 Stdio member lifetime**: stdio resolves `FINANCE_MEMBER` once at start; a member closed later keeps writing until restart. Resolve per call if members get closed in practice
- **L23 Confirmation audit id**: `decision_confirmation` has no `id`, so its `audit_log.entity_id` is null and the link lives only in `after->>'decision_id'`; consider storing the decision id as `entity_id` for confirmations
- **L24 Members closed mid-decision**: a decision is re-evaluated only on `confirm_decision`; if a member is closed while it is proposed and everyone else already confirmed, it stays proposed until someone confirms again. Re-evaluate open decisions when a member is closed
- **L25 Proposer auto-confirm**: proposing does not confirm; the proposer must call `confirm_decision` too (a Claude-made proposal is not taken as the member's consent). Author may prefer auto-confirm for proposals the member makes in person
- **L26 Decision history paging**: `list_decisions` takes `limit` (default 20, max 100) but no cursor; add a `before` id or date if the closed history grows past what one call should return
- **L27 Reserve progress format**: `progressPercent` is a numeric string with one decimal (`'60.0'`, PostgreSQL `round`), like `monthlyRatePercent`; `missing` is `{ cents, brl }` or null without a target. Record the percent convention in the ADR-008 proposal
- **L28 Debt installments in forecast**: `debt` has no due day, so F08 does not plan debt installments; add `day_of_month` to `debt` (new migration) and plan installments `installments_paid + 1 ..` in `forecastMonth`
- **L29 Income without category**: `income.category_id` is nullable and `forecastMonth` silently leaves such incomes out (not counted in `skipped`); make it `not null` or report them
- **L30 Forecast of closed references**: forecast plans sources whose member, account or category is closed; filter them or close the source when its member is closed
- **L31 Forecast amounts**: variable bills (Electricity) are planned at the registered amount; consider the average of the last three paid entries
- **L35 Malformed reserve name**: `PATCH /api/reserves/:name` calls `decodeURIComponent`, so a malformed percent sequence answers `500` instead of `400`; validate the segment with zod or catch `URIError` in `src/http/api.ts`
- **L39 Demo seed check**: `mcp:demo` does not verify that `DEMO_DATABASE_URL` holds the seed; refuse to start when `audit_log` has no `system` seed row if the demo must never show an empty ledger
- **L22 Write tool shapes**: write tools return the `list_entries` read model (camelCase) while inputs are snake_case; keep this convention for F07b/F09 or pick one and record it in the ADR-008 proposal

## Needs author

- **F10b layout choices**: built as the default: the installment column is optional (8th header cell, fixed lines only); a `total` row (kind `total`, amount = income minus expenses of the sheet) is checked against the lines when present; a month can be imported once (refused when it already holds import entries). Confirm these before F10c or any replace flow

## Done

- **F12 Proposal for ADR-008**: `docs/adr-008-proposal.md` with what was built, decisions taken, open questions for the author and the Azure stage requirements; docs only, 117 tests unchanged

- **F11 Demo mode**: `src/mcp/demo.ts` `createDemoServer(client)` registers only the read tools (shared `src/mcp/read.ts`, schema in `src/mcp/schema.ts`); stdio entry `npm run mcp:demo` over `DEMO_DATABASE_URL` (default `DATABASE_URL`) with the pool opened `default_transaction_read_only=on` (`connectPool(url, true)`), so writes fail at the database too; 4 new tests (117 in total)

- **F10b Spreadsheet import into the ledger**: `src/import/month.ts` `importMonth(client, actor, month, entries)` writes the entries in one audited `import` transaction (advisory lock per month, all or nothing, refuses a month already holding import entries); `src/ledger/record.ts` `entryValues` shared with `createEntry`; `src/import/sheet.ts` accepts an optional `installment` column (fixed lines only, positive whole number) and an optional `total` row checked against the net of the lines; existing fixture unchanged; 6 new tests (113 in total). API/MCP entry point not added (L36)

- **F10a Spreadsheet reader**: `src/import/sheet.ts` `readMonthSheet(file, month)` reads the sheet named `YYYY-MM` with `read-excel-file` (pinned 9.3.12) and maps rows with header `kind, description, category, account, member, due_on, amount` (kind `income`, `fixed`, `variable`; amount as a numeric cell in BRL, up to 2 decimals; due_on as text in the month; blank rows skipped) into `NewEntry[]`; errors name the line; invented fixture `test/fixtures/2026-10-import.xlsx`; 4 new tests (107 in total). Not yet wired to the ledger (F10b)

- **F09b HTTP API writes, part 2**: `PATCH /api/reserves/:name` (balance and/or target, the name is percent-decoded), `POST /api/decisions`, `POST /api/decisions/:id/confirm|reject|withdraw` and `POST /api/months/:month/forecast` over the existing `record.ts`/`forecast.ts` commands, as the `x-member` caller (401 without it, before the handler); README lists the routes; 4 new tests (103 in total)

- **F09 HTTP API, part 1**: `src/http/api.ts` `api(client)` fetch handler on `URLPattern` routes, served by `serveApi` (`API_HOST`/`API_PORT`, default 127.0.0.1:3200, `npm run api:http`) through the existing `src/http/node.ts` bridge (L18 done): `GET` summary, entries, debts, reserves, decisions and `POST /api/entries` (201), `POST /api/entries/:id/paid`, writes audited as `member` for the `x-member` caller; localhost Host/Origin only; JSON errors 400 (zod issues), 401, 403, 404, 405 with `Allow`, 413 (64 KiB, `src/http/body.ts` `readJson` streams and counts), 415, 422 for the new `RuleError` thrown by ledger rules, 500 without details; optional `today` query keeps results stable (L07); README section; 10 new tests. Rest split into F09b

- **F08 Forecast**: `src/ledger/forecast.ts` `forecastMonth(client, actor, month)` plans, in one audited write under a transaction advisory lock, one `planned` entry per active recurring expense and income of the month (starts on or before the month end, ends on or after its first day), linked by `recurring_expense_id`/`income_id`, due day clamped to the month length, installment number from `starts_on`, stopping after the last installment; a source with any entry in the month, even closed, is skipped (idempotent, a closed entry is not resurrected); MCP write tool `forecast_month` (idempotentHint) returns `{ month, skipped, created }`; 8 new tests

- **F07c MCP read tools for reserves and decisions**: `list_reserves` (`listReserves`: balance, target, `missing` to target, `progressPercent`, both null without target; `findReserve` shares the query so `update_reserve` returns them too) and `list_decisions` (`listDecisions(client, status = 'proposed', limit = 20)`, status `all` for every status, newest first, with `confirmedBy` and `awaiting`); README lists every tool; 5 new tests

- **F07b MCP write tools, part 2**: `update_reserve` (by name, balance >= 0 and/or positive target, audited), `propose_decision` (status `proposed`, `proposed_by` the caller, origin `claude`), `confirm_decision` (one `decision_confirmation` per member, closes as `confirmed` when no active member is awaiting, row lock serializes concurrent confirmations), `reject_decision` (another member only) and `withdraw_decision` (proposer only); read models `findReserve` and `findDecision` (`confirmedBy`, `awaiting`); 5 new tests

- **F07 MCP write tools, part 1**: `create_entry` and `mark_paid` over stdio and HTTP; `src/ledger/record.ts` (`createEntry` resolving category by name and direction, account nickname, member name or `joint`; `markPaid` refusing paid or closed entries) through audited `write()` as `claude` for the calling member, origin `claude`; `createServer(database, member?)` takes a pool (`Database` type) and leases one client per write; HTTP factory reads `x-member` from `ctx.requestInfo`; stdio uses a pool (L15 done) and `FINANCE_MEMBER`, refusing to start for an unknown member; writes refused without a caller; `findEntry` returns the written entry; 9 new tests. Rest split into F07b

- **F06b Streamable HTTP adapter**: `src/mcp/http.ts` `mcpHttp(client)` wraps the SDK `createMcpHandler` (modern plus stateless legacy) with localhost Host/Origin validation, `/mcp` path only, and `x-member` checked against active members (`src/ledger/members.ts` `findMember`, 403 when unknown); `serveHttp` binds `MCP_HOST` (default 127.0.0.1) and `MCP_PORT` (default 3100); `src/http/node.ts` is a dependency-free `node:http` to fetch bridge with JSON 500s; reads take a `Queryable` so a `pg.Pool` (`connectPool`, L01 done for HTTP) serves concurrent requests; `npm run mcp:http`; 10 tests

- **F06 MCP read tools (stdio)**: `src/mcp/server.ts` `createServer(client)` with read-only tools `month_summary` (comparison with previous or chosen month), `list_entries` (month plus direction, category, account nickname, member or `joint`, derived state paid/pending/late, optional `today`) and `list_debts`; `src/ledger/entries.ts`, `src/ledger/debts.ts`, `src/ledger/money.ts` (`formatBrl`, L10 done); `src/mcp/json.ts` serializes cents as `{ cents, brl }` and ids as strings; `npm run mcp:stdio`; 11 tests through in-memory and stdio clients. Streamable HTTP split into F06b

- **F05 Month summary**: `src/ledger/summary.ts` with `monthSummary(client, month, today)` (income and expenses: count, total, paid, pending, late, by category ordered by total; balance) and `compareMonths(client, month, other = previous, today)` (income, expenses, balance and per-category differences); late = stored `late` or `planned` past due on the reference date; `today` defaults to the date in America/Sao_Paulo; 12 tests over the seed

- **F04 Fictional seed**: `npm run db:seed` (`src/db/seed.ts`) plants, in one audited `system` write, two members 50/50, five accounts, ten categories, two salaries, seven recurring expenses (one in 10 installments), two debts, one reserve and one goal, plus 177 entries from 2025-11 to 2026-10 as of a fixed 2026-10-18 (past paid, current month paid/late/planned); refuses a non-empty database; 9 tests including determinism

- **F03 Audited writes**: `src/db/write.ts` with `write(client, actor, work)` giving `create`/`update`/`close` (no delete); one transaction per call, audit row written in the same statement via `to_jsonb` before/after; entity allowlist, `id`/`created_at`/`closed_at` not writable, closed rows locked; active members' `share_percent` must sum to 100 at commit; `int8` parsed as `BigInt` and `date` kept as `YYYY-MM-DD` string

- **F02 Schema**: `db:migrate`/`db:reset`, forward-only runner with advisory lock and `schema_migration`, `001-ledger.sql` with all ledger tables plus `decision_confirmation`, delete/truncate guards, append-only audit log, last-four and digit-run constraints, database time zone; `check` now runs `tsc` too
- **F01 Skeleton**: `package.json` (scripts `test`, `check`, `fix`, `typecheck`), Biome 2.5.14 and TypeScript config copied from `mcp-docs`, `.nvmrc` 24, README
