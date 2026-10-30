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
| Corrigir lançamento | <img src="web/screenshots/entries-edit-1440-light.png" alt="Corrigir lançamento, desktop, light" width="360"> | <img src="web/screenshots/entries-edit-1440-dark.png" alt="Corrigir lançamento, desktop, dark" width="360"> | <img src="web/screenshots/entries-edit-390-light.png" alt="Corrigir lançamento, phone, light" width="120"> | <img src="web/screenshots/entries-edit-390-dark.png" alt="Corrigir lançamento, phone, dark" width="120"> |
| Dívidas e reservas | <img src="web/screenshots/net-worth-1440-light.png" alt="Dívidas e reservas, desktop, light" width="360"> | <img src="web/screenshots/net-worth-1440-dark.png" alt="Dívidas e reservas, desktop, dark" width="360"> | <img src="web/screenshots/net-worth-390-light.png" alt="Dívidas e reservas, phone, light" width="120"> | <img src="web/screenshots/net-worth-390-dark.png" alt="Dívidas e reservas, phone, dark" width="120"> |
| Nova meta | <img src="web/screenshots/net-worth-goal-1440-light.png" alt="Nova meta, desktop, light" width="360"> | <img src="web/screenshots/net-worth-goal-1440-dark.png" alt="Nova meta, desktop, dark" width="360"> | <img src="web/screenshots/net-worth-goal-390-light.png" alt="Nova meta, phone, light" width="120"> | <img src="web/screenshots/net-worth-goal-390-dark.png" alt="Nova meta, phone, dark" width="120"> |
| Decisões | <img src="web/screenshots/decisions-1440-light.png" alt="Decisões, desktop, light" width="360"> | <img src="web/screenshots/decisions-1440-dark.png" alt="Decisões, desktop, dark" width="360"> | <img src="web/screenshots/decisions-390-light.png" alt="Decisões, phone, light" width="120"> | <img src="web/screenshots/decisions-390-dark.png" alt="Decisões, phone, dark" width="120"> |
| Atividade | <img src="web/screenshots/activity-1440-light.png" alt="Atividade, desktop, light" width="360"> | <img src="web/screenshots/activity-1440-dark.png" alt="Atividade, desktop, dark" width="360"> | <img src="web/screenshots/activity-390-light.png" alt="Atividade, phone, light" width="120"> | <img src="web/screenshots/activity-390-dark.png" alt="Atividade, phone, dark" width="120"> |
| Atividade sem identidade | <img src="web/screenshots/activity-guest-1440-light.png" alt="Atividade sem identidade, desktop, light" width="360"> | <img src="web/screenshots/activity-guest-1440-dark.png" alt="Atividade sem identidade, desktop, dark" width="360"> | <img src="web/screenshots/activity-guest-390-light.png" alt="Atividade sem identidade, phone, light" width="120"> | <img src="web/screenshots/activity-guest-390-dark.png" alt="Atividade sem identidade, phone, dark" width="120"> |
| Entrar (`entra`) | <img src="web/screenshots/sign-in-1440-light.png" alt="Entrar, desktop, light" width="360"> | <img src="web/screenshots/sign-in-1440-dark.png" alt="Entrar, desktop, dark" width="360"> | <img src="web/screenshots/sign-in-390-light.png" alt="Entrar, phone, light" width="120"> | <img src="web/screenshots/sign-in-390-dark.png" alt="Entrar, phone, dark" width="120"> |
| Cadastros | <img src="web/screenshots/setup-1440-light.png" alt="Cadastros, desktop, light" width="360"> | <img src="web/screenshots/setup-1440-dark.png" alt="Cadastros, desktop, dark" width="360"> | <img src="web/screenshots/setup-390-light.png" alt="Cadastros, phone, light" width="120"> | <img src="web/screenshots/setup-390-dark.png" alt="Cadastros, phone, dark" width="120"> |
| Importar | <img src="web/screenshots/imports-1440-light.png" alt="Importar, desktop, light" width="360"> | <img src="web/screenshots/imports-1440-dark.png" alt="Importar, desktop, dark" width="360"> | <img src="web/screenshots/imports-390-light.png" alt="Importar, phone, light" width="120"> | <img src="web/screenshots/imports-390-dark.png" alt="Importar, phone, dark" width="120"> |
| Leitura indisponível | <img src="web/screenshots/imports-unavailable-1440-light.png" alt="Leitura indisponível, desktop, light" width="360"> | <img src="web/screenshots/imports-unavailable-1440-dark.png" alt="Leitura indisponível, desktop, dark" width="360"> | <img src="web/screenshots/imports-unavailable-390-light.png" alt="Leitura indisponível, phone, light" width="120"> | <img src="web/screenshots/imports-unavailable-390-dark.png" alt="Leitura indisponível, phone, dark" width="120"> |
| Preparando a leitura | <img src="web/screenshots/imports-warming-1440-light.png" alt="Preparando a leitura, desktop, light" width="360"> | <img src="web/screenshots/imports-warming-1440-dark.png" alt="Preparando a leitura, desktop, dark" width="360"> | <img src="web/screenshots/imports-warming-390-light.png" alt="Preparando a leitura, phone, light" width="120"> | <img src="web/screenshots/imports-warming-390-dark.png" alt="Preparando a leitura, phone, dark" width="120"> |
| Revisar importação | <img src="web/screenshots/imports-review-1440-light.png" alt="Revisar importação, desktop, light" width="360"> | <img src="web/screenshots/imports-review-1440-dark.png" alt="Revisar importação, desktop, dark" width="360"> | <img src="web/screenshots/imports-review-390-light.png" alt="Revisar importação, phone, light" width="120"> | <img src="web/screenshots/imports-review-390-dark.png" alt="Revisar importação, phone, dark" width="120"> |
| Editar item importado | <img src="web/screenshots/imports-review-edit-1440-light.png" alt="Editar item importado, desktop, light" width="360"> | <img src="web/screenshots/imports-review-edit-1440-dark.png" alt="Editar item importado, desktop, dark" width="360"> | <img src="web/screenshots/imports-review-edit-390-light.png" alt="Editar item importado, phone, light" width="120"> | <img src="web/screenshots/imports-review-edit-390-dark.png" alt="Editar item importado, phone, dark" width="120"> |
| Nome só num item não aceito | <img src="web/screenshots/imports-unstaged-1440-light.png" alt="Nome só num item não aceito, desktop, light" width="360"> | <img src="web/screenshots/imports-unstaged-1440-dark.png" alt="Nome só num item não aceito, desktop, dark" width="360"> | <img src="web/screenshots/imports-unstaged-390-light.png" alt="Nome só num item não aceito, phone, light" width="120"> | <img src="web/screenshots/imports-unstaged-390-dark.png" alt="Nome só num item não aceito, phone, dark" width="120"> |
| Gravar importação | <img src="web/screenshots/imports-commit-1440-light.png" alt="Gravar importação, desktop, light" width="360"> | <img src="web/screenshots/imports-commit-1440-dark.png" alt="Gravar importação, desktop, dark" width="360"> | <img src="web/screenshots/imports-commit-390-light.png" alt="Gravar importação, phone, light" width="120"> | <img src="web/screenshots/imports-commit-390-dark.png" alt="Gravar importação, phone, dark" width="120"> |
| Importação gravada | <img src="web/screenshots/imports-committed-1440-light.png" alt="Importação gravada, desktop, light" width="360"> | <img src="web/screenshots/imports-committed-1440-dark.png" alt="Importação gravada, desktop, dark" width="360"> | <img src="web/screenshots/imports-committed-390-light.png" alt="Importação gravada, phone, light" width="120"> | <img src="web/screenshots/imports-committed-390-dark.png" alt="Importação gravada, phone, dark" width="120"> |
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
- `web/` reads and writes only through the API; identity is the local `x-member` header; the API verifies Entra tokens with `AUTH_MODE=entra` and closes every read but the contract and health (S6, S7a); the web sign-in arrives with S7b
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

