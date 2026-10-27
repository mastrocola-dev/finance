# Memory

## Session setup (cloud container, each run, one command per Bash call)

- No `add_repo` tool: repo is at /home/claude/finance; `git fetch origin && git checkout -B poc origin/poc`. `npm i -g node@24` then `hash -r` (Node 22 preinstalled)
- `pg_ctlcluster 16 main start`; `su postgres -c "psql -c \"alter user postgres password 'local'\""`; `cp .env.example .env`; `npm ci`; `npm run db:reset`; `npm run db:seed` (189 entries, 4 decisions)
- `export UV_SYSTEM_CERTS=1; unset UV_NATIVE_TLS` then `uv sync` in `ingest/` before any test (else ingest tests fail with `SdkError: Connection closed`)
- `npm test` takes about 3 minutes: `timeout 590` with a 600000 ms Bash timeout, output to a log file, read exit codes from the log, never through `| tail`. Single file: `node --env-file=.env --test test/x.test.ts`; web: `cd web && npx vitest run src/setup`
- Playwright: `cd web && timeout 590 npx playwright test` (about 3 min, builds, starts API and preview, reseeds the dev DB in flow/import specs). Only the screens you touched should change PNGs: they are byte-stable (fixed clock, `--disable-partial-raster`); a changed PNG is a real change. Read a few before committing
- Use `./node_modules/.bin/biome` (`check --write <paths>` fixes format and imports), never `npx biome`. `curl` to local servers needs `--noproxy '*'`; stop servers by pid, never `pkill -f`
- `npm run openapi` after any route change (regenerates `openapi.json` and `web/src/api/schema.ts`)

## Sprint S1–S5 (author approved 2026-10-26)

- S1 done 2026-10-27. Next run: S2, then S3, S4, S5. When S5 is done, Next is empty: stop the schedule (`list_triggers`, task "finance build agent", `update_trigger enabled false`). Never promote Later items: the author parks them until review
- S3 notes: CI must run the same commands as local, including `npm run ingest:check`, `ingest:test`, `web:build` and the budget spec; e2e should get its own database name (flow/import specs reseed through `npm run db:reset && db:seed` with `cwd: '..'`)
- S4/S5: Terraform, Docker and registries cannot run in a Claude session; say so in the report

## Architecture facts the code does not make obvious

- Every ledger write goes through `write(client, actor, (ledger) => ...)` (one transaction plus `audit_log`); it issues `begin`, so use a leased client and never nest `write()`. `ledger.update` and `ledger.close` refuse closed rows ("not found or closed")
- Nothing is deleted (triggers raise); lifecycle is `closed_at`; corrected entries close with `replaced_by`. Lookups by name use `lower()` and `closed_at is null`
- Since migration 007, category (name, kind), account nickname and number, reserve and goal names are unique only among open rows, case-insensitive; a closed name can be registered again
- Setup records: `src/ledger/setup.ts` (`registerRecord`, `editRecord` in place with `columns` per kind, `closeRecord`, `listSetup`); payload schemas come from `src/import/candidate.ts` (`text`, `balance`, `dayOfMonth` exported) and rows from `rowOf` in `src/import/commit.ts` (Later P04 moves them)
- Identity today: `x-member` header; writes need a member (401 without). API port 3200, MCP 3100; `RuleError` maps to 422, other errors 500 without details
- New API route: `route({...}, handler)` in `src/http/api.ts`, schemas in `contract.ts`, a sample in `test/http/openapi.test.ts` (routes run in declaration order; `RECORD`, `ENTRY`, `IMPORT` placeholders). New MCP write tools: `src/mcp/server.ts` and the tool lists in `test/mcp/server.test.ts` and `test/mcp/http.test.ts`; read tools only in `src/mcp/read.ts`
- Seed time comes from `setClock`/`FINANCE_CLOCK`; Playwright contexts must use `openContext(browser, options)` from `web/e2e/context.ts`
- MCP output is JSON text; bigint money becomes `{ cents, brl }` except `id` (string)

## Web conventions

- Tokens only (`bg-surface`, `text-muted`, `rounded-card`); default Tailwind colors and shadows are cleared; new tokens also go into `extendTailwindMerge` in `web/src/lib/utils.ts`
- Data: `useIdentity().api` typed client, `unwrap(await api.GET(...))` in `useQuery`, render with `QueryView`. App tests render `<App history={createMemoryHistory(...)} fetch={stub} />`; stubs must return full API shapes
- Forms: `CandidateForm` (`web/src/imports/candidate-form.tsx`) is shared by import review, Novo cadastro and setup edit; pass `fields` to override `fieldsOf[kind]`; `toValues`, `toPayload`, `serverErrors` take the same optional `fields`
- e2e confirm dialogs: `page.once('dialog', (dialog) => dialog.accept())`. Mobile shell: `main` has `pb-28` for the tab bar

## Python and evals

- `ingest/` is a uv project (`npm run ingest:test`, `ingest:check`; ruff single quotes). Runtime ingest uses `.venv-runtime` via `ingestRuntime`; never run `--exact` against the dev `.venv`
- Eval fixtures (`evals/tools/fixtures.py`, `npm run eval:fixtures`) are written uncompressed since 2026-10-27 because uv's Python moved to zlib-ng; a node test compares bytes, so any openpyxl/lxml/fpdf2 pin change regenerates and commits them
- No Anthropic key in these sessions: tests use recorded responses and `test/import/fake-agent.ts`

## Status

- Tests after S1: 266 node, 169 web, 127 Playwright, 63 pytest; `npm run check` green; failing-test run streak 0
- Needs author items stand as written in BACKLOG; none blocks S2
