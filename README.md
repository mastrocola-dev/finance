# finance

Household finance ledger with a Claude connector. Two members, every change audited, nothing deleted, no payment ever executed. Work in progress on branch `poc`, built one increment at a time by an agent following [CLAUDE.md](CLAUDE.md).

## Showcase

"Caixa", the web app over the ledger: one month at a glance for the household or for one member, bills to pay, entries, debts and reserves, joint decisions waiting for both members, and the audit trail of every change, including the ones Claude made on a member's behalf. The data is the invented seed household of `npm run db:seed`.

<p>
  <img src="web/screenshots/overview-1440-light.png" alt="Month overview, desktop, light theme" width="560">
  <img src="web/screenshots/overview-390-dark.png" alt="Month overview, phone, dark theme" width="180">
</p>

<p>
  <img src="web/screenshots/overview-1440-dark.png" alt="Month overview, desktop, dark theme" width="560">
  <img src="web/screenshots/overview-390-light.png" alt="Month overview, phone, light theme" width="180">
</p>

<details>
<summary>Every screen, desktop and phone, light and dark</summary>

| Screen | Desktop light | Desktop dark | Phone light | Phone dark |
| --- | --- | --- | --- | --- |
| Contas do mês | <img src="web/screenshots/bills-1440-light.png" alt="Contas do mês, desktop, light" width="360"> | <img src="web/screenshots/bills-1440-dark.png" alt="Contas do mês, desktop, dark" width="360"> | <img src="web/screenshots/bills-390-light.png" alt="Contas do mês, phone, light" width="120"> | <img src="web/screenshots/bills-390-dark.png" alt="Contas do mês, phone, dark" width="120"> |
| Lançamentos | <img src="web/screenshots/entries-1440-light.png" alt="Lançamentos, desktop, light" width="360"> | <img src="web/screenshots/entries-1440-dark.png" alt="Lançamentos, desktop, dark" width="360"> | <img src="web/screenshots/entries-390-light.png" alt="Lançamentos, phone, light" width="120"> | <img src="web/screenshots/entries-390-dark.png" alt="Lançamentos, phone, dark" width="120"> |
| Dívidas e reservas | <img src="web/screenshots/net-worth-1440-light.png" alt="Dívidas e reservas, desktop, light" width="360"> | <img src="web/screenshots/net-worth-1440-dark.png" alt="Dívidas e reservas, desktop, dark" width="360"> | <img src="web/screenshots/net-worth-390-light.png" alt="Dívidas e reservas, phone, light" width="120"> | <img src="web/screenshots/net-worth-390-dark.png" alt="Dívidas e reservas, phone, dark" width="120"> |
| Decisões | <img src="web/screenshots/decisions-1440-light.png" alt="Decisões, desktop, light" width="360"> | <img src="web/screenshots/decisions-1440-dark.png" alt="Decisões, desktop, dark" width="360"> | <img src="web/screenshots/decisions-390-light.png" alt="Decisões, phone, light" width="120"> | <img src="web/screenshots/decisions-390-dark.png" alt="Decisões, phone, dark" width="120"> |
| Atividade | <img src="web/screenshots/activity-1440-light.png" alt="Atividade, desktop, light" width="360"> | <img src="web/screenshots/activity-1440-dark.png" alt="Atividade, desktop, dark" width="360"> | <img src="web/screenshots/activity-390-light.png" alt="Atividade, phone, light" width="120"> | <img src="web/screenshots/activity-390-dark.png" alt="Atividade, phone, dark" width="120"> |
| Importar | <img src="web/screenshots/imports-1440-light.png" alt="Importar, desktop, light" width="360"> | <img src="web/screenshots/imports-1440-dark.png" alt="Importar, desktop, dark" width="360"> | <img src="web/screenshots/imports-390-light.png" alt="Importar, phone, light" width="120"> | <img src="web/screenshots/imports-390-dark.png" alt="Importar, phone, dark" width="120"> |
| Revisar importação | <img src="web/screenshots/imports-review-1440-light.png" alt="Revisar importação, desktop, light" width="360"> | <img src="web/screenshots/imports-review-1440-dark.png" alt="Revisar importação, desktop, dark" width="360"> | <img src="web/screenshots/imports-review-390-light.png" alt="Revisar importação, phone, light" width="120"> | <img src="web/screenshots/imports-review-390-dark.png" alt="Revisar importação, phone, dark" width="120"> |
| Editar item importado | <img src="web/screenshots/imports-review-edit-1440-light.png" alt="Editar item importado, desktop, light" width="360"> | <img src="web/screenshots/imports-review-edit-1440-dark.png" alt="Editar item importado, desktop, dark" width="360"> | <img src="web/screenshots/imports-review-edit-390-light.png" alt="Editar item importado, phone, light" width="120"> | <img src="web/screenshots/imports-review-edit-390-dark.png" alt="Editar item importado, phone, dark" width="120"> |
| Undo after a payment mark | <img src="web/screenshots/bills-toast-1440-light.png" alt="Payment undo toast, desktop, light" width="360"> | <img src="web/screenshots/bills-toast-1440-dark.png" alt="Payment undo toast, desktop, dark" width="360"> | <img src="web/screenshots/bills-toast-390-light.png" alt="Payment undo toast, phone, light" width="120"> | <img src="web/screenshots/bills-toast-390-dark.png" alt="Payment undo toast, phone, dark" width="120"> |
| Mais menu (phone only) | | | <img src="web/screenshots/more-390-light.png" alt="Mais menu, phone, light" width="120"> | <img src="web/screenshots/more-390-dark.png" alt="Mais menu, phone, dark" width="120"> |
| Ver registro lands on the entry (desktop only) | <img src="web/screenshots/record-1440-light.png" alt="Entry opened from Atividade, desktop, light" width="360"> | <img src="web/screenshots/record-1440-dark.png" alt="Entry opened from Atividade, desktop, dark" width="360"> | | |