Copy `.env.example` to `.env` and adjust it; every script loads `.env` when present. `DATABASE_URL` defaults to `postgres://postgres@localhost:5432/finance`. `npm run db:migrate` applies pending migrations from `db/migrations`; `npm run db:reset` drops and recreates the database; `npm run db:seed` fills an empty database with an invented household (twelve months up to 2026-10, as if today were 2026-10-18). Tests create and drop their own `finance_test_*` databases on the same server. `FINANCE_CLOCK` (a time with offset, such as `2026-10-18T12:00:00-03:00`) freezes the API's today and the ledger timestamps; the Playwright API server runs with it set to the seed's today and the browser clock frozen at the same instant, so screenshots change only when a screen does (stop any API already on port 3200 first, Playwright reuses it).

### Continuous integration

`.github/workflows/ci.yml` runs on every push to `poc` and on pull requests to `main`, on Ubuntu 24.04 with a PostgreSQL 16 service, Node 24 and uv: `npm ci`, `npm run check`, `npm run ingest:check`, `npm run ingest:test`, `npm test`, `npm run web:build` and the first-load budget (`npx playwright test -g budget` in `web/`), in that order. Running the same commands locally reproduces it. When that `test` job passes, the `images` job builds and smoke-tests both images; on pushes to `poc` it publishes them as `ghcr.io/mastrocola-dev/finance-api:<commit>` and `finance-mcp:<commit>` (the only job with `packages: write`) and writes to the run summary the `Dockerfile` diff that `scripts/pin-bases.sh` makes to pin the base images by digest.

