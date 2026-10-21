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

`npm run mcp:demo` serves the same read tools over stdio against `DEMO_DATABASE_URL` (default `DATABASE_URL`), with the connection opened read-only so no write can reach the database; it registers no write tools.

Write tools `create_entry` (planned or already paid income or expense, member name or `joint`) and `mark_paid`, `forecast_month` (plans a month from the active recurring expenses and incomes, idempotent), `update_reserve`, and the joint decision tools `propose_decision`, `confirm_decision`, `reject_decision` and `withdraw_decision` record facts on behalf of the calling member, audited as `claude` with that member; they never execute a payment. Over HTTP the caller is the `x-member` header, over stdio the `FINANCE_MEMBER` variable (the server refuses to start when it names no active member). Without a caller every write is refused. A decision stays `proposed` until every active member confirms it.

## HTTP API

`npm run api:http` serves a JSON API at `http://127.0.0.1:3200/api` (`API_HOST`, `API_PORT`) over the same ledger, with the same money shape and localhost-only Host and Origin checks:

- `GET /api/months/:month/summary` (`compare_with`, `today`)
- `GET /api/months/:month/entries` (`direction`, `category`, `account`, `member`, `state`, `today`)
- `GET /api/debts`, `GET /api/reserves`, `GET /api/decisions` (`status`, `limit`)
- `GET /api/members`, `GET /api/goals`, `GET /api/net-worth` (reserves plus goals kept outside a reserve, minus debt balances)
- `GET /api/months/:month/split`: joint expenses paid from a member's account, each member's share by `share_percent`, and who owes whom
- `GET /api/audit` (`author`, `member`, `entity`, `limit`, `before` cursor from `next`), newest first with counts per author
- `POST /api/entries` with the `create_entry` fields, answered `201`
- `POST /api/entries/:id/paid` with an optional `paid_on`
- `POST /api/entries/:id/unpaid` undoes a payment mark (back to planned, audited; used by the undo toast on `/contas`)
- `PATCH /api/reserves/:name` with `balance_cents` and/or `target_cents`
- `POST /api/decisions` with `title`, optional `description` and `amount_cents`, answered `201`
- `POST /api/decisions/:id/confirm|reject|withdraw`
- `POST /api/months/:month/forecast`, planning the month's recurring entries once (`today`)
- `GET /api/openapi.json`, the OpenAPI 3.1 contract of these routes

The contract is built from the zod schemas the routes validate with (`src/http/contract.ts`) and committed as `openapi.json`; after changing a route run `npm run openapi`, which also regenerates the web types in `web/src/api/schema.ts`. Tests fail when a route is undocumented, answers outside its documented shape, or either file is stale.

Writes need an `x-member` header naming an active member and are audited as that member; they never execute a payment. Errors are JSON `{ "error": "..." }`: `400` invalid input (with `issues`), `401` write without a member, `403` unknown member or foreign host, `404`, `405`, `413` body over 64 KiB, `415` body not JSON, `422` refused by a ledger rule, `500` without details.

## Web app

`web/` is an npm workspace with the React 19 app (Vite, TypeScript strict, Vitest). Run the API and the web dev server side by side:

```sh
npm run api:http
npm run web:dev
```

Vite serves `http://localhost:5173` and proxies `/api` to the API on `127.0.0.1:3200` (`API_PORT`), so the browser talks to one origin and no CORS is needed. `npm run web:build` writes `web/dist`. `createApi` (`web/src/api/client.ts`) is the typed client (`openapi-fetch`), sending `x-member` when a member is given. `npm test` and `npm run check` cover the API and the web app.

The design tokens of `docs/design.md` live in `web/src/styles.css` as CSS variables for light and dark, mapped into Tailwind v4 `@theme` (`bg-surface`, `text-muted`, `rounded-card`, `text-kpi`, the `amount` utility for tabular Geist Mono). Geist and Geist Mono are self-hosted from `@fontsource-variable`. The theme follows the system until a choice is stored in the browser (`finance.theme`). pt-BR formatters for money, dates and months are in `web/src/lib/format.ts`.

The app shell (`web/src/shell`) routes the six screens with TanStack Router (`/`, `/contas`, `/lancamentos`, `/patrimonio`, `/decisoes`, `/atividade`): a sidebar from 768 px, a bottom tab bar below. The month and the member filter live in the URL (`?month=2026-10&member=Marcio`) and follow every navigation. The local identity picker ("Você é") is remembered per browser (`finance.member`) and sent as `x-member`. Server data goes through TanStack Query; `QueryView` gives every screen the same skeleton, empty and error states.

The build is an installable PWA (`vite-plugin-pwa`, manifest "Caixa", icons generated by `npm run icons -w web` into `web/public`): the service worker precaches the app shell and answers GET `/api/*` network first, falling back to the last response for up to 7 days, so the screens already visited open offline. Each screen is its own chunk, loaded when its route is first visited. The overview chart (Recharts) loads only on screens 768 px and wider. `cd web && npx playwright test -g budget` checks the first-load budget: 150 kB of gzip JS on a phone, 240 kB on desktop, 60 kB of fonts, FCP under 1.8 s, LCP under 2.5 s and a precache under 1 MiB.

`npm run web:screenshots` starts the API and `vite preview` over the seeded database and writes `web/screenshots/<screen>-<width>-<theme>.png` with Playwright (Chromium from `/opt/pw-browsers/chromium`, or `PLAYWRIGHT_CHROMIUM`).