</details>

Screenshots are taken by Playwright against the seeded API (`npm run web:screenshots`) and committed with every web change.

## Quick start: API plus web

Requires Node 24 and PostgreSQL 16 on `localhost:5432`.

```sh
npm ci
cp .env.example .env
npm run db:reset
npm run db:seed
npm run api:http
```

In a second terminal:

```sh
npm run web:dev
```

Open `http://localhost:5173`, pick who you are under "Você é" and open `?month=2026-10` (the seed covers November 2025 to October 2026). The API answers on `http://127.0.0.1:3200/api`; Vite proxies `/api` to it, so the browser sees one origin. For the production build run `npm run web:build`, then `npm run preview -w web` (`http://localhost:4173`, same proxy) with the API still running.

## Architecture

```mermaid
flowchart LR
  subgraph clients[Clients]
    web[Web app<br>React 19 · Vite · PWA]
    claude[Claude<br>MCP client]
  end
  subgraph node[Node 24 · TypeScript]
    http[src/http<br>JSON API :3200<br>OpenAPI contract]
    mcp[src/mcp<br>MCP server<br>stdio · HTTP :3100]
    ledger[src/ledger<br>read models and commands]
    write[src/db write<br>one transaction plus audit row]
    imp[src/import<br>monthly sheet]
  end
  pg[(PostgreSQL 16<br>closed_at, no deletes<br>audit_log)]
  web -- x-member --> http
  claude -- tools --> mcp
  http --> ledger
  mcp --> ledger
  imp --> ledger
  ledger --> write --> pg
  ledger -- reads --> pg
```

- `src/ledger` holds the domain: read models (`summary`, `entries`, `split`, `worth`, `audit`) and the write commands in `record.ts`; it knows nothing about HTTP or MCP
- Every write goes through `write()` in `src/db`: one transaction, one `audit_log` row (author member, claude, import or system), nothing deleted; database triggers refuse deletes and truncates
- `src/http` and `src/mcp` are thin adapters over the same ledger; the API contract is generated from its zod schemas into `openapi.json`, and the web app's typed client is generated from that file
- `web/` reads and writes only through the API; identity is the local `x-member` header until Entra ID arrives with the Azure stage
- No adapter executes payments or transfers: marking a bill paid records a fact, and joint decisions stay proposed until every member confirms

## Development

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

### Import converters (Python)

