# Memory

## State

- S12 (go live) is one item in parts; A1, A2, B and C (API sign-in settings in `infra/`) done 2026-10-30; next is D (import in the Azure image), then E, F. Schedule stops after F
- Tests after S12 C: 334 node, 199 web, 282 Playwright (not rerun in C: infra and docs only), 63 pytest; `npm test` and `npm run check` green; failing-test run streak 0
- Do not run Playwright and `npm test` at the same time: vitest `findByText` times out under load (L213)
- Backlog L-numbers had duplicates (L207/L208 twice); renumbered to L212/L213 in C. Next free number: L214

## Session setup (cloud container, each run, one command per Bash call)

- No `add_repo` tool: repo is at /home/claude/finance; `git fetch origin && git checkout -B poc origin/poc`. `npm i -g node@24` then `hash -r` (Node 22 preinstalled)
- `pg_ctlcluster 16 main start`; `su postgres -c "psql -c \"alter user postgres password 'local'\""`; `cp .env.example .env`; `npm ci`; `npm run db:reset`; `npm run db:seed` (189 entries, 4 decisions)
- `export UV_SYSTEM_CERTS=1; unset UV_NATIVE_TLS` then `uv sync` in `ingest/` before any test (else ingest tests fail with `SdkError: Connection closed`)
- `npm test` takes about 3 minutes: `timeout 590` with a 600000 ms Bash timeout, output to a log file, read exit codes from the log. Single file: `node --env-file=.env --test test/x.test.ts`; web: `cd web && npx vitest run src/setup`
- Playwright: the full run takes about 8 min, too close to the Bash limit: start it in the background (`timeout 1200 npx playwright test > log 2>&1; echo exit $? >> log` with `&`) and poll the log with `sleep`; `--project=local` alone is about 4 min. Own `finance_e2e`, reuses servers on 3290/3291/3292/4273/4274 outside CI. PNGs are byte-stable; a changed PNG is a real change
- `./node_modules/.bin/biome check --write <paths>`, never `npx biome`. `curl` to local servers needs `--noproxy '*'`; stop servers by pid (node processes show as `MainThread` in `pgrep`, so `pgrep node` misses them)
- `npm run openapi` after any route change
- Never `pkill -f` a pattern that appears in the Bash command itself: it kills the shell (exit 144). Stop servers by pid
- Docker: `setsid dockerd &` starts a daemon, but Docker Hub and ghcr.io answer 403 through the proxy, so no image can be built. To check the image layout, copy the files the `Dockerfile` copies to a folder outside `/tmp/claude-0` (mode 700), `npm ci --omit=dev --workspaces=false`, sync the runtime venv, and run as `nobody` with a writable `HOME`
- Terraform cannot be downloaded; `test/infra/terraform.test.ts` stands in for `fmt -check`

## Architecture facts the code does not make obvious

- Every ledger write goes through `write(client, actor, (ledger) => ...)` (one transaction plus `audit_log`); use a leased client and never nest `write()`. `ledger.update` and `ledger.close` refuse closed rows
- Nothing is deleted (triggers raise); lifecycle is `closed_at`; corrected entries close with `replaced_by`. Names unique only among open rows, case-insensitive (migration 007)
- Setup records: `src/ledger/setup.ts`; payload schemas from `src/import/candidate.ts`, rows from `rowOf` in `src/import/commit.ts` (Later P04 moves them)
- MCP OAuth (S8a): `mcpHttp` options `publicUrl` (`MCP_PUBLIC_URL`) and `scopes` (`MCP_SCOPES`); metadata and the 401 challenge exist only when `verify.issuer` is set (entra). Route handlers get `verify` in their input (the OpenAPI route uses it for the bearer scheme). Goals are created through `createGoal` (wraps `registerRecord('goal', …)`)
- Web serving (S12 B): `site(WEB_ROOT)` in `src/http/site.ts`, 6th arg of `api()`, runs before identity for paths outside `/api` and `/auth`; the image builds the web in the `web` stage with `VITE_AUTH_MODE=entra`. Web sources the build needs must be in `.dockerignore` and the `web` stage `COPY`s. `web_url` output = API fqdn
- BFF session (S12 A1/A2): `src/http/session.ts` `session(config)` gives `handle` (`/auth/login|callback|logout`), `oidOf`, `carries`; any callback failure redirects to `signInFailed` (`/?entrada=falhou`). `verifierFor(mode, signIn)`: `api()` passes `signIn` true (entra then requires `ENTRA_CLIENT_ID` and `SESSION_KEY`), MCP passes nothing (bearer only). `api()` routes `/auth/*` to the session and refuses cookie writes without `Origin`. Tests stub the provider with a `fetcher` and sign id tokens (`test/http/session.test.ts` `provider`, `idToken`, `seal`)
- Identity: `identify(client, request, verify)` in `src/http/identity.ts`; `verifierFor(AUTH_MODE)` gives `localVerifier` or `entraVerifier(rules)` (`src/http/auth.ts`: `bearerOf`, `verifyToken`, `jwksOf`). A `Verifier` carries `credential` used in the 401 text. Writes and `identified: true` routes need a member (401); in `entra` every route but `open: true` ones (openapi, health) does (`Verifier.openReads` false); unknown/closed 403. API 3200, MCP 3100; `RuleError` 422
- Entra tests sign RS256 tokens with `generateKeyPairSync` and a stub key source (`test/http/auth.test.ts`); reuse `tokenOf` there for S7/S8 route tests. `member.external_id` is set only by `linkMember` (`src/db/link-member.ts`)
- Host and Origin checks: API from `API_ALLOWED_HOSTS`/`API_ALLOWED_ORIGINS` (`apiHosts`/`apiOrigins`, 4th and 5th args of `api()`), MCP from `MCP_ALLOWED_*`; both via `listOf` in `src/http/hosts.ts`, localhost fallback. Node `fetch` cannot set Host: tests use `node:http` `get`
- `write()` requires active member shares to sum to exactly 100 after any member change: `member:add` takes several `<name> <percent>` pairs in one write
- New API route: `route({...}, handler)` in `src/http/api.ts`, schemas in `contract.ts`, a sample in `test/http/openapi.test.ts`. New MCP write tools: `src/mcp/server.ts` plus tool lists in `test/mcp/server.test.ts` and `test/mcp/http.test.ts`
- Seed time from `setClock`/`FINANCE_CLOCK`; Playwright contexts use `openContext` from `web/e2e/context.ts`
- Images: `Dockerfile` targets `api` (uv, Python 3.13 in `/opt/python`, `ingest/.venv-runtime`, `UV_OFFLINE=1`, uploads `/app/.imports`) and `mcp`; `.dockerignore` is an allow list, so a new runtime folder must be added there and in `test/infra/docker.test.ts`. `ingestRuntime` passes only `UV_SYSTEM_CERTS`, `UV_OFFLINE` and `UV_PROJECT_ENVIRONMENT` to uv
- Infra env per app lives in `local.apps` of `infra/main.tf` (`env` values and a `secrets` map env name → Key Vault secret name, referenced by `vault_uri`; author-created secrets: `session-key`, `finance-web-secret`, `registry-password`), merged with `local.entra` (AUTH_MODE entra, ENTRA_*) in the `env` dynamic block (a `merge(x, {` literal breaks the fmt stand-in test); migration job `azurerm_container_app_job.migrate`; `test/infra/terraform.test.ts` requires every variable to appear in backticks in `docs/deploy-azure.md`. CI jobs: `check`, `images`, `infra`

