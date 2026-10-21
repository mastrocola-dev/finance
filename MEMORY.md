# Memory

Rewritten by every run, at most 60 lines. Only what the next run needs and cannot see in the code.

## Session setup (cloud container, each run)

- No `add_repo`/`register_repo_root` tools in these runs (ToolSearch finds neither). The repo already exists at /home/claude/finance: `git fetch origin && git checkout -B poc origin/poc`
- Node 22 is preinstalled: `npm i -g node@24` then `hash -r` (about a minute; 24.22.0 on 2026-10-20)
- PostgreSQL 16: `pg_ctlcluster 16 main start`, then `su postgres -c "psql -c \"alter user postgres password 'local'\""`, then `cp .env.example .env` (gitignored)
- Run setup commands one per Bash call; long chained commands were refused by the classifier
- `npm ci` then `npm run db:reset` and `npm run db:seed`; baseline is 130 node tests plus 38 web (Vitest) tests; seed has 189 entries
- `curl` to local servers needs `--noproxy '*'` (the agent proxy answers 404 otherwise); stop servers by pid, `pkill -f` matched the calling shell and killed the call
- Use `./node_modules/.bin/biome`, not `npx biome`: npx stalled a call for 3 minutes
- Web deps install with `npm i -w web ...` (add `-S` for runtime deps: a first `-w` install put react as a peer only); root scripts forwarding to the workspace need a trailing `--` or npm swallows flags
- Single test file: `timeout 200 node --env-file=.env --test test/mcp/demo.test.ts` (capture to a log file and read the tail; piping through grep printed nothing once)
- `tsconfig` has `erasableSyntaxOnly`: no constructor parameter properties, enums or namespaces
- `biome check --write <paths>` fixes import order; `biome ci` rejects `!` non-null assertions in tests (use `assert.ok` to narrow); check exit codes from a log file, never through `| tail` (a run once pushed with `biome ci` red)

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
- W05: screenshots with `cd web && timeout 400 npx playwright test` (about 15 s; it builds, starts API and preview, stops them after). Names are `<screen>-<width>-<theme>.png` with screen overview, bills, entries, net-worth, decisions, activity; the spec stores `finance.member=Marcio` first. Read a few PNGs before committing
- W05 routing: code-based TanStack Router (no router plugin, not on the list); `Link` sets `aria-current="page"` on its own and `to="."` is always active, so filters and month arrows are buttons calling `navigate({ to: '.', search })`; type the search callback `(previous: AppSearch)`. Root `validateSearch: parseSearch` plus `retainSearchParams(['month', 'member'])`; read with `useSearch({ from: '__root__' })`, month via `monthOf`
- W05 data: `useIdentity().api` is the typed client with `x-member`; wrap calls with `unwrap(await api.GET(...))` in `useQuery`; render with `QueryView` (skeleton, empty, error with retry). App tests render `<App history={createMemoryHistory(...)} fetch={stub} />`; pin the month in the URL, never rely on the clock
- Mobile shell: top bar (brand, compact identity, theme) is not in the mockups but needed for identity and theme under 768 px; `main` has `pb-28` for the fixed tab bar
- W04: `ui.shadcn.com` is blocked by the proxy (L49); shadcn files are hand-written. Extra deps: `class-variance-authority`, `clsx`, `tailwind-merge` (shadcn's own), `@fontsource-variable/geist(-mono)`, `lucide-react`. Tokens are Tailwind names without prefix (`bg-surface`, `text-muted`, `text-meta`, `rounded-card`); default Tailwind colors and shadows are cleared, so `bg-white`, `shadow` do not exist. A new token must also go into `extendTailwindMerge` in `web/src/lib/utils.ts` or `cn` drops classes. Dark mode is the `.dark` class on `<html>`; web `biome.json` enables `css.parser.tailwindDirectives`; Biome wants `<fieldset>` over `role="group"`
- W02: `openapi-typescript` 7 peers on TypeScript 5, so npm nested `typescript@5.9` in `web/node_modules`; root `check` therefore runs `tsc -p web` (root TypeScript 7) and the web package has no `typecheck` script. `openapi.json` (root `biome.json`) and `web/src/api/schema.ts` (`web/biome.json`, the nested config owns web paths) are generated and excluded from Biome
- W02: response schemas are `z.strictObject` of the wire shape (after `toJson`); request schemas reuse `month`, `date`, `id`, `today` from `src/mcp/schema.ts`; components are the keys of `schemas` plus `<OperationId>Body`/`<OperationId>Response` for unnamed ones; the error component is `ApiError` (a component named `Error` shadowed the global type)
- W06a: overview in `web/src/overview/` (pure `model.ts`/`activity.ts`, one card per file, `Card` wrapper); one query reads current plus previous month entries; a chosen member means that member's own entries only (L55); entries wait for `/api/members` so no unfiltered flash. Web test stubs must return full API shapes (the overview reads `awaiting` etc. directly). Screenshot spec waits for `[aria-busy]` to clear. Overview only: `npx playwright test -g overview`
- W06b: Recharts 3.10 (on the list); chart is plain `BarChart` with no axes, `accessibilityLayer={false}` (it adds a tabindex inside our `role="img"`), colors `var(--color-income|expense)`, HTML grids above/below for net and month labels (band scale aligns with equal grid columns at zero margins). The flow card is hidden under 768 px (not in `MobileOverview`). Overview desktop rows: flow + bills, then categories + side column (settlement, decisions, activity); `MonthCategories` returns null for an empty month. Seed Pharmacy (joint, `Marcio card`, Health, day 3) feeds the split; seed totals asserted in node tests: Oct expenses 1037100, Sep 1021500
- W03: settlement counts only paid joint expenses on member-owned accounts (Needs author); the seed has none, so split is empty over the seed (L44). Audit `next` is a string cursor (bigint would become money via `toJson`); counts ignore the author filter and cursor so filter chips keep their numbers

## Notes for next items

- All ledger writes go through `write(client, actor, (ledger) => ...)`; it issues `begin`, so it needs a leased client (`await pool.connect()` then `release()`); nested `write()` on the same client would nest (L05). Compose inside one `write()` with `entryValues` and `ledger.create`
- Write commands in `src/ledger/record.ts` (`createEntry`, `entryValues`, `markPaid`, `updateReserve`, `proposeDecision`, `confirmDecision`, `rejectDecision`, `withdrawDecision`); `forecastMonth` in `forecast.ts`; `importMonth` in `src/import/month.ts`
- A new API route: declare it with `route({ method, path, operationId, summary, params, query, body, response, status }, handler)` in `src/http/api.ts`, schemas in `contract.ts`, add a sample to `test/http/openapi.test.ts`, run `npm run openapi`
- Write tools are registered in `src/mcp/server.ts`; read tools only in `src/mcp/read.ts` (`registerReads`), so any new read tool reaches the demo automatically
- `connectPool(url, true)` gives a read-only pool; `pg` returns `bigint` as `BigInt`, `date` as string, `timestamptz` as `Date`, `numeric` as string; `count(*)` needs `::int`
- New read model: put the query in `src/ledger/<name>.ts`, cast sums `::bigint` (else numeric string) and non-money bigints `::text`
- Seeded test DB: `testDatabase()` then `seed(db.client)` (`test/db/database.ts`); API tests use `serveApi(pool, 0, '127.0.0.1')` and `fetch`
- `formatBrl` exists twice on purpose (src/ledger/money.ts and web/src/lib/format.ts, same output); the API already sends `brl` text, cents as string

## Status

- Tests: 130 node plus 38 web after W06b; `npm run check`, `web:build` and the overview screenshots green (other screens unchanged since W05)
- 2026-10-20: the author approved the web app (W01–W13 in BACKLOG), the design in `docs/design.md` and `docs/mockups/`, and rules in CLAUDE.md "Web app"
- Later items stay parked until the web app is done, except where a W item needs one (L32, L52, L58, L59 are good candidates; L60 belongs to W12)
- Failing-test run streak: 0