A second job checks the Azure configuration in `infra/` with Terraform 1.16.4: `terraform fmt -check -recursive`, `terraform init -backend=false` and `terraform validate`. What it creates, the apply order and the rollback are in [infra/README.md](infra/README.md); the whole deploy (Entra tenant with Google, app registrations, images, migration job, members, web, Claude connector, smoke test and rollback) is the runbook [docs/deploy-azure.md](docs/deploy-azure.md).

A third job builds the container images and smoke-tests them against a PostgreSQL service: both run as a non-root user, the API answers with the ingest runtime ready and the MCP server answers `initialize`.

### Containers

One `Dockerfile` with two targets on Node 24 slim, production dependencies only, user `node`:

```sh
docker build --target api -t finance-api .
docker build --target mcp -t finance-mcp .
docker run --rm --network host --env-file .env finance-api
docker run --rm --network host --env-file .env finance-mcp
```

`api` (port 3200) also carries uv and Python 3.13 with `ingest/.venv-runtime` built from the lock, so the start-up check runs offline in seconds; uploads go to `/app/.imports`. It also carries service-agent at the commit pinned by `SERVICE_AGENT_SHA` in the `Dockerfile` (production modules only, `SERVICE_AGENT_CLI=/opt/service-agent/src/cli.ts`); the model key comes from `ANTHROPIC_API_KEY`. `mcp` listens on port 3100. Hosting on Azure is proposed in [ADR-010](docs/adr-010-azure-hosting.md); the author's walkthrough before calling the POC done is [docs/acceptance.md](docs/acceptance.md).

The Playwright suite never touches the dev ledger: it resets and seeds its own database (`finance_e2e` on the server of `DATABASE_URL`, or `E2E_DATABASE_URL`), starts its API on port 3290 (`E2E_API_PORT`) with uploads under `.imports-e2e/`, and serves the build on port 4273. Outside CI it reuses servers already running on those ports; with `CI` set it starts its own and uses the Chromium installed by `playwright install`.

### Import converters (Python)