## Web conventions

- Tokens only (`bg-surface`, `text-muted`, `rounded-card`); new tokens also go into `extendTailwindMerge` in `web/src/lib/utils.ts`
- Data: `useIdentity().api`, `unwrap(await api.GET(...))` in `useQuery`, render with `QueryView`. App tests render `<App history={createMemoryHistory(...)} fetch={stub} />` with full API shapes
- Identity: `IdentityProvider` gets `session?: Session` (`{ failed, signIn(to), signOut }`, `cookieSession()` in `web/src/auth/session.ts`, built by `main.tsx` when `VITE_AUTH_MODE=entra`); without it the local picker and `x-member`, with it `SessionIdentity` (cookie, member from `GET /api/me`, renders nothing while it loads, `signOut` in context, `choose` absent). No MSAL and no dependency outside the CLAUDE.md list any more
- Tests of signed-in states pass a fake `Session` to `<App session={...} />` with a fetch stub that answers 401 when signed out (`web/src/auth/sign-in.test.tsx`)
- Playwright servers: local API 3290, fake issuer 3292 (`web/e2e/issuer.ts`), entra API 3291 (`entraApiEnv`: client id, a fixed fictional `SESSION_KEY`, `API_PUBLIC_URL` of the preview), preview 4273 and `entra` preview 4274 (`web/dist-entra`, proxies `/api` and `/auth` to 3291). The browser goes to the issuer by a 302, and Playwright routes do not intercept redirect hops: `chooseMember` sets an `e2e.member` cookie on the issuer origin instead; inspect hops with `page.waitForRequest` and `redirectedFrom()`, read `set-cookie` with `headerValue`. Signed-in overview h1 is the month (`Outubro de 2026`)
- Two projects (S9b): new specs open contexts with `memberContext(browser, options)` and call the API with `await memberHeaders(page)`, never `finance.member` or `x-member` directly; picker-only tests get `{ tag: '@local' }`; screenshot paths go through `shotPath` (or `fullShot`). `memberState` links members lazily after `reseed()` and caches the cookie storage state per member and clock; `memberHeaders()` is `{}` in `entra` (`page.request` carries the context cookies); `context.clock.setFixedTime` fakes `performance`, so timing tests use `memberState(browser, member, false)`
- New screenshot files must be added to the README table (`test/docs/readme.test.ts`); state screenshots live in their flow spec (`flow.spec.ts`, `goal.spec.ts`), not `screenshots.spec.ts`
- Vitest tests that depend on today use `vi.useFakeTimers({ toFake: ['Date'] })`; downloads are tested by assigning `URL.createObjectURL` and spying `HTMLAnchorElement.prototype.click`
- Forms: shared `CandidateForm` (`web/src/imports/candidate-form.tsx`) with optional `fields`
- `docs/acceptance.md` must name every screen of `web/src/shell/nav.ts` as `**Title** (\`/path\`)` and every mockup file (test)

## Python and evals

- `ingest/` is a uv project; runtime ingest uses `.venv-runtime` via `ingestRuntime`; never run `--exact` against the dev `.venv`
- Eval fixtures are written uncompressed; a pin change of openpyxl/lxml/fpdf2 regenerates them
- No Anthropic key here: tests use recorded responses and `test/import/fake-agent.ts`
