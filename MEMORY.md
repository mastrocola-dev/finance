# Memory

Rewritten by every run, at most 60 lines. Only what the next run needs and cannot see in the code.

## Session setup (cloud container, each run)

- No `add_repo`/`register_repo_root` tools in these runs (ToolSearch finds neither). The repo already exists at /home/claude/finance: `git fetch origin && git checkout -B poc origin/poc`
- Node 22 is preinstalled: `npm i -g node@24` then `hash -r` (about a minute; 2026-10-19 run: 24.22.0 worked)
- PostgreSQL 16: `pg_ctlcluster 16 main start`, then `su postgres -c "psql -c \"alter user postgres password 'local'\""`, then `cp .env.example .env` (gitignored)
- Run setup commands one per Bash call; long chained commands were refused by the classifier
- `npm ci` then `npm run db:reset` and `npm run db:seed`; baseline is 130 node tests plus 14 web (Vitest) tests
- `curl` to local servers needs `--noproxy '*'` (the agent proxy answers 404 otherwise); stop servers by pid, `pkill -f` matched the calling shell and killed the call
- Use `./node_modules/.bin/biome`, not `npx biome`: npx stalled a call for 3 minutes
- Web deps install with `npm i -w web ...` (add `-S` for runtime deps: a first `-w` install put react as a peer only); root scripts forwarding to the workspace need a trailing `--` or npm swallows flags
- Single test file: `timeout 200 node --env-file=.env --test test/mcp/demo.test.ts` (capture to a log file and read the tail; piping through grep printed nothing once)
- npm, PyPI and Ubuntu apt are reachable; Docker Hub, mcr.microsoft.com and packages.microsoft.com are not
- `tsconfig` has `erasableSyntaxOnly`: no constructor parameter properties, enums or namespaces
- `biome check --write <paths>` fixes import order; `biome ci` rejects `!` non-null assertions in tests (use `assert.ok` to narrow)

## Decisions taken so far (for the author to review)