`ingest/` is the first stage of the AI-assisted import ([ADR-009](docs/adr-009-ai-assisted-import.md)): it turns a file into segments with a source address and a bounded preview. Requires Python 3.13 and [uv](https://docs.astral.sh/uv/).

```sh
npm run ingest:test
npm run ingest:check
cd ingest && uv run --no-dev python -m ingest inspect tests/fixtures/extrato.ofx
cd ingest && uv run --no-dev python -m ingest serve tests/fixtures
```

The API and the import command run ingest in their own environment, `ingest/.venv-runtime`, synced exactly from the lock without the dev group, so the fixture tools (lxml, fpdf2, pytest, ruff) never reach the reading path and openpyxl parses workbooks with the standard library. `npm run api:http` syncs that environment before it listens, so the first upload does not wait for it; without uv it logs a warning and uploads fail until uv can sync.

`serve` starts a read-only stdio MCP server over one folder with three tools: `list_segments`, `read_segment` (a segment id, cell range, path or lines, in size-bounded windows) and `apply_mapping` (column letters or relative paths applied to every row or item, each result with its source address). Runs of five or more digits are masked to their last four in every result, except dates (`20261005`) and amounts with cents (`12345,67`).

| Kind | Formats | Source address |
|---|---|---|
| `table` | xlsx, csv (one block per region separated by empty rows and columns) | `2026-10!A3:C5` |
| `tree` | json, xml, ofx (one segment per repeated list) | `$.accounts[*].transactions` |
| `text` | txt, pdf with a text layer (passages split on blank lines, at most 40 lines) | `L3-L4`, `p2:L1-L12` |

`npm run import -- <file>` (at most 20 MB) opens a draft `import_batch`, lists the file's segments through the `ingest` server, runs the import agent once per chunk through the [service-agent](https://github.com/mastrocola-dev/service-agent) CLI (`SERVICE_AGENT_CLI`, default `../service-agent/src/cli.ts`) and stages the candidates and questions for review; nothing reaches the ledger. Each run gets a temporary copy of `agents/import` with the upload folder written into the ingest server's arguments and `maxRunTokens` lowered to what is left of the batch budget (`IMPORT_TOKEN_CAP`); the task goes as JSON on stdin, the output comes back as JSON on stdout, and the usage is read from the run's trace in `TRACE_DIR` (priced by finance when service-agent has no rate for the model). The agent starts the ingest server with the runtime environment's Python and `ingest/serve.py`, gets the model key but not `DATABASE_URL`, and the temporary copy is removed after the run. `test/import/service-agent-contract.test.ts` runs the real CLI (`SERVICE_AGENT_CLI` or the sibling checkout) against a stub model server when it is installed, and fails instead of skipping with `SERVICE_AGENT_REQUIRED=true`; CI checks out the commit pinned in the `Dockerfile` beside the repository and runs it again inside the built API image.

`npm run import -- --retry <batch> <file>` takes the same file again (its sha-256 must match the batch) and re-extracts only the chunks that failed or hold pending candidates below 0.8 confidence. Candidates of a chunk that succeeds this time are closed as `replaced` with their questions and totals, a chunk that fails again keeps its rows, and the batch is verified again; usage adds to the batch under a fresh `IMPORT_TOKEN_CAP`. A batch with nothing to retry is refused before any write.

The API takes the same flow from a browser: `POST /api/imports?consent=true` with the raw file (`application/octet-stream`, at most 20 MB, name in the percent-encoded `x-file-name` header) answers `202` with the draft batch while extraction runs in the background; `GET /api/imports/:id` reports progress, and `GET /api/imports/:id/candidates` and `/questions` list what was staged. Uploads are kept under `IMPORT_UPLOADS` (default `.imports/`, one folder per sha-256), and a file already in a draft, verified or committed batch (or a closed one that reached the ledger) is refused. `IMPORT_DAILY_USD_CAP` (US$, unset means no cap) refuses uploads and retries with `422` and a message in Portuguese once the batches started today (America/Sao_Paulo) cost that much; the CLI is not capped. Once verified, a member reviews it: `POST /api/imports/:id/questions/:question/answer` (an answer naming an existing member, account, category or reserve fixes every candidate carrying the asked name), `PATCH /api/imports/:id/candidates/:candidate` with a full payload (status `edited`), and `POST /api/imports/:id/candidates/accept` or `/reject` with `{ ids }`; each change is audited as the member and the batch is verified again in the same transaction. `POST /api/imports/:id/retry` runs the same retry in the background from the kept upload, audited as author `import` with the member, and answers `202` with the progress; it is refused with `409` while the batch extracts and `422` when the batch is closed or committed, the file is no longer kept, or nothing is left to retry. A retry skips chunks that already hold reviewed rows; the batch's `retryable` counts the chunks it would read again. `POST /api/imports/:id/commit` writes the accepted and edited candidates to the ledger in one transaction, audited as author `import` with the committing member: categories, accounts and reserves first so the rest can name them, every name resolved case-insensitively, every created row carrying `import_batch_id`, and each candidate pointing at its row through `recordId`. A candidate with a failed check (invalid, an unknown name, or a duplicate of a unique account, category, reserve or goal) blocks the whole commit; pending candidates stay as they are and the batch becomes `committed`. `POST /api/imports/:id/close` closes a committed batch with its open candidates and questions (ledger rows stay; `committed` keeps their count) or abandons a draft or verified one, audited as the member. The uploaded file is removed after commit or close, and the API removes folders of batches no longer draft or verified when it starts. In the web app, `/importar` (in the Mais menu on phones) uploads a file after the consent checkbox, polls the history every second while a batch extracts, and lists every batch with its status, counts, tokens, cost and failed chunks, with Descartar or Encerrar behind a confirmation and Ler de novo when a batch has chunks to retry. Revisar opens `/importar/<id>`: questions and file checks first, then the candidates by kind and month with their checks, Aceitar and Rejeitar, and Editar, a form with the fields of the candidate's kind that checks them in the browser and shows the API's refusals beside each field; Ler de novo there re-reads the failed and low-confidence chunks and reopens the review when reading ends. Gravar no livro, at the end of the review, says how many accepted items will be written and how many stay out, lists every accepted item a blocking check holds back with the check in Portuguese, and commits after a confirmation; the page then shows the committed count with links to Lançamentos and Atividade (imported entries carry the Importado chip) and Encerrar, which closes the batch. Its Playwright run (`npx playwright test e2e/import.spec.ts` in `web/`) starts the API with the fake agent `test/import/fake-agent.ts` as `SERVICE_AGENT_CLI`.

## Claude connector

`npm run mcp:stdio` serves the read tools `month_summary`, `list_entries`, `list_debts`, `list_reserves`, `list_setup` (open categories, accounts, reserves, incomes, recurring expenses, debts and goals) and `list_decisions` (status `proposed` by default, or `all`) over stdio against `DATABASE_URL`. Amounts are cents as strings with a BRL display, for example `{ "cents": "123456", "brl": "R$ 1.234,56" }`.

`npm run mcp:http` serves the same tools over streamable HTTP at `http://127.0.0.1:3100/mcp` (`MCP_HOST`, `MCP_PORT`; `DATABASE_POOL_MAX` sets the pool size, default 5). Only the Host and Origin hostnames listed in `MCP_ALLOWED_HOSTS` and `MCP_ALLOWED_ORIGINS` are accepted (comma-separated, default `localhost,127.0.0.1,[::1]`); set them only when the server is exposed, for example `MCP_ALLOWED_HOSTS=mcp.example.com` and `MCP_ALLOWED_ORIGINS=claude.ai`. An optional `x-member` header names the calling member; an unknown or closed member is answered `403`. With `AUTH_MODE=entra` the endpoint needs `Authorization: Bearer <access token>` for every call (`401` with `WWW-Authenticate: Bearer resource_metadata="…"` otherwise) and publishes its OAuth protected resource metadata (RFC 9728) at `/.well-known/oauth-protected-resource/mcp` (and at the root well-known path), naming the Entra issuer as authorization server, so Claude can connect through OAuth.

`npm run mcp:demo` serves the same read tools over stdio against `DEMO_DATABASE_URL` (default `DATABASE_URL`), with the connection opened read-only so no write can reach the database; it registers no write tools.

Write tools `create_entry` (planned or already paid income or expense, member name or `joint`), `correct_entry` (closes the entry and points it to its replacement), `cancel_entry` (closes it; the forecast does not plan it again), `register_record` and `close_record` (categories, accounts, reserves, incomes, recurring expenses, debts and goals), `mark_paid` and `mark_unpaid` (undoes a wrong payment mark), `forecast_month` (plans a month from the active recurring expenses and incomes, idempotent), `update_reserve`, and the joint decision tools `propose_decision`, `confirm_decision`, `reject_decision` and `withdraw_decision` record facts on behalf of the calling member, audited as `claude` with that member; they never execute a payment. Over HTTP the caller is the `x-member` header, over stdio the `FINANCE_MEMBER` variable (the server refuses to start when it names no active member). Without a caller every write is refused. A decision stays `proposed` until every active member confirms it.

## HTTP API

`npm run api:http` serves a JSON API at `http://127.0.0.1:3200/api` (`API_HOST`, `API_PORT`) over the same ledger, with the same money shape and Host and Origin checks (`API_ALLOWED_HOSTS`, `API_ALLOWED_ORIGINS`, localhost by default):

- `GET /api/months/:month/summary` (`compare_with`, `today`)
- `GET /api/months/:month/entries` (`direction`, `category`, `account`, `member`, `state`, `today`)
- `GET /api/debts`, `GET /api/reserves`, `GET /api/decisions` (`status`, `limit`)
- `GET /api/me` (the calling member; needs a member), `GET /api/members`, `GET /api/goals`, `GET /api/net-worth` (reserves plus goals kept outside a reserve, minus debt balances)
- `GET /api/months/:month/split`: joint expenses paid from a member's account, each member's share by `share_percent`, and who owes whom
- `GET /api/audit` (`author`, `member`, `entity`, `limit`, `before` cursor from `next`), newest first with counts per author
- `POST /api/entries` with the `create_entry` fields, answered `201`
- `POST /api/entries/:id/paid` with an optional `paid_on`
- `POST /api/entries/:id/unpaid` undoes a payment mark (back to planned, audited; used by the undo toast on `/contas`)
- `PUT /api/entries/:id` corrects an entry with the full new values: the old row is closed with `replaced_by` pointing to the new one (installment and recurring source kept)
- `POST /api/entries/:id/cancel` closes an entry; the forecast does not plan it again
- `GET /api/setup`, `POST /api/setup` with `{ kind, payload }` (the import candidate schema of the kind) and `POST /api/setup/:kind/:id/close` manage categories, accounts, reserves, incomes, recurring expenses, debts and goals; account nicknames are unique among open accounts
- `POST /api/goals` with `name`, `target_cents`, optional `saved_cents`, `due_on` and `reserve`, answered `201` with the goal and its progress
- `PATCH /api/reserves/:name` with `balance_cents` and/or `target_cents`
- `POST /api/decisions` with `title`, optional `description` and `amount_cents`, answered `201`
- `POST /api/decisions/:id/confirm|reject|withdraw`
- `POST /api/months/:month/forecast`, planning the month's recurring entries once (`today`)
- `GET /api/openapi.json`, the OpenAPI 3.1 contract of these routes (in `entra` mode it declares the HTTP bearer scheme on every route instead of `x-member`)
- `GET /api/health`, `{ "status": "ok" }` without identity or database, for probes

The contract is built from the zod schemas the routes validate with (`src/http/contract.ts`) and committed as `openapi.json`; after changing a route run `npm run openapi`, which also regenerates the web types in `web/src/api/schema.ts`. Tests fail when a route is undocumented, answers outside its documented shape, or either file is stale.

Writes, `GET /api/me` and `GET /api/audit` need an `x-member` header naming an active member; writes are audited as that member and never execute a payment. Errors are JSON `{ "error": "..." }`: `400` invalid input (with `issues`), `401` write or audit read without a member, `403` unknown member or foreign host, `404`, `405`, `413` body over 64 KiB, `415` body not JSON, `422` refused by a ledger rule, `500` without details.

### Identity

One `identify(request)` (`src/http/identity.ts`) resolves the calling member for every API and MCP HTTP route, through the verifier chosen by `AUTH_MODE`:

| Variable | Default | Meaning |
| --- | --- | --- |
| `AUTH_MODE` | `local` | `local` reads the `x-member` header (development only: any caller can name a member). `entra` reads `Authorization: Bearer <access token>` from Entra External ID (Google federated) and ignores `x-member`; the servers refuse to start without the two variables below |
| `ENTRA_ISSUER` | none | Issuer the token's `iss` must equal, for example `https://<tenant>.ciamlogin.com/<tenant id>/v2.0`; the signing keys come from `<issuer>/.well-known/openid-configuration` (`jwks_uri`), cached and refreshed at most once a minute when a token names an unknown key |
| `ENTRA_AUDIENCE` | none | Value the token's `aud` must contain: the application ID URI or client ID of the API registration |
| `API_ALLOWED_HOSTS` | `localhost,127.0.0.1,[::1]` | Host header hostnames the HTTP API accepts, for example `finance-api.<environment domain>` |
| `API_ALLOWED_ORIGINS` | `localhost,127.0.0.1,[::1]` | Origin hostnames the HTTP API accepts (requests without Origin pass) |
| `WEB_ROOT` | unset | Folder of a web build (`web/dist`) the API serves outside `/api` and `/auth`, with `index.html` for deep links, `immutable` caching for `/assets/`, `no-cache` with an ETag for the rest, and `nosniff`, `DENY` framing and `same-origin` referrer headers; the API image sets `/app/web/dist` |
| `MCP_ALLOWED_HOSTS` | `localhost,127.0.0.1,[::1]` | Host header hostnames the MCP HTTP server accepts |
| `MCP_ALLOWED_ORIGINS` | `localhost,127.0.0.1,[::1]` | Origin hostnames the MCP HTTP server accepts (requests without Origin pass) |
| `MCP_PUBLIC_URL` | the request's origin | Public origin of the MCP server behind a proxy, for example `https://mcp.example.com`; the protected resource metadata names `<origin>/mcp` as the resource |
| `MCP_SCOPES` | none | Comma-separated scopes listed as `scopes_supported` in the metadata, for example the API's `api://<client id>/access` scope |

An unknown or closed member is answered `403 { "error": "unknown member" }`; the web app then forgets the stored identity and asks again (in `entra` mode it returns to the sign-in screen and says the Google account is not linked).

In `entra` mode a token must be RS256, signed by a key of the issuer, with the configured `iss` and `aud`, not expired (60 s of clock skew) and an `oid` claim; anything else is `401 { "error": "invalid token: <reason>" }`, and `503` while the issuer's keys cannot be fetched. The `oid` maps to a member through `member.external_id` (migration `008`); a valid token whose `oid` names no active member is `403`. Reads are closed too: every API route answers `401` without a token except `GET /api/openapi.json` and `GET /api/health` (the MCP HTTP server gets its bearer with S8). A fresh ledger gets its members in one command whose shares add up to 100, audited as `system` (a duplicate open name is refused): `npm run member:add -- Marcio 50 Gabriela 50`. Link each person once, also as `system`: `npm run member:link -- Marcio <object id>`.

## Web app

`web/` is an npm workspace with the React 19 app (Vite, TypeScript strict, Vitest). Run the API and the web dev server side by side:

```sh
npm run api:http
npm run web:dev
```

Vite serves `http://localhost:5173` and proxies `/api` to the API on `127.0.0.1:3200` (`API_PORT`), so the browser talks to one origin and no CORS is needed. `npm run web:build` writes `web/dist`. `createApi` (`web/src/api/client.ts`) is the typed client (`openapi-fetch`), sending `x-member` when a member is given. `npm test` and `npm run check` cover the API and the web app.

The design tokens of `docs/design.md` live in `web/src/styles.css` as CSS variables for light and dark, mapped into Tailwind v4 `@theme` (`bg-surface`, `text-muted`, `rounded-card`, `text-kpi`, the `amount` utility for tabular Geist Mono). Geist and Geist Mono are self-hosted from `@fontsource-variable`. The theme follows the system until a choice is stored in the browser (`finance.theme`). pt-BR formatters for money, dates and months are in `web/src/lib/format.ts`.

The app shell (`web/src/shell`) routes the six screens with TanStack Router (`/`, `/contas`, `/lancamentos`, `/patrimonio`, `/decisoes`, `/atividade`): a sidebar from 768 px, a bottom tab bar below. The month and the member filter live in the URL (`?month=2026-10&member=Marcio`) and follow every navigation. The local identity picker ("Você é") is remembered per browser (`finance.member`) and sent as `x-member`. The audit log (Atividade and the recent activity card) is read only once a member is chosen. Server data goes through TanStack Query; `QueryView` gives every screen the same skeleton, empty and error states.

The build is an installable PWA (`vite-plugin-pwa`, manifest "Caixa", icons generated by `npm run icons -w web` into `web/public`): the service worker precaches the app shell and answers GET `/api/*` network first, falling back to the last response for up to 7 days, so the screens already visited open offline. Each screen is its own chunk, loaded when its route is first visited. The overview chart (Recharts) loads only on screens 768 px and wider. `cd web && npx playwright test -g budget` checks the first-load budget: 150 kB of gzip JS on a phone, 240 kB on desktop, 60 kB of fonts, FCP under 1.8 s, LCP under 2.5 s and a precache under 1.1 MiB, the same for the `entra` build.

The web app reads its identity mode at build time. `VITE_AUTH_MODE=local` (the default) keeps the identity picker and `x-member`. `VITE_AUTH_MODE=entra` signs in through the API (backend for frontend, ADR-010 option 1) and carries no Entra setting of its own: the app asks `GET /api/me` and, on `401`, shows only a sign-in screen whose "Entrar com Google" navigates to `/auth/login?to=<current path>`; the API runs the authorization code flow with PKCE against the provider and comes back to that path with an `HttpOnly`, `SameSite=Lax` session cookie (`finance.session`, eight hours, `Secure` outside localhost), which every `/api` call then carries (`credentials: 'same-origin'`, no token in the browser). A failed callback comes back to `/?entrada=falhou` and the sign-in screen says "Não foi possível concluir a entrada. Tente de novo."; a later `401` says the session ended, a `403 unknown member` says the Google account is not registered. Sair posts `/auth/logout` (writes with the cookie need an `Origin`), follows the provider's `logout_url` and clears the query cache and the service worker's `api` cache, which never answers `/api` or `/auth` navigations. In `entra` mode the API needs `ENTRA_ISSUER`, `ENTRA_AUDIENCE`, `ENTRA_CLIENT_ID` and `SESSION_KEY` (32 random bytes in base64; `ENTRA_CLIENT_SECRET`, `ENTRA_SCOPES` and `API_PUBLIC_URL` are optional) and still accepts bearer tokens; the MCP server needs only the first two. Playwright builds a second preview in `entra` mode on port 4274 (`web/dist-entra`, proxying `/api` and `/auth`) that talks to a second API in `entra` mode on port 3291 (`E2E_ENTRA_API_PORT`, same `finance_e2e` database) whose issuer is a fake OpenID provider for tests only (`web/e2e/issuer.ts`, port 3292, `E2E_ISSUER_PORT`): it makes a throwaway RSA key at start and serves discovery, keys, authorize (member from an `e2e.member` cookie the specs set on the issuer origin), token (checks the client, the redirect URI and the PKCE verifier) and logout, so `e2e/entra.spec.ts` signs in through the API as Marcio or Gabriela (linked with `member:link` to fixed fictional object ids), opens every screen with the cookie, writes, comes back to the screen that asked for the sign-in and signs out, and `e2e/sign-in.spec.ts` checks the redirect and the failed callback. The suite has two Playwright projects: `local` (port 4273, `x-member`) and `entra` (port 4274, session cookie), and every spec runs in both except the sign-in and `entra` specs (`entra` only) and the tests tagged `@local` (the identity picker). Specs open contexts with `memberContext` from `web/e2e/context.ts`: in `local` it stores the member for the picker, in `entra` it signs in once per member through the fake issuer and reuses the cookie storage state; members are linked lazily after every reseed. Screenshots are written by the `local` project only (the `entra` project keeps its own under `test-results/`). `npx playwright test --project=local` runs one project.

`npm run web:screenshots` starts the API and `vite preview` over the seeded database and writes `web/screenshots/<screen>-<width>-<theme>.png` with Playwright (Chromium from `/opt/pw-browsers/chromium`, or `PLAYWRIGHT_CHROMIUM`).