`ingest/` is the first stage of the AI-assisted import ([ADR-009](docs/adr-009-ai-assisted-import.md)): it turns a file into segments with a source address and a bounded preview. Requires Python 3.13 and [uv](https://docs.astral.sh/uv/).

```sh
npm run ingest:test
npm run ingest:check
cd ingest && uv run python -m ingest inspect tests/fixtures/extrato.ofx
cd ingest && uv run python -m ingest serve tests/fixtures
```

`serve` starts a read-only stdio MCP server over one folder with three tools: `list_segments`, `read_segment` (a segment id, cell range, path or lines, in size-bounded windows) and `apply_mapping` (column letters or relative paths applied to every row or item, each result with its source address). Runs of five or more digits are masked to their last four in every result, except dates (`20261005`) and amounts with cents (`12345,67`).

| Kind | Formats | Source address |
|---|---|---|
| `table` | xlsx, csv (one block per region separated by empty rows and columns) | `2026-10!A3:C5` |
| `tree` | json, xml, ofx (one segment per repeated list) | `$.accounts[*].transactions` |
| `text` | txt, pdf with a text layer (passages split on blank lines, at most 40 lines) | `L3-L4`, `p2:L1-L12` |

`npm run import -- <file>` (at most 20 MB) opens a draft `import_batch`, lists the file's segments through the `ingest` server, runs the import agent once per chunk through the service-agent CLI (`SERVICE_AGENT_CLI`, default `../service-agent/src/cli.ts`, with the task as JSON on stdin and `{ output, usage }` on stdout) and stages the candidates and questions for review; nothing reaches the ledger. The agent process gets `IMPORT_FOLDER` and the model key but not `DATABASE_URL`, and the token budget is `IMPORT_TOKEN_CAP`.

`npm run import -- --retry <batch> <file>` takes the same file again (its sha-256 must match the batch) and re-extracts only the chunks that failed or hold pending candidates below 0.8 confidence. Candidates of a chunk that succeeds this time are closed as `replaced` with their questions and totals, a chunk that fails again keeps its rows, and the batch is verified again; usage adds to the batch under a fresh `IMPORT_TOKEN_CAP`. A batch with nothing to retry is refused before any write.

The API takes the same flow from a browser: `POST /api/imports?consent=true` with the raw file (`application/octet-stream`, at most 20 MB, name in the percent-encoded `x-file-name` header) answers `202` with the draft batch while extraction runs in the background; `GET /api/imports/:id` reports progress, and `GET /api/imports/:id/candidates` and `/questions` list what was staged. Uploads are kept under `IMPORT_UPLOADS` (default `.imports/`, one folder per sha-256), and a file already in a draft, verified or committed batch (or a closed one that reached the ledger) is refused. Once verified, a member reviews it: `POST /api/imports/:id/questions/:question/answer` (an answer naming an existing member, account, category or reserve fixes every candidate carrying the asked name), `PATCH /api/imports/:id/candidates/:candidate` with a full payload (status `edited`), and `POST /api/imports/:id/candidates/accept` or `/reject` with `{ ids }`; each change is audited as the member and the batch is verified again in the same transaction. `POST /api/imports/:id/retry` runs the same retry in the background from the kept upload, audited as author `import` with the member, and answers `202` with the progress; it is refused with `409` while the batch extracts and `422` when the batch is closed or committed, the file is no longer kept, or nothing is left to retry. A retry skips chunks that already hold reviewed rows; the batch's `retryable` counts the chunks it would read again. `POST /api/imports/:id/commit` writes the accepted and edited candidates to the ledger in one transaction, audited as author `import` with the committing member: categories, accounts and reserves first so the rest can name them, every name resolved case-insensitively, every created row carrying `import_batch_id`, and each candidate pointing at its row through `recordId`. A candidate with a failed check (invalid, an unknown name, or a duplicate of a unique account, category, reserve or goal) blocks the whole commit; pending candidates stay as they are and the batch becomes `committed`. `POST /api/imports/:id/close` closes a committed batch with its open candidates and questions (ledger rows stay; `committed` keeps their count) or abandons a draft or verified one, audited as the member. The uploaded file is removed after commit or close, and the API removes folders of batches no longer draft or verified when it starts. In the web app, `/importar` (in the Mais menu on phones) uploads a file after the consent checkbox, polls the history every second while a batch extracts, and lists every batch with its status, counts, tokens, cost and failed chunks, with Descartar or Encerrar behind a confirmation and Ler de novo when a batch has chunks to retry. Revisar opens `/importar/<id>`: questions and file checks first, then the candidates by kind and month with their checks, Aceitar and Rejeitar, and Editar, a form with the fields of the candidate's kind that checks them in the browser and shows the API's refusals beside each field; Ler de novo there re-reads the failed and low-confidence chunks and reopens the review when reading ends. Its Playwright run (`npx playwright test e2e/import.spec.ts` in `web/`) starts the API with the fake agent `test/import/fake-agent.ts` as `SERVICE_AGENT_CLI`.

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
