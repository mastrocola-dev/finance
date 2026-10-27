# Memory

## Session setup (cloud container, each run, one command per Bash call)

- No `add_repo` tool: repo is at /home/claude/finance; `git fetch origin && git checkout -B poc origin/poc`. `npm i -g node@24` then `hash -r` (Node 22 preinstalled)
- `pg_ctlcluster 16 main start`; `su postgres -c "psql -c \"alter user postgres password 'local'\""`; `cp .env.example .env`; `npm ci`; `npm run db:reset`; `npm run db:seed` (189 entries, 4 decisions)
- `export UV_SYSTEM_CERTS=1; unset UV_NATIVE_TLS` then `uv sync` in `ingest/` before any test (else ingest tests fail with `SdkError: Connection closed`)
- `npm test` takes about 3 minutes: `timeout 590` with a 600000 ms Bash timeout, output to a log file, read exit codes from the log, never through `| tail`. Single file: `node --env-file=.env --test test/x.test.ts`; web: `cd web && npx vitest run src/setup`
- Playwright: `cd web && timeout 590 npx playwright test` (about 4 min; resets and seeds its own `finance_e2e`, API on 3290, preview on 4273, never the dev DB; reuses servers on those ports outside CI, so stop a stale e2e API after changing server code). Only the screens you touched should change PNGs: they are byte-stable (fixed clock, `--disable-partial-raster`); a changed PNG is a real change. Read a few before committing
- Use `./node_modules/.bin/biome` (`check --write <paths>` fixes format and imports), never `npx biome`. `curl` to local servers needs `--noproxy '*'`; stop servers by pid, never `pkill -f`
- `npm run openapi` after any route change (regenerates `openapi.json` and `web/src/api/schema.ts`)

## Sprint S1–S5 (author approved 2026-10-26)

- S1, S2, S3 done 2026-10-27. Next run: S4 (Terraform), then S5. When S5 is done, Next is empty: stop the schedule (`list_triggers`, task "finance build agent", `update_trigger enabled false`). Never promote Later items: the author parks them until review
- S3: `.github/workflows/ci.yml` mirrors the local commands; action majors are a guess (Needs author). S5's acceptance/Dockerfile must not break the workflow; any new check script goes into the workflow too
- S4/S5: Terraform, Docker and registries cannot run in a Claude session; say so in the report. The API still accepts only localhost Host/Origin (Later L177): S4/S5 must flag it in Needs author or the Container App answers 403

## Architecture facts the code does not make obvious

- Every ledger write goes through `write(client, actor, (ledger) => ...)` (one transaction plus `audit_log`); it issues `begin`, so use a leased client and never nest `write()`. `ledger.update` and `ledger.close` refuse closed rows ("not found or closed")
- Nothing is deleted (triggers raise); lifecycle is `closed_at`; corrected entries close with `replaced_by`. Lookups by name use `lower()` and `closed_at is null`
- Since migration 007, category (name, kind), account nickname and number, reserve and goal names are unique only among open rows, case-insensitive; a closed name can be registered again
- Setup records: `src/ledger/setup.ts` (`registerRecord`, `editRecord` in place with `columns` per kind, `closeRecord`, `listSetup`); payload schemas come from `src/import/candidate.ts` (`text`, `balance`, `dayOfMonth` exported) and rows from `rowOf` in `src/import/commit.ts` (Later P04 moves them)
- Identity: `identify(client, request, verify)` in `src/http/identity.ts`, verifier from `verifierFor(AUTH_MODE)` (only `local`; `token` is a refusing slot). Writes and routes with `identified: true` (`/audit`) need a member (401); unknown/closed 403. `api(client, imports, verify)`, `mcpHttp(client, { verify, hosts, origins })`. API port 3200, MCP 3100; `RuleError` maps to 422, other errors 500 without details
- Web: audit queries are `enabled` only with a chosen member; e2e specs that read Atividade need `finance.member` set; `IdentityProvider` clears a stale identity on 403 `unknown member`
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

- Tests after S3: 275 node, 173 web, 131 Playwright, 63 pytest; `npm run check` green. S2 had left the readme test red (missing `activity-guest-*` row; always run the full `npm test` before committing); failing-test run streak 0 after S3
- Needs author items stand as written in BACKLOG; none blocks S4
