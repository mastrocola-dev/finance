# Memory

## State

- Sprint S6–S10 in progress (approved 2026-10-27). S6 to S9b done; next is S10 (runbook and migration job). The schedule stops itself after S10
- Tests after S9b: 305 node, 199 web, 280 Playwright (137 `local` + 143 `entra`), 63 pytest; `npm test` and `npm run check` green; failing-test run streak 0

## Session setup (cloud container, each run, one command per Bash call)

- No `add_repo` tool: repo is at /home/claude/finance; `git fetch origin && git checkout -B poc origin/poc`. `npm i -g node@24` then `hash -r` (Node 22 preinstalled)
- `pg_ctlcluster 16 main start`; `su postgres -c "psql -c \"alter user postgres password 'local'\""`; `cp .env.example .env`; `npm ci`; `npm run db:reset`; `npm run db:seed` (189 entries, 4 decisions)
- `export UV_SYSTEM_CERTS=1; unset UV_NATIVE_TLS` then `uv sync` in `ingest/` before any test (else ingest tests fail with `SdkError: Connection closed`)
- `npm test` takes about 3 minutes: `timeout 590` with a 600000 ms Bash timeout, output to a log file, read exit codes from the log. Single file: `node --env-file=.env --test test/x.test.ts`; web: `cd web && npx vitest run src/setup`
- Playwright: the full run takes about 8 min, too close to the Bash limit: start it in the background (`timeout 1200 npx playwright test > log 2>&1; echo exit $? >> log` with `&`) and poll the log with `sleep`; `--project=local` alone is about 4 min. Own `finance_e2e`, reuses servers on 3290/3291/3292/4273/4274 outside CI. PNGs are byte-stable; a changed PNG is a real change
- `./node_modules/.bin/biome check --write <paths>`, never `npx biome`. `curl` to local servers needs `--noproxy '*'`; stop servers by pid (node processes show as `MainThread` in `pgrep`, so `pgrep node` misses them)
- `npm run openapi` after any route change
- Docker: `setsid dockerd &` starts a daemon, but Docker Hub and ghcr.io answer 403 through the proxy, so no image can be built. To check the image layout, copy the files the `Dockerfile` copies to a folder outside `/tmp/claude-0` (mode 700), `npm ci --omit=dev --workspaces=false`, sync the runtime venv, and run as `nobody` with a writable `HOME`
- Terraform cannot be downloaded; `test/infra/terraform.test.ts` stands in for `fmt -check`

## Architecture facts the code does not make obvious

- Every ledger write goes through `write(client, actor, (ledger) => ...)` (one transaction plus `audit_log`); use a leased client and never nest `write()`. `ledger.update` and `ledger.close` refuse closed rows
- Nothing is deleted (triggers raise); lifecycle is `closed_at`; corrected entries close with `replaced_by`. Names unique only among open rows, case-insensitive (migration 007)
- Setup records: `src/ledger/setup.ts`; payload schemas from `src/import/candidate.ts`, rows from `rowOf` in `src/import/commit.ts` (Later P04 moves them)
- MCP OAuth (S8a): `mcpHttp` options `publicUrl` (`MCP_PUBLIC_URL`) and `scopes` (`MCP_SCOPES`); metadata and the 401 challenge exist only when `verify.issuer` is set (entra). Route handlers get `verify` in their input (the OpenAPI route uses it for the bearer scheme). Goals are created through `createGoal` (wraps `registerRecord('goal', …)`)
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
- Identity: `IdentityProvider` gets `session?: Session` (`web/src/auth/session.ts`); without it the local picker and `x-member`, with it `SessionIdentity` (bearer via `createApi({ token })`, member from `GET /api/me`, `signOut` in context, `choose` absent). `main.tsx` imports `msal-session.ts` only behind a literal `import.meta.env.VITE_AUTH_MODE === 'entra'` check so local builds drop MSAL (keeps the precache budget); `@azure/msal-browser` is the one dependency outside the CLAUDE.md list, added by S7b because the item names it
- Tests of signed-in states pass a fake `Session` to `<App session={...} />` (`web/src/auth/sign-in.test.tsx`); MSAL itself is mocked with `vi.mock` in `msal-session.test.ts`
- Playwright servers: local API 3290, fake issuer 3292 (`web/e2e/issuer.ts`), entra API 3291 (`entraApiEnv`, same `finance_e2e`), preview 4273 and `entra` preview 4274 (`web/dist-entra`, proxies to 3291). `signIn(context, member)` routes `caixa-e2e.ciamlogin.com` to the issuer (forwards `x-public-origin`; the id token `iss` is the public one, the access token `iss` is `e2eIssuer.issuer`). Signed-in overview h1 is the month (`Outubro de 2026`), not the screen title
- Two projects (S9b): new specs open contexts with `memberContext(browser, options)` and call the API with `await memberHeaders(page)`, never `finance.member` or `x-member` directly; picker-only tests get `{ tag: '@local' }`; screenshot paths go through `shotPath` (or `fullShot`). `memberState` links members lazily after `reseed()` and caches the MSAL storage state per member and clock; `context.clock.setFixedTime` fakes `performance`, so timing tests use `memberState(browser, member, false)`
- New screenshot files must be added to the README table (`test/docs/readme.test.ts`); state screenshots live in their flow spec (`flow.spec.ts`, `goal.spec.ts`), not `screenshots.spec.ts`
- Vitest tests that depend on today use `vi.useFakeTimers({ toFake: ['Date'] })`; downloads are tested by assigning `URL.createObjectURL` and spying `HTMLAnchorElement.prototype.click`
- Forms: shared `CandidateForm` (`web/src/imports/candidate-form.tsx`) with optional `fields`
- `docs/acceptance.md` must name every screen of `web/src/shell/nav.ts` as `**Title** (\`/path\`)` and every mockup file (test)

## Python and evals

- `ingest/` is a uv project; runtime ingest uses `.venv-runtime` via `ingestRuntime`; never run `--exact` against the dev `.venv`
- Eval fixtures are written uncompressed; a pin change of openpyxl/lxml/fpdf2 regenerates them
- No Anthropic key here: tests use recorded responses and `test/import/fake-agent.ts`
