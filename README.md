# finance

Household finance ledger with a Claude connector. Two members, every change audited, nothing deleted, no payment ever executed. Work in progress on branch `poc`, built one increment at a time by an agent following [CLAUDE.md](CLAUDE.md).

## Run locally

Requires Node 24 and PostgreSQL 16.

```sh
npm ci
cp .env.example .env
npm run db:reset
npm run db:seed
npm test
npm run check
npm run fix
```

Copy `.env.example` to `.env` and adjust it; every script loads `.env` when present. `DATABASE_URL` defaults to `postgres://postgres@localhost:5432/finance`. `npm run db:migrate` applies pending migrations from `db/migrations`; `npm run db:reset` drops and recreates the database; `npm run db:seed` fills an empty database with an invented household (twelve months up to 2026-10, as if today were 2026-10-18). Tests create and drop their own `finance_test_*` databases on the same server.

## Claude connector

`npm run mcp:stdio` serves the read tools `month_summary`, `list_entries`, `list_debts`, `list_reserves` and `list_decisions` (status `proposed` by default, or `all`) over stdio against `DATABASE_URL`. Amounts are cents as strings with a BRL display, for example `{ "cents": "123456", "brl": "R$ 1.234,56" }`.

`npm run mcp:http` serves the same tools over streamable HTTP at `http://127.0.0.1:3100/mcp` (`MCP_HOST`, `MCP_PORT`; `DATABASE_POOL_MAX` sets the pool size, default 5). Only localhost Host and Origin headers are accepted. An optional `x-member` header names the calling member; an unknown or closed member is answered `403`.

Write tools `create_entry` (planned or already paid income or expense, member name or `joint`) and `mark_paid`, `update_reserve`, and the joint decision tools `propose_decision`, `confirm_decision`, `reject_decision` and `withdraw_decision` record facts on behalf of the calling member, audited as `claude` with that member; they never execute a payment. Over HTTP the caller is the `x-member` header, over stdio the `FINANCE_MEMBER` variable (the server refuses to start when it names no active member). Without a caller every write is refused. A decision stays `proposed` until every active member confirms it.