- Lifecycle is `closed_at timestamptz` (null = active) on every table; `entry.status` is the payment status (planned, paid, late); a corrected entry is closed with `replaced_by`
- Deletes and truncates raise through triggers; `audit_log` and `decision_confirmation` are immutable
- `audit_log.author` is member, claude, import or system; member and claude require `member_id`
- Joint split lives in `member.share_percent`; null `member_id` on account, entry, expense or debt means joint
- `decision.status` proposed, confirmed, rejected, withdrawn; closing a decision must set status in the same `close` call (DB check)
- Account, institution, nickname and creditor reject any run of 5+ digits; migrations forward-only; share sum 100 enforced in `write()` at commit
- MCP output is JSON text; every bigint becomes `{ cents, brl }` except key `id` (string); read models camelCase
- F09: REST writes audited as `member` (origin `manual`); API port 3200, MCP 3100; `RuleError` maps to 422, other errors 500 without details
- F10a: `read-excel-file` 9.3.12 over `xlsx`. Layout is one sheet per month named `YYYY-MM`, header `kind, description, category, account, member, due_on, amount`
- F10b (author to confirm, see BACKLOG Needs author): optional 8th header `installment`; optional `total` row checked against the lines; a month is importable once; import runs as actor `import` via `importMonth`
- F11: demo is stdio only (`src/mcp/demo.ts`, `npm run mcp:demo`), reads only, pool opened with `default_transaction_read_only=on`; shared read tools live in `src/mcp/read.ts`, zod helpers in `src/mcp/schema.ts`
- W01: no `@vitejs/plugin-react` (not on the CLAUDE.md list; Vite's built-in JSX transform, no Fast Refresh). Extra deps beyond the list: `vite` (named by W01), `@types/react`, `@types/react-dom`, `@testing-library/dom` (peer of Testing Library). Web tsconfig uses `moduleResolution: bundler`, `jsx: react-jsx`, types `vite/client` and `node`; root `tsc` still covers only `src` and `test`
- W04: Playwright is not a dependency yet; screenshots were taken with `playwright-core` installed in the scratchpad, `vite preview --port 4173` after `npm run web:build`, `colorScheme` per theme, waiting `document.fonts.ready`
- W04: `ui.shadcn.com` is blocked by the proxy (L49); shadcn files are hand-written. Extra deps: `class-variance-authority`, `clsx`, `tailwind-merge` (shadcn's own), `@fontsource-variable/geist(-mono)`, `lucide-react`. Tokens are Tailwind names without prefix (`bg-surface`, `text-muted`, `text-meta`, `rounded-card`); default Tailwind colors and shadows are cleared, so `bg-white`, `shadow` do not exist. A new token must also go into `extendTailwindMerge` in `web/src/lib/utils.ts` or `cn` drops classes. Dark mode is the `.dark` class on `<html>`; web `biome.json` enables `css.parser.tailwindDirectives`; Biome wants `<fieldset>` over `role="group"`
- Vite config paths: `fileURLToPath(import.meta.url)` plus `node:path` (a `new URL('./src', import.meta.url)` failed under Vitest)
- W02: `openapi-typescript` 7 peers on TypeScript 5, so npm nested `typescript@5.9` in `web/node_modules`; root `check` therefore runs `tsc -p web` (root TypeScript 7) and the web package has no `typecheck` script. `openapi.json` (root `biome.json`) and `web/src/api/schema.ts` (`web/biome.json`, the nested config owns web paths) are generated and excluded from Biome
- Check exit codes from a log file, never through `| tail`: the 2026-10-20 W02 run pushed with `biome ci` red behind a pipe and needed a second fix commit
- W02: response schemas are `z.strictObject` of the wire shape (after `toJson`); request schemas reuse `month`, `date`, `id`, `today` from `src/mcp/schema.ts`; components are the keys of `schemas` plus `<OperationId>Body`/`<OperationId>Response` for unnamed ones; the error component is `ApiError` (a component named `Error` shadowed the global type)
- W03: settlement counts only paid joint expenses on member-owned accounts (Needs author); the seed has none, so split is empty over the seed (L44). Audit `next` is a string cursor (bigint would become money via `toJson`); counts ignore the author filter and cursor so filter chips keep their numbers
- Commit trailer: Co-Authored-By Claude Opus 5.5 (named by the scheduled prompt)

## Notes for next items

- All ledger writes go through `write(client, actor, (ledger) => ...)`; it issues `begin`, so it needs a leased client (`await pool.connect()` then `release()`); nested `write()` on the same client would nest (L05). Compose inside one `write()` with `entryValues` and `ledger.create`
- Write commands in `src/ledger/record.ts` (`createEntry`, `entryValues`, `markPaid`, `updateReserve`, `proposeDecision`, `confirmDecision`, `rejectDecision`, `withdrawDecision`); `forecastMonth` in `forecast.ts`; `importMonth` in `src/import/month.ts`
- A new API route: declare it with `route({ method, path, operationId, summary, params, query, body, response, status }, handler)` in `src/http/api.ts`, schemas in `contract.ts`, add a sample to `test/http/openapi.test.ts`, run `npm run openapi`
- Write tools are registered in `src/mcp/server.ts`; read tools only in `src/mcp/read.ts` (`registerReads`), so any new read tool reaches the demo automatically
- `connectPool(url, true)` gives a read-only pool; `pg` returns `bigint` as `BigInt`, `date` as string, `timestamptz` as `Date`, `numeric` as string; `count(*)` needs `::int`
- New read model: put the query in `src/ledger/<name>.ts`, cast sums `::bigint` (else numeric string) and non-money bigints `::text`
- Seeded test DB: `testDatabase()` then `seed(db.client)` (`test/db/database.ts`); API tests use `serveApi(pool, 0, '127.0.0.1')` and `fetch`
- API tests change the seeded reserve balance (test order matters)
- `formatBrl` exists twice on purpose (src/ledger/money.ts and web/src/lib/format.ts, same output); the API already sends `brl` text, cents as string

## Status

- Tests: 130 node plus 14 web after W04; `npm run check` and `npm run web:build` green
- 2026-10-20: the author approved the web app (W01–W13 in BACKLOG), the design in `docs/design.md` and `docs/mockups/`, and rules in CLAUDE.md "Web app". The schedule was re-enabled on Opus
- The Later items stay parked until the web app is done, except where a W item needs one (L32 not-found 404, L33 shared JSON shape, L34 one process are good candidates)
- Failing-test run streak: 0
