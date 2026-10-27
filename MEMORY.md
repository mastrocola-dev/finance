# Memory

## State

- Sprint S6–S10 in progress (approved 2026-10-27). S6 and S7a done (API closed in `entra` mode); S7 was split, next is S7b (web sign-in with MSAL, rerun full Playwright). The schedule stops itself after S10
- Tests after S7a: 299 node, 173 web, 131 Playwright (not rerun since S3; S7b must rerun it), 63 pytest; `npm run check` green; failing-test run streak 0

## Session setup (cloud container, each run, one command per Bash call)

- No `add_repo` tool: repo is at /home/claude/finance; `git fetch origin && git checkout -B poc origin/poc`. `npm i -g node@24` then `hash -r` (Node 22 preinstalled)
- `pg_ctlcluster 16 main start`; `su postgres -c "psql -c \"alter user postgres password 'local'\""`; `cp .env.example .env`; `npm ci`; `npm run db:reset`; `npm run db:seed` (189 entries, 4 decisions)
- `export UV_SYSTEM_CERTS=1; unset UV_NATIVE_TLS` then `uv sync` in `ingest/` before any test (else ingest tests fail with `SdkError: Connection closed`)
- `npm test` takes about 3 minutes: `timeout 590` with a 600000 ms Bash timeout, output to a log file, read exit codes from the log. Single file: `node --env-file=.env --test test/x.test.ts`; web: `cd web && npx vitest run src/setup`
- Playwright: `cd web && timeout 590 npx playwright test` (about 4 min; own `finance_e2e`, API on 3290, preview on 4273; reuses servers on those ports outside CI). PNGs are byte-stable; a changed PNG is a real change
- `./node_modules/.bin/biome check --write <paths>`, never `npx biome`. `curl` to local servers needs `--noproxy '*'`; stop servers by pid (node processes show as `MainThread` in `pgrep`, so `pgrep node` misses them)
- `npm run openapi` after any route change
- Docker: `setsid dockerd &` starts a daemon, but Docker Hub and ghcr.io answer 403 through the proxy, so no image can be built. To check the image layout, copy the files the `Dockerfile` copies to a folder outside `/tmp/claude-0` (mode 700), `npm ci --omit=dev --workspaces=false`, sync the runtime venv, and run as `nobody` with a writable `HOME`
- Terraform cannot be downloaded; `test/infra/terraform.test.ts` stands in for `fmt -check`

## Architecture facts the code does not make obvious

- Every ledger write goes through `write(client, actor, (ledger) => ...)` (one transaction plus `audit_log`); use a leased client and never nest `write()`. `ledger.update` and `ledger.close` refuse closed rows
- Nothing is deleted (triggers raise); lifecycle is `closed_at`; corrected entries close with `replaced_by`. Names unique only among open rows, case-insensitive (migration 007)
- Setup records: `src/ledger/setup.ts`; payload schemas from `src/import/candidate.ts`, rows from `rowOf` in `src/import/commit.ts` (Later P04 moves them)
- Identity: `identify(client, request, verify)` in `src/http/identity.ts`; `verifierFor(AUTH_MODE)` gives `localVerifier` or `entraVerifier(rules)` (`src/http/auth.ts`: `bearerOf`, `verifyToken`, `jwksOf`). A `Verifier` carries `credential` used in the 401 text. Writes and `identified: true` routes need a member (401); in `entra` every route but `open: true` ones (openapi, health) does (`Verifier.openReads` false); unknown/closed 403. API 3200, MCP 3100; `RuleError` 422
- Entra tests sign RS256 tokens with `generateKeyPairSync` and a stub key source (`test/http/auth.test.ts`); reuse `tokenOf` there for S7/S8 route tests. `member.external_id` is set only by `linkMember` (`src/db/link-member.ts`)
- The API accepts only localhost Host and Origin (L177); MCP hosts come from `MCP_ALLOWED_HOSTS`/`MCP_ALLOWED_ORIGINS`
- New API route: `route({...}, handler)` in `src/http/api.ts`, schemas in `contract.ts`, a sample in `test/http/openapi.test.ts`. New MCP write tools: `src/mcp/server.ts` plus tool lists in `test/mcp/server.test.ts` and `test/mcp/http.test.ts`
- Seed time from `setClock`/`FINANCE_CLOCK`; Playwright contexts use `openContext` from `web/e2e/context.ts`
- Images: `Dockerfile` targets `api` (uv, Python 3.13 in `/opt/python`, `ingest/.venv-runtime`, `UV_OFFLINE=1`, uploads `/app/.imports`) and `mcp`; `.dockerignore` is an allow list, so a new runtime folder must be added there and in `test/infra/docker.test.ts`. `ingestRuntime` passes only `UV_SYSTEM_CERTS`, `UV_OFFLINE` and `UV_PROJECT_ENVIRONMENT` to uv
- Infra env per app lives in `local.apps` of `infra/main.tf`; CI jobs: `check`, `images`, `infra`

## Web conventions

- Tokens only (`bg-surface`, `text-muted`, `rounded-card`); new tokens also go into `extendTailwindMerge` in `web/src/lib/utils.ts`
- Data: `useIdentity().api`, `unwrap(await api.GET(...))` in `useQuery`, render with `QueryView`. App tests render `<App history={createMemoryHistory(...)} fetch={stub} />` with full API shapes
- Forms: shared `CandidateForm` (`web/src/imports/candidate-form.tsx`) with optional `fields`
- `docs/acceptance.md` must name every screen of `web/src/shell/nav.ts` as `**Title** (\`/path\`)` and every mockup file (test)

## Python and evals

- `ingest/` is a uv project; runtime ingest uses `.venv-runtime` via `ingestRuntime`; never run `--exact` against the dev `.venv`
- Eval fixtures are written uncompressed; a pin change of openpyxl/lxml/fpdf2 regenerates them
- No Anthropic key here: tests use recorded responses and `test/import/fake-agent.ts`
